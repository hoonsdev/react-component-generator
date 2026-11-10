import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PromptInput } from './PromptInput';

describe('PromptInput', () => {
  it('프롬프트가 비어 있으면 생성 버튼이 비활성이다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
  });

  it('입력하면 버튼이 활성화되고 클릭 시 입력값으로 onGenerate가 호출된다', async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);

    await user.type(screen.getByRole('textbox'), '프로필 카드');
    const submit = screen.getByRole('button', { name: '컴포넌트 생성' });
    expect(submit).toBeEnabled();

    await user.click(submit);
    expect(onGenerate).toHaveBeenCalledWith('프로필 카드');
  });

  it('500자를 넘기면 에러 메시지를 보여주고 생성 버튼이 비활성이다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(501) } });

    expect(screen.getByRole('alert')).toHaveTextContent('500자 이하');
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeDisabled();
  });

  it('정확히 500자면 에러 없이 생성할 수 있다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={false} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'a'.repeat(500) } });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '컴포넌트 생성' })).toBeEnabled();
  });

  it('500자 초과 상태에서는 Ctrl+Enter로도 onGenerate가 호출되지 않는다', () => {
    const onGenerate = vi.fn();
    render(<PromptInput onGenerate={onGenerate} isLoading={false} />);
    const textbox = screen.getByRole('textbox');

    fireEvent.change(textbox, { target: { value: 'a'.repeat(501) } });
    fireEvent.keyDown(textbox, { key: 'Enter', ctrlKey: true });

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('로딩 중에는 생성 버튼이 비활성이고 "생성 중..." 을 보여준다', () => {
    render(<PromptInput onGenerate={vi.fn()} isLoading={true} />);
    expect(screen.getByRole('button', { name: '생성 중...' })).toBeDisabled();
  });
});
