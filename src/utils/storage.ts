import type { GeneratedComponent } from '../types';

export const STORAGE_KEYS = {
  apiKey: 'rcg:apiKey',
  provider: 'rcg:provider',
  history: 'rcg:history',
  components: 'rcg:components',
} as const;

export const MAX_HISTORY = 20;

// 저장소 접근은 용량 초과, 사생활 보호 모드 등으로 실패할 수 있어 모두 조용히 처리한다.
export function loadValue<T>(key: string, fallback: T, validate?: (v: unknown) => v is T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (validate && !validate(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function saveValue(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 실패는 무시한다 (메모리 상태는 유지됨)
  }
}

function isStoredComponent(v: unknown): v is Omit<GeneratedComponent, 'createdAt'> & { createdAt: string } {
  if (typeof v !== 'object' || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.prompt === 'string' &&
    typeof c.code === 'string' &&
    typeof c.createdAt === 'string' &&
    !Number.isNaN(new Date(c.createdAt).getTime())
  );
}

// createdAt은 JSON에서 문자열이 되므로 Date로 복원한다 (ComponentCard가 Date 메서드를 호출함).
export function loadComponents(): GeneratedComponent[] {
  const raw = loadValue<unknown[]>(STORAGE_KEYS.components, [], Array.isArray);
  return raw.filter(isStoredComponent).map((c) => ({ ...c, createdAt: new Date(c.createdAt) }));
}

export function saveComponents(components: GeneratedComponent[]): void {
  saveValue(STORAGE_KEYS.components, components);
}

export function addToHistory(history: string[], prompt: string): string[] {
  const trimmed = prompt.trim();
  if (!trimmed) return history;
  return [trimmed, ...history.filter((h) => h !== trimmed)].slice(0, MAX_HISTORY);
}
