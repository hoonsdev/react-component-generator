import { describe, it, expect } from 'vitest';
import { validatePrompt, MAX_PROMPT_LENGTH } from './validatePrompt';

describe('validatePrompt', () => {
  it('500자 이하의 프롬프트는 유효하다', () => {
    expect(validatePrompt('a'.repeat(MAX_PROMPT_LENGTH))).toEqual({ valid: true });
  });

  it('500자를 넘으면 유효하지 않고 에러 메시지를 반환한다', () => {
    const result = validatePrompt('a'.repeat(MAX_PROMPT_LENGTH + 1));
    expect(result.valid).toBe(false);
    expect(result.error).toContain('500');
  });

  it('앞뒤 공백은 길이에 포함하지 않는다', () => {
    expect(validatePrompt(`  ${'a'.repeat(MAX_PROMPT_LENGTH)}  `)).toEqual({ valid: true });
  });
});
