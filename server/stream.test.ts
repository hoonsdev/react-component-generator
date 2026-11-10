import { describe, it, expect, vi } from 'vitest';
import {
  parseSSE,
  anthropicDelta,
  geminiDelta,
  encodeEvent,
  iterateSSE,
  mapError,
  streamToResponse,
} from './stream';

async function* fromArray(items: string[]): AsyncGenerator<string> {
  for (const item of items) yield item;
}

async function readEvents(res: Response) {
  const text = await res.text();
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('parseSSE', () => {
  it('빈 줄로 끝난 이벤트의 data를 추출한다', () => {
    const { data, rest } = parseSSE('event: x\ndata: {"a":1}\n\ndata: {"b":2}\n\n');
    expect(data).toEqual(['{"a":1}', '{"b":2}']);
    expect(rest).toBe('');
  });

  it('끝나지 않은 이벤트는 rest로 남긴다', () => {
    const { data, rest } = parseSSE('data: one\n\ndata: tw');
    expect(data).toEqual(['one']);
    expect(rest).toBe('data: tw');
  });

  it('CRLF 줄바꿈도 처리한다', () => {
    const { data } = parseSSE('data: one\r\n\r\n');
    expect(data).toEqual(['one']);
  });
});

describe('anthropicDelta', () => {
  it('content_block_delta의 텍스트를 반환한다', () => {
    const data = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'const' } });
    expect(anthropicDelta(data)).toBe('const');
  });

  it('텍스트가 없는 이벤트는 빈 문자열을 반환한다', () => {
    expect(anthropicDelta(JSON.stringify({ type: 'message_start' }))).toBe('');
  });

  it('스트림 중간 error 이벤트는 에러를 던진다', () => {
    const data = JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } });
    expect(() => anthropicDelta(data)).toThrow('Overloaded');
  });

  it('stop_reason이 max_tokens이면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({ type: 'message_delta', delta: { stop_reason: 'max_tokens' } });
    expect(() => anthropicDelta(data)).toThrow('너무 길어');
  });
});

describe('geminiDelta', () => {
  it('candidates의 텍스트 파트를 이어붙여 반환한다', () => {
    const data = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }] });
    expect(geminiDelta(data)).toBe('ab');
  });

  it('finishReason이 MAX_TOKENS이면 잘림 에러를 던진다', () => {
    const data = JSON.stringify({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: 'x' }] } }] });
    expect(() => geminiDelta(data)).toThrow('너무 길어');
  });
});

describe('encodeEvent', () => {
  it('JSON 한 줄과 개행으로 인코딩한다', () => {
    expect(encodeEvent({ type: 'delta', text: 'hi' })).toBe('{"type":"delta","text":"hi"}\n');
  });
});

describe('iterateSSE', () => {
  it('청크 경계가 이벤트 중간이어도 data를 순서대로 내보낸다', async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: o'));
        c.enqueue(enc.encode('ne\n\ndata: two\n\n'));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of iterateSSE(body)) out.push(d);
    expect(out).toEqual(['one', 'two']);
  });

  it('끝에 빈 줄 없이 끝난 마지막 이벤트도 내보낸다', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: one\n\ndata: last'));
        c.close();
      },
    });
    const out: string[] = [];
    for await (const d of iterateSSE(body)) out.push(d);
    expect(out).toEqual(['one', 'last']);
  });

  it('소비자가 중간에 중단하면 업스트림 body를 취소한다', async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: one\n\n'));
      },
      cancel() {
        cancelled = true;
      },
    });

    for await (const d of iterateSSE(body)) {
      expect(d).toBe('one');
      break;
    }

    expect(cancelled).toBe(true);
  });
});

describe('mapError', () => {
  it('503이 포함된 메시지는 과부하 안내와 503으로 매핑한다', () => {
    expect(mapError(new Error('Gemini API error: 503'))).toEqual({
      error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.',
      status: 503,
    });
  });

  it('429가 포함된 메시지는 요청 과다 안내와 429로 매핑한다', () => {
    expect(mapError(new Error('Claude API error: 429')).status).toBe(429);
  });

  it('그 외 에러는 메시지를 그대로 두고 500으로 매핑한다', () => {
    expect(mapError(new Error('boom'))).toEqual({ error: 'boom', status: 500 });
  });
});

describe('streamToResponse', () => {
  const headers = { 'X-Test': '1' };

  it('텍스트 조각을 delta로 보내고 끝에 정규화된 코드를 done으로 보낸다', async () => {
    const res = streamToResponse(fromArray(['const Card = () => null;']), headers);
    expect(await readEvents(res)).toEqual([
      { type: 'delta', text: 'const Card = () => null;' },
      { type: 'done', code: 'const Card = () => null;\n\nrender(<Card />);' },
    ]);
  });

  it('전달받은 헤더와 NDJSON Content-Type을 응답에 붙인다', () => {
    const res = streamToResponse(fromArray(['x']), headers);
    expect(res.headers.get('X-Test')).toBe('1');
    expect(res.headers.get('Content-Type')).toContain('application/x-ndjson');
  });

  it('빈 응답이면 error 이벤트를 보낸다', async () => {
    const events = await readEvents(streamToResponse(fromArray([]), headers));
    expect(events).toEqual([{ type: 'error', error: '모델이 빈 응답을 반환했습니다. 다시 시도해주세요.' }]);
  });

  it('중간에 에러가 나면 받은 delta 뒤에 error 이벤트를 보낸다', async () => {
    async function* failing(): AsyncGenerator<string> {
      yield 'const A';
      throw new Error('Claude API error: 429');
    }
    const events = await readEvents(streamToResponse(failing(), headers));
    expect(events[0]).toEqual({ type: 'delta', text: 'const A' });
    expect(events[1]).toEqual({ type: 'error', error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' });
  });

  it('클라이언트가 끊으면 onCancel을 호출하고 제너레이터를 중단한다', async () => {
    let finished = false;
    async function* endless(): AsyncGenerator<string> {
      try {
        while (true) {
          yield 'x';
          await new Promise((r) => setTimeout(r, 5));
        }
      } finally {
        finished = true;
      }
    }
    const onCancel = vi.fn();
    const res = streamToResponse(endless(), headers, onCancel);
    const reader = res.body!.getReader();
    await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(finished).toBe(true));
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
