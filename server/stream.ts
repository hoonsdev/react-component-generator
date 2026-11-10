// 프로바이더 스트리밍 응답(SSE)을 파싱하고 클라이언트로 보낼 NDJSON 응답을 만드는 모듈.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.
import { stripCodeFences, ensureRenderCall } from './generator';

export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

/** 버퍼에서 완결된 SSE 이벤트(빈 줄로 구분)의 data 값을 추출하고 나머지는 rest로 돌려준다. */
export function parseSSE(buffer: string): { data: string[]; rest: string } {
  const blocks = buffer.replace(/\r\n/g, '\n').split('\n\n');
  const rest = blocks.pop() ?? '';
  const data: string[] = [];

  for (const block of blocks) {
    const lines = block
      .split('\n')
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart());
    if (lines.length > 0) data.push(lines.join('\n'));
  }
  return { data, rest };
}

/** fetch 응답 body를 읽으면서 SSE 이벤트의 data를 하나씩 내보낸다. */
export async function* iterateSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parsed = parseSSE(buffer);
      buffer = parsed.rest;
      yield* parsed.data;
    }

    // 마지막 이벤트가 빈 줄 없이 끝난 경우도 놓치지 않는다.
    buffer += decoder.decode();
    yield* parseSSE(`${buffer}\n\n`).data;
  } finally {
    // 소비자가 중간에 중단하거나 에러가 나면 업스트림 연결을 닫는다.
    await reader.cancel().catch(() => {});
  }
}

const TRUNCATED_MESSAGE = '생성된 코드가 너무 길어 잘렸습니다. 더 간단한 컴포넌트를 요청해주세요.';

/** Anthropic 스트림 이벤트에서 텍스트 조각을 꺼낸다. 텍스트가 없는 이벤트는 빈 문자열. 중간 에러와 잘림은 에러로 던진다. */
export function anthropicDelta(data: string): string {
  const event = JSON.parse(data) as {
    type: string;
    delta?: { type?: string; text?: string; stop_reason?: string };
    error?: { message?: string };
  };
  if (event.type === 'error') {
    throw new Error(event.error?.message ?? 'Claude API stream error');
  }
  if (event.type === 'message_delta' && event.delta?.stop_reason === 'max_tokens') {
    throw new Error(TRUNCATED_MESSAGE);
  }
  return event.type === 'content_block_delta' ? (event.delta?.text ?? '') : '';
}

/** Gemini 스트림 청크에서 텍스트 조각을 꺼낸다. MAX_TOKENS로 잘리면 에러를 던진다. */
export function geminiDelta(data: string): string {
  const chunk = JSON.parse(data) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      finishReason?: string;
    }>;
  };
  const candidate = chunk.candidates?.[0];
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error(TRUNCATED_MESSAGE);
  }
  return candidate?.content?.parts?.map((part) => part.text ?? '').join('') ?? '';
}

/** 프로바이더 에러를 사용자용 메시지와 HTTP status로 매핑한다. */
export function mapError(err: unknown): { error: string; status: number } {
  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('503')) {
    return { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.', status: 503 };
  }
  if (message.includes('429')) {
    return { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', status: 429 };
  }
  return { error: message, status: 500 };
}

/**
 * 텍스트 조각을 NDJSON 이벤트로 흘려보내고, 끝나면 정규화된 최종 코드를 done으로 보낸다.
 * 클라이언트가 끊으면 제너레이터를 중단하고 onCancel(예: 업스트림 fetch abort)을 호출한다.
 */
export function streamToResponse(
  deltas: AsyncGenerator<string>,
  headers: Record<string, string>,
  onCancel?: () => void,
): Response {
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      // 클라이언트가 먼저 끊으면 enqueue/close가 던지므로 삼킨다.
      const send = (event: StreamEvent) => {
        try {
          controller.enqueue(encoder.encode(encodeEvent(event)));
        } catch {
          /* 연결 종료 */
        }
      };
      let full = '';
      try {
        for await (const text of deltas) {
          full += text;
          send({ type: 'delta', text });
        }
        const code = ensureRenderCall(stripCodeFences(full));
        if (!code) throw new Error('모델이 빈 응답을 반환했습니다. 다시 시도해주세요.');
        send({ type: 'done', code });
      } catch (err) {
        send({ type: 'error', error: mapError(err).error });
      } finally {
        try {
          controller.close();
        } catch {
          /* 이미 닫힘 */
        }
      }
    },
    cancel() {
      onCancel?.();
      void deltas.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      ...headers,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

/** 클라이언트로 보낼 NDJSON 한 줄. */
export function encodeEvent(event: StreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}
