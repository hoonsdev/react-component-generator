import { describe, it, expect } from 'vitest';
import {
  parseSSE,
  anthropicDelta,
  geminiDelta,
  encodeEvent,
  iterateSSE,
} from './stream';

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
});
