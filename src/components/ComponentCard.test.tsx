import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ComponentCard } from './ComponentCard';
import type { GeneratedComponent } from '../types';

vi.mock('./LivePreview', () => ({
  LivePreview: () => <div>미리보기 영역</div>,
}));

const base: GeneratedComponent = {
  id: '1',
  prompt: '버튼',
  code: 'const A = () => null;',
  createdAt: new Date(),
};

const renderCard = (isStreaming: boolean) => (
  <ComponentCard component={base} onRemove={() => {}} onRegenerate={() => {}} isLoading={false} isStreaming={isStreaming} />
);

describe('ComponentCard 스트리밍', () => {
  it('스트리밍 중에는 코드 탭이 활성화되어 코드를 보여준다', () => {
    render(renderCard(true));
    expect(screen.getByRole('button', { name: '코드' })).toHaveClass('tab--active');
    expect(screen.getByText('const A = () => null;')).toBeInTheDocument();
  });

  it('스트리밍이 끝나면 미리보기 탭으로 전환한다', () => {
    const { rerender } = render(renderCard(true));
    rerender(renderCard(false));
    expect(screen.getByRole('button', { name: '미리보기' })).toHaveClass('tab--active');
    expect(screen.getByText('미리보기 영역')).toBeInTheDocument();
  });

  it('스트리밍이 아니면 처음부터 미리보기 탭이다', () => {
    render(renderCard(false));
    expect(screen.getByRole('button', { name: '미리보기' })).toHaveClass('tab--active');
  });
});
