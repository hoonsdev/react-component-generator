// 프로바이더 스트리밍 응답(SSE)을 파싱하고 클라이언트로 보낼 NDJSON 이벤트를 만드는 순수 함수들.
// 부수효과(Bun.serve 등)가 없어 단위 테스트가 가능하다.

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

/** 클라이언트로 보낼 NDJSON 한 줄. */
export function encodeEvent(event: StreamEvent): string {
  return `${JSON.stringify(event)}\n`;
}
