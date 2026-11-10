import { useState, useCallback, useEffect } from 'react';
import type { GeneratedComponent, Provider } from '../types';
import { loadComponents, saveComponents } from '../utils/storage';
import { parseNdjson, type StreamEvent } from '../utils/ndjson';

interface UseComponentGeneratorReturn {
  components: GeneratedComponent[];
  /** 생성 중인 컴포넌트. 코드가 도착하는 대로 갱신되고 완료되면 null이 된다. */
  streaming: GeneratedComponent | null;
  isLoading: boolean;
  error: string | null;
  generate: (prompt: string, apiKey: string | undefined, provider: Provider) => Promise<boolean>;
  removeComponent: (id: string) => void;
  clearAll: () => void;
}

export function useComponentGenerator(): UseComponentGeneratorReturn {
  const [components, setComponents] = useState<GeneratedComponent[]>(loadComponents);
  const [streaming, setStreaming] = useState<GeneratedComponent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    saveComponents(components);
  }, [components]);

  const generate = useCallback(async (prompt: string, apiKey: string | undefined, provider: Provider) => {
    setIsLoading(true);
    setError(null);
    setStreaming(null);

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, ...(apiKey && { apiKey }), provider }),
      });

      // 스트림이 시작되기 전의 에러(키 누락, 프로바이더 4xx/5xx)는 JSON으로 온다.
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to generate component');
      }

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const createdAt = new Date();
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let code = '';
      const result: { code: string | null } = { code: null };

      const handle = (event: StreamEvent) => {
        if (event.type === 'error') throw new Error(event.error);
        if (event.type === 'done') {
          result.code = event.code;
          return;
        }
        code += event.text;
        setStreaming({ id, prompt, code, createdAt });
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseNdjson(buffer);
        buffer = parsed.rest;
        parsed.events.forEach(handle);
      }

      if (result.code === null) {
        throw new Error('응답이 중간에 끊겼습니다. 다시 시도해주세요.');
      }

      const newComponent: GeneratedComponent = { id, prompt, code: result.code, createdAt };
      setComponents((prev) => [newComponent, ...prev]);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      return false;
    } finally {
      setStreaming(null);
      setIsLoading(false);
    }
  }, []);

  const removeComponent = useCallback((id: string) => {
    setComponents((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const clearAll = useCallback(() => {
    setComponents([]);
  }, []);

  return { components, streaming, isLoading, error, generate, removeComponent, clearAll };
}
