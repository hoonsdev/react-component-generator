import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';
import { STORAGE_KEYS } from './utils/storage';

function mockFetch(generate: () => Response | Promise<Response>) {
  const fn = vi.fn((url: string) => {
    if (url === '/api/config') {
      return Promise.resolve(
        new Response(JSON.stringify({ envKeys: { anthropic: false, google: false } })),
      );
    }
    return Promise.resolve(generate());
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

const enc = new TextEncoder();
const line = (event: object) => enc.encode(`${JSON.stringify(event)}\n`);
const ok = () =>
  new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(line({ type: 'delta', text: 'render(<div>ok</div>)' }));
        c.enqueue(line({ type: 'done', code: 'render(<div>ok</div>)' }));
        c.close();
      },
    }),
  );
const fail = () => new Response(JSON.stringify({ error: '실패' }), { status: 500 });

function seedKey(provider: string, key: string) {
  localStorage.setItem(STORAGE_KEYS.apiKey, JSON.stringify({ [provider]: key }));
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App 영속화', () => {
  it('저장된 Provider와 해당 Provider의 API 키를 복원한다', () => {
    mockFetch(ok);
    localStorage.setItem(STORAGE_KEYS.provider, JSON.stringify('anthropic'));
    seedKey('anthropic', 'sk-ant-saved');

    render(<App />);

    expect(screen.getByLabelText('Provider')).toHaveValue('anthropic');
    expect(screen.getByLabelText('API Key')).toHaveValue('sk-ant-saved');
  });

  it('Provider를 바꾸면 다른 Provider의 키는 보이지 않는다', async () => {
    mockFetch(ok);
    localStorage.setItem(STORAGE_KEYS.provider, JSON.stringify('anthropic'));
    seedKey('anthropic', 'sk-ant-saved');
    const user = userEvent.setup();
    render(<App />);

    await user.selectOptions(screen.getByLabelText('Provider'), 'google');

    expect(screen.getByLabelText('API Key')).toHaveValue('');
  });

  it('저장된 키 값이 문자열이 아니면 무시한다', () => {
    mockFetch(ok);
    localStorage.setItem(STORAGE_KEYS.apiKey, JSON.stringify({ google: 123 }));

    render(<App />);

    expect(screen.getByLabelText('API Key')).toHaveValue('');
  });

  it('생성에 성공하면 프롬프트를 히스토리에 저장한다', async () => {
    mockFetch(ok);
    seedKey('google', 'AIza-key');
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('textbox', { name: '' }), '성공 프롬프트');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await waitFor(() =>
      expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.history)!)).toEqual(['성공 프롬프트']),
    );
  });

  it('생성에 실패하면 프롬프트를 히스토리에 저장하지 않는다', async () => {
    mockFetch(fail);
    seedKey('google', 'AIza-key');
    const user = userEvent.setup();
    render(<App />);

    await user.type(screen.getByRole('textbox', { name: '' }), '실패 프롬프트');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));

    await screen.findByText('실패');
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.history)!)).toEqual([]);
  });
});

describe('App 스트리밍', () => {
  async function startGenerate(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByRole('textbox', { name: '' }), '스트림 프롬프트');
    await user.click(screen.getByRole('button', { name: '컴포넌트 생성' }));
  }

  it('생성 중에는 코드 탭에 받은 코드를 실시간으로 보여주고, 완료되면 미리보기 탭으로 전환한다', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    mockFetch(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              controller = c;
            },
          }),
        ),
    );
    seedKey('google', 'AIza-key');
    const user = userEvent.setup();
    render(<App />);

    await startGenerate(user);
    await waitFor(() => expect(controller).toBeDefined());
    controller.enqueue(line({ type: 'delta', text: 'const Live' }));

    expect(await screen.findByText('const Live')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '코드' })).toHaveClass('tab--active');

    controller.enqueue(line({ type: 'done', code: 'const Live = () => null;\nrender(<Live />);' }));
    controller.close();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: '미리보기' })).toHaveClass('tab--active'),
    );
    expect(document.querySelectorAll('.card-prompt')).toHaveLength(1);
  });

  it('스트림 중간에 error 이벤트가 오면 에러를 표시하고 목록에 추가하지 않는다', async () => {
    mockFetch(
      () =>
        new Response(
          new ReadableStream({
            start(c) {
              c.enqueue(line({ type: 'delta', text: 'const A' }));
              c.enqueue(line({ type: 'error', error: '중간 실패' }));
              c.close();
            },
          }),
        ),
    );
    seedKey('google', 'AIza-key');
    const user = userEvent.setup();
    render(<App />);

    await startGenerate(user);

    await screen.findByText('중간 실패');
    expect(document.querySelectorAll('.card-prompt')).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem(STORAGE_KEYS.history)!)).toEqual([]);
  });
});
