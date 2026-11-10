export const MAX_PROMPT_LENGTH = 500;

export interface PromptValidationResult {
  valid: boolean;
  error?: string;
}

/** 프롬프트가 최대 길이를 넘지 않는지 검증한다. 앞뒤 공백은 길이에 포함하지 않는다. */
export function validatePrompt(prompt: string): PromptValidationResult {
  if (prompt.trim().length > MAX_PROMPT_LENGTH) {
    return { valid: false, error: `프롬프트는 ${MAX_PROMPT_LENGTH}자 이하로 입력해주세요.` };
  }
  return { valid: true };
}
