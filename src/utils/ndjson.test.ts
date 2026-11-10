import { describe, it, expect } from 'vitest';
import { parseNdjson } from './ndjson';

describe('parseNdjson', () => {
  it('완성된 줄을 이벤트로 파싱한다', () => {
    const { events, rest } = parseNdjson('{"type":"delta","text":"a"}\n{"type":"done","code":"c"}\n');
    expect(events).toEqual([
      { type: 'delta', text: 'a' },
      { type: 'done', code: 'c' },
    ]);
    expect(rest).toBe('');
  });

  it('JSON이 깨진 줄은 한국어 에러를 던진다', () => {
    expect(() => parseNdjson('not json\n')).toThrow('응답 형식');
  });

  it('개행이 없는 마지막 조각은 rest로 남긴다', () => {
    const { events, rest } = parseNdjson('{"type":"delta","text":"a"}\n{"type":"del');
    expect(events).toHaveLength(1);
    expect(rest).toBe('{"type":"del');
  });
});
