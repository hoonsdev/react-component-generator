import { stripCodeFences, ensureRenderCall } from './generator';
import { withModelFallback } from './fallback';
import { iterateSSE, anthropicDelta, geminiDelta, encodeEvent, type StreamEvent } from './stream';

// 우선순위 순서. 앞 모델이 실패하면 다음 모델로 폴백한다.
const GOOGLE_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash'];

const SYSTEM_PROMPT = `You are a React component generator. Generate a single React component based on the user's description.

Rules:
- Use inline styles only (no CSS imports, no CSS modules)
- Do NOT use import statements — React is already available in scope as a global
- Define the component as a function, then call render(<ComponentName />) at the end
- Make the component visually appealing with proper styling
- Use React hooks if needed (e.g., React.useState, React.useEffect)
- The component must be completely self-contained
- Respond with ONLY the code block — no explanations, no markdown fences
- Use descriptive variable names and clean formatting
- For colors, prefer modern palettes (gradients, shadows, etc.)
- Ensure the component is interactive where appropriate (hover states, click handlers, etc.)
- Do NOT use TypeScript syntax — no type annotations, no interfaces, no generics, no "as" casts. Write plain JavaScript only.

Example output format:
const GradientButton = () => {
  const [hovered, setHovered] = React.useState(false);

  return (
    <button
      style={{
        background: hovered
          ? 'linear-gradient(135deg, #667eea, #764ba2)'
          : 'linear-gradient(135deg, #764ba2, #667eea)',
        color: 'white',
        border: 'none',
        padding: '12px 24px',
        borderRadius: '8px',
        fontSize: '16px',
        cursor: 'pointer',
        transition: 'all 0.3s ease',
        transform: hovered ? 'scale(1.05)' : 'scale(1)',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      Click me
    </button>
  );
};

render(<GradientButton />);`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

type Provider = 'anthropic' | 'google';

const ENV_KEYS: Record<Provider, string | undefined> = {
  anthropic: process.env.ANTHROPIC_API_KEY,
  google: process.env.GOOGLE_API_KEY,
};

function resolveApiKey(provider: Provider, clientKey?: string): string | null {
  return clientKey || ENV_KEYS[provider] || null;
}

// 프로바이더 호출 함수는 모델 응답을 텍스트 조각(delta)의 비동기 스트림으로 돌려준다.
// HTTP 오류는 스트림이 시작되기 전에 throw 하므로 핸들러가 일반 JSON 에러로 응답할 수 있다.
async function openAnthropicStream(prompt: string, apiKey: string): Promise<AsyncGenerator<string>> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 4096,
      stream: true,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Claude API error: ${response.status}`);
  }

  const body = response.body;
  return (async function* () {
    for await (const data of iterateSSE(body)) {
      const text = anthropicDelta(data);
      if (text) yield text;
    }
  })();
}

async function openGoogleModelStream(
  prompt: string,
  apiKey: string,
  model: string,
): Promise<AsyncGenerator<string>> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 8192 },
    }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Gemini API error: ${response.status}`);
  }

  const body = response.body;
  return (async function* () {
    for await (const data of iterateSSE(body)) {
      const text = geminiDelta(data);
      if (text) yield text;
    }
  })();
}

// 폴백은 스트림이 열리기 전(연결/HTTP 오류)에만 동작한다. 텍스트가 나가기 시작하면 모델을 바꾸지 않는다.
async function openGoogleStream(prompt: string, apiKey: string): Promise<AsyncGenerator<string>> {
  return withModelFallback(GOOGLE_MODELS, (model) => openGoogleModelStream(prompt, apiKey, model));
}

/** 프로바이더 에러를 사용자용 메시지와 HTTP status로 매핑한다. */
function mapError(err: unknown): { error: string; status: number } {
  const message = err instanceof Error ? err.message : 'Unknown error';

  if (message.includes('503')) {
    return { error: 'API 서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.', status: 503 };
  }
  if (message.includes('429')) {
    return { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.', status: 429 };
  }
  return { error: message, status: 500 };
}

/** 텍스트 조각을 NDJSON 이벤트로 흘려보내고, 끝나면 정규화된 최종 코드를 done으로 보낸다. */
function streamToResponse(deltas: AsyncGenerator<string>): Response {
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
    // 클라이언트가 끊기면 업스트림 읽기를 중단해 토큰 낭비를 막는다.
    cancel() {
      void deltas.return(undefined);
    },
  });

  return new Response(body, {
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache',
    },
  });
}

const server = Bun.serve({
  port: 3002,
  idleTimeout: 60, // 스트리밍 중 토큰 사이 간격이 길어도 연결을 끊지 않는다
  async fetch(req) {
    if (req.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(req.url);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      return Response.json(
        {
          envKeys: {
            anthropic: !!ENV_KEYS.anthropic,
            google: !!ENV_KEYS.google,
          },
        },
        { headers: CORS_HEADERS }
      );
    }

    if (req.method === 'POST' && url.pathname === '/api/generate') {
      try {
        const { prompt, apiKey, provider = 'anthropic' } = (await req.json()) as {
          prompt: string;
          apiKey?: string;
          provider?: Provider;
        };

        const resolvedKey = resolveApiKey(provider, apiKey);

        if (!resolvedKey) {
          return Response.json(
            { error: `API key is required. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'GOOGLE_API_KEY'} in .env or enter it manually.` },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        if (!prompt) {
          return Response.json(
            { error: 'Prompt is required' },
            { status: 400, headers: CORS_HEADERS }
          );
        }

        const deltas =
          provider === 'google'
            ? await openGoogleStream(prompt, resolvedKey)
            : await openAnthropicStream(prompt, resolvedKey);

        return streamToResponse(deltas);
      } catch (err) {
        const { error, status } = mapError(err);
        return Response.json({ error }, { status, headers: CORS_HEADERS });
      }
    }

    return Response.json(
      { error: 'Not found' },
      { status: 404, headers: CORS_HEADERS }
    );
  },
});

console.log(`API server running at http://localhost:${server.port}`);
