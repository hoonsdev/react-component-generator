import { useEffect, useRef, useState } from 'react';

interface CodeViewProps {
  code: string;
  isStreaming?: boolean;
}

export function CodeView({ code, isStreaming = false }: CodeViewProps) {
  const [copied, setCopied] = useState(false);
  const blockRef = useRef<HTMLPreElement>(null);

  // 스트리밍 중에는 새 코드가 보이도록 아래로 따라간다.
  useEffect(() => {
    const block = blockRef.current;
    if (isStreaming && block) block.scrollTop = block.scrollHeight;
  }, [code, isStreaming]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="code-panel">
      <div className="panel-header">
        <h3>코드</h3>
        <button className="btn-copy" onClick={handleCopy} disabled={isStreaming}>
          {copied ? '복사됨!' : '복사'}
        </button>
      </div>
      <pre ref={blockRef} className={`code-block ${isStreaming ? 'code-block--streaming' : ''}`}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
