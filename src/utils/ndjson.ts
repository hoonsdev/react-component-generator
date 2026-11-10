// /api/generate가 보내는 NDJSON 스트림의 이벤트 형식과 파서.
export type StreamEvent =
  | { type: 'delta'; text: string }
  | { type: 'done'; code: string }
  | { type: 'error'; error: string };

/** 버퍼에서 완결된 줄을 이벤트로 파싱하고, 개행으로 끝나지 않은 조각은 rest로 돌려준다. */
export function parseNdjson(buffer: string): { events: StreamEvent[]; rest: string } {
  const lines = buffer.split('\n');
  const rest = lines.pop() ?? '';
  try {
    const events = lines.filter((line) => line.trim()).map((line) => JSON.parse(line) as StreamEvent);
    return { events, rest };
  } catch {
    throw new Error('서버 응답 형식이 올바르지 않습니다. 다시 시도해주세요.');
  }
}
