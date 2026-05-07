/// <reference types="@testing-library/jest-dom" />

// PR-8 v1.6 D5 RerunIntentModal 4 路评审收敛 spec
//
// 覆盖：
//   - paramValue 空时提交 disabled
//   - chapterIndices 为空时 revise-chapter 显示 amber 警告
//   - submit 失败 needsConfigure 路径回 'configure' / 否则回 'pick'（参数化，不依赖闭包）
//   - useEffect on close → 重置 step / picked / paramValue / chapterIndex（P0 修补）

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock Lucide
vi.mock('lucide-react', () => ({
  X: (props: Record<string, unknown>) => (
    <svg data-testid="x-icon" {...props} />
  ),
}));

// Mock api client
const rerunMissionWithIntent = vi.fn();
vi.mock('@/services/agent-playground/api', () => ({
  rerunMissionWithIntent: (
    missionId: string,
    intent: string,
    payload: unknown
  ) => rerunMissionWithIntent(missionId, intent, payload),
}));

// Mock the card grid (simplify — render buttons by intent for direct click)
vi.mock('../RerunIntentCardGrid', () => ({
  RerunIntentCardGrid: ({ onPick }: { onPick: (intent: string) => void }) => (
    <div data-testid="card-grid">
      <button onClick={() => onPick('add-figures')}>add-figures-btn</button>
      <button onClick={() => onPick('revise-chapter')}>
        revise-chapter-btn
      </button>
      <button onClick={() => onPick('change-language')}>
        change-language-btn
      </button>
      <button onClick={() => onPick('fresh-research')}>
        fresh-research-btn
      </button>
    </div>
  ),
}));

import { RerunIntentModal } from '../RerunIntentModal';

describe('RerunIntentModal', () => {
  beforeEach(() => {
    rerunMissionWithIntent.mockReset();
  });

  const defaultProps = {
    missionId: 'm-1',
    open: true,
    onClose: vi.fn(),
    onPicked: vi.fn(),
  };

  it('renders pick step by default with card grid', () => {
    render(<RerunIntentModal {...defaultProps} />);
    expect(screen.getByText('选择重跑意图')).toBeInTheDocument();
    expect(screen.getByTestId('card-grid')).toBeInTheDocument();
  });

  it('does not render when open=false', () => {
    render(<RerunIntentModal {...defaultProps} open={false} />);
    expect(screen.queryByText('选择重跑意图')).not.toBeInTheDocument();
  });

  it('add-figures (no config) → directly submits, does not enter configure step', async () => {
    rerunMissionWithIntent.mockResolvedValue({
      runMissionId: 'm-1',
      intent: 'add-figures',
    });
    const onPicked = vi.fn();
    render(<RerunIntentModal {...defaultProps} onPicked={onPicked} />);
    fireEvent.click(screen.getByText('add-figures-btn'));
    await waitFor(() => {
      expect(rerunMissionWithIntent).toHaveBeenCalledWith(
        'm-1',
        'add-figures',
        {}
      );
      expect(onPicked).toHaveBeenCalledWith({
        runMissionId: 'm-1',
        intent: 'add-figures',
      });
    });
  });

  it('revise-chapter with empty chapterIndices → shows amber warning, no select', async () => {
    render(<RerunIntentModal {...defaultProps} chapterIndices={[]} />);
    fireEvent.click(screen.getByText('revise-chapter-btn'));
    await waitFor(() => {
      expect(
        screen.getByText(
          '当前 mission 没有章节可选，回去等 mission 完成再用此意图'
        )
      ).toBeInTheDocument();
    });
    // 无 select element (UI degradation 路径)
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('change-language with empty paramValue → 提交 button disabled', async () => {
    render(<RerunIntentModal {...defaultProps} />);
    fireEvent.click(screen.getByText('change-language-btn'));
    await waitFor(() => {
      const submitBtn = screen.getByRole('button', { name: '提交' });
      expect(submitBtn).toBeDisabled();
    });
  });

  it('change-language with valid value → 提交 enabled, dispatches with payload', async () => {
    rerunMissionWithIntent.mockResolvedValue({
      runMissionId: 'm-1',
      intent: 'change-language',
    });
    render(<RerunIntentModal {...defaultProps} />);
    fireEvent.click(screen.getByText('change-language-btn'));
    await waitFor(() => screen.getByRole('button', { name: '提交' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'en-US' },
    });
    const submitBtn = screen.getByRole('button', { name: '提交' });
    expect(submitBtn).not.toBeDisabled();
    fireEvent.click(submitBtn);
    await waitFor(() => {
      expect(rerunMissionWithIntent).toHaveBeenCalledWith(
        'm-1',
        'change-language',
        { language: 'en-US' }
      );
    });
  });

  it('submit failure on no-configure intent → step rolls back to pick (not configure)', async () => {
    rerunMissionWithIntent.mockRejectedValue(new Error('boom'));
    render(<RerunIntentModal {...defaultProps} />);
    fireEvent.click(screen.getByText('add-figures-btn'));
    await waitFor(() => {
      expect(screen.getByText(/boom/)).toBeInTheDocument();
    });
    // 仍在 pick step（card grid 可见）
    expect(screen.getByTestId('card-grid')).toBeInTheDocument();
  });

  it('submit failure on requires-config intent → step rolls back to configure (not pick)', async () => {
    rerunMissionWithIntent.mockRejectedValue(new Error('rejected'));
    render(<RerunIntentModal {...defaultProps} />);
    fireEvent.click(screen.getByText('change-language-btn'));
    await waitFor(() => screen.getByRole('button', { name: '提交' }));
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'en-US' },
    });
    fireEvent.click(screen.getByRole('button', { name: '提交' }));
    await waitFor(() => {
      expect(screen.getByText(/rejected/)).toBeInTheDocument();
    });
    // 仍在 configure step（select 仍可见 + 提交 button 仍可见）
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '提交' })).toBeInTheDocument();
  });

  it('closes and reopens → all state reset (step / picked / paramValue / chapterIndex)', async () => {
    const { rerender } = render(
      <RerunIntentModal {...defaultProps} chapterIndices={[1, 2]} />
    );
    // 进 revise-chapter configure step，选 chapter 2
    fireEvent.click(screen.getByText('revise-chapter-btn'));
    await waitFor(() => screen.getByRole('combobox'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: '2' } });
    expect(screen.getByRole('combobox')).toHaveValue('2');

    // 关闭
    rerender(
      <RerunIntentModal
        {...defaultProps}
        open={false}
        chapterIndices={[1, 2]}
      />
    );
    // 重新打开
    rerender(
      <RerunIntentModal {...defaultProps} open chapterIndices={[1, 2]} />
    );
    // 应回到 pick step
    expect(screen.getByText('选择重跑意图')).toBeInTheDocument();
    expect(screen.getByTestId('card-grid')).toBeInTheDocument();
  });
});
