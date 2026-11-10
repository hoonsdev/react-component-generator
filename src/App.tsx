import { useState, useEffect } from 'react';
import { PromptInput } from './components/PromptInput';
import { ComponentCard } from './components/ComponentCard';
import { useComponentGenerator } from './hooks/useComponentGenerator';
import type { Provider } from './types';
import { STORAGE_KEYS, loadValue, saveValue, addToHistory } from './utils/storage';
import './App.css';

const PROVIDER_CONFIG = {
  anthropic: { label: 'Anthropic', placeholder: 'sk-ant-...' },
  google: { label: 'Google', placeholder: 'AIza...' },
} as const;

const isProvider = (v: unknown): v is Provider => v === 'anthropic' || v === 'google';
const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((item) => typeof item === 'string');
const isKeyMap = (v: unknown): v is Partial<Record<Provider, string>> =>
  typeof v === 'object' &&
  v !== null &&
  !Array.isArray(v) &&
  Object.values(v).every((item) => typeof item === 'string');

function App() {
  const [provider, setProvider] = useState<Provider>(() =>
    loadValue<Provider>(STORAGE_KEYS.provider, 'google', isProvider),
  );
  // API 키는 Provider별로 저장해 다른 Provider로 키가 전송되지 않게 한다.
  const [apiKeys, setApiKeys] = useState<Partial<Record<Provider, string>>>(() =>
    loadValue(STORAGE_KEYS.apiKey, {}, isKeyMap),
  );
  const apiKey = apiKeys[provider] ?? '';
  const [showKey, setShowKey] = useState(false);
  const [history, setHistory] = useState<string[]>(() =>
    loadValue<string[]>(STORAGE_KEYS.history, [], isStringArray),
  );
  const [envKeys, setEnvKeys] = useState<Record<Provider, boolean>>({
    anthropic: false,
    google: false,
  });
  const { components, streaming, isLoading, error, generate, removeComponent, clearAll } =
    useComponentGenerator();
  // 생성 중인 카드는 목록 맨 앞에 두고, 완료 후에도 같은 id로 이어져 탭 전환이 자연스럽다.
  const visibleComponents = streaming ? [streaming, ...components] : components;

  useEffect(() => {
    fetch('/api/config')
      .then((res) => res.json())
      .then((data) => setEnvKeys(data.envKeys))
      .catch(() => {});
  }, []);

  useEffect(() => saveValue(STORAGE_KEYS.provider, provider), [provider]);
  useEffect(() => saveValue(STORAGE_KEYS.apiKey, apiKeys), [apiKeys]);
  useEffect(() => saveValue(STORAGE_KEYS.history, history), [history]);

  const hasEnvKey = envKeys[provider];

  const handleGenerate = async (prompt: string) => {
    if (!apiKey.trim() && !hasEnvKey) {
      alert(`${PROVIDER_CONFIG[provider].label} API 키를 입력하거나 .env에 설정해주세요.`);
      return;
    }
    // 성공한 프롬프트만 히스토리에 남긴다.
    if (await generate(prompt, apiKey || undefined, provider)) {
      setHistory((prev) => addToHistory(prev, prompt));
    }
  };

  const handleProviderChange = (newProvider: Provider) => {
    setProvider(newProvider);
  };

  const activeProvider = PROVIDER_CONFIG[provider].label;

  return (
    <div className="app">
      <header className="menubar">
        <div className="brand-mark">RC</div>
        <h1>React 컴포넌트 생성기</h1>
        <div className="menubar-meta" aria-label="현재 작업 상태">
          <span>
            AI <strong>{activeProvider}</strong>
          </span>
          <span>
            컴포넌트 <strong>{components.length}</strong>개
          </span>
        </div>
      </header>

      <main className="workspace">
        <section className="win composer-panel" aria-label="컴포넌트 생성">
          <div className="win-title">
            <span>새 컴포넌트</span>
          </div>
          <div className="win-body">
            <PromptInput onGenerate={handleGenerate} isLoading={isLoading} history={history} />
          </div>
        </section>

        <aside className="win settings-panel" aria-label="실행 설정">
          <div className="win-title">
            <span>실행 설정</span>
          </div>
          <div className="win-body">
          <div className="provider-select">
            <label htmlFor="provider">Provider</label>
            <select
              id="provider"
              value={provider}
              onChange={(e) => handleProviderChange(e.target.value as Provider)}
            >
              {Object.entries(PROVIDER_CONFIG).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="api-key-input">
            <label htmlFor="api-key">
              API Key
            </label>
            <div className="api-key-field">
              <input
                id="api-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKeys((prev) => ({ ...prev, [provider]: e.target.value }))}
                placeholder={
                  hasEnvKey
                    ? '서버 키 사용 중 (직접 입력으로 덮어쓰기 가능)'
                    : PROVIDER_CONFIG[provider].placeholder
                }
              />
              <button
                className="btn-toggle-key"
                onClick={() => setShowKey(!showKey)}
                type="button"
              >
                {showKey ? '숨기기' : '보기'}
              </button>
            </div>
            <p className={`key-status ${hasEnvKey ? 'key-status--ready' : ''}`}>
              {hasEnvKey ? '.env 키가 연결되어 있습니다.' : '직접 입력하거나 서버 환경변수를 설정하세요.'}
            </p>
          </div>
          </div>
        </aside>
      </main>

      {error && (
        <div className="error-banner">
          <p>{error}</p>
        </div>
      )}

      <section className="results-section">
        {visibleComponents.length > 0 && (
          <div className="results-header">
            <h2>생성된 컴포넌트</h2>
            <button className="btn-clear" onClick={clearAll} disabled={isLoading}>
              전체 삭제
            </button>
          </div>
        )}

        {components.length === 0 && !isLoading && (
          <div className="win empty-state">
            <div className="empty-preview" aria-hidden="true">
              <div className="empty-window">
                <span />
                <span />
                <span />
              </div>
              <div className="empty-canvas">
                <div className="empty-card empty-card--primary" />
                <div className="empty-card" />
                <div className="empty-card empty-card--wide" />
              </div>
            </div>
            <div className="empty-copy">
              <h2>새 컴포넌트를 생성해보세요.</h2>
              <p>만들 UI를 입력창에 설명하면 미리보기와 코드가 여기에 쌓입니다.</p>
            </div>
          </div>
        )}

        {isLoading && !streaming && (
          <div className="win loading-card" role="status">
            <div className="win-body">
              <p>AI 응답을 기다리고 있습니다...</p>
              <div className="loading-bar" />
            </div>
          </div>
        )}

        <div className="results-grid">
          {visibleComponents.map((component) => (
            <ComponentCard
              key={component.id}
              component={component}
              onRemove={removeComponent}
              onRegenerate={handleGenerate}
              isLoading={isLoading}
              isStreaming={component.id === streaming?.id}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

export default App;
