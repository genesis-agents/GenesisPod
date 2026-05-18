/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

import { RadarBriefingPanel } from '../RadarBriefingPanel';
import type { DailySignalView } from '../RadarBriefingCard';

const makeSignal = (id: string, tier: 1 | 2 | 3 = 2): DailySignalView => ({
  id,
  tier,
  title: `Signal ${id}`,
  oneLineTakeaway: `Takeaway for ${id}`,
  whyItMatters: `Why it matters for ${id}`,
  whatsNext: `What is next for ${id}`,
  signalTags: ['tag1'],
  entities: ['EntityA'],
  evidenceItemIds: [],
});

const defaultProps = {
  briefingDate: '2026-05-18',
  topicId: 'topic-ai',
  topicName: 'AI 行业',
};

describe('RadarBriefingPanel', () => {
  it('renders the formatted header date', () => {
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="completed"
        signals={[makeSignal('s1')]}
      />
    );
    expect(screen.getByText(/5月18日 · 今日精选/)).toBeTruthy();
  });

  it('shows skeleton + generating text when status=generating', () => {
    render(
      <RadarBriefingPanel {...defaultProps} status="generating" signals={[]} />
    );
    expect(screen.getByText('精选生成中…')).toBeTruthy();
    expect(screen.getByLabelText('精选加载中')).toBeTruthy();
  });

  it('shows EmptyState when status=no_signals', () => {
    render(
      <RadarBriefingPanel {...defaultProps} status="no_signals" signals={[]} />
    );
    expect(screen.getByText(/今日 0 条信号/)).toBeTruthy();
  });

  it('shows EmptyState when status=completed and signals is empty', () => {
    render(
      <RadarBriefingPanel {...defaultProps} status="completed" signals={[]} />
    );
    expect(screen.getByText(/今日 0 条信号/)).toBeTruthy();
  });

  it('renders all signal cards when completed with signals', () => {
    const signals = [makeSignal('s1'), makeSignal('s2'), makeSignal('s3')];
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="completed"
        signals={signals}
      />
    );
    expect(screen.getByText('Signal s1')).toBeTruthy();
    expect(screen.getByText('Signal s2')).toBeTruthy();
    expect(screen.getByText('Signal s3')).toBeTruthy();
  });

  it('renders rerun button when onRerun is provided', () => {
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="completed"
        signals={[]}
        onRerun={vi.fn()}
        rerunCount={0}
      />
    );
    expect(screen.getByRole('button', { name: '重新精选' })).toBeTruthy();
  });

  it('disables rerun button when rerunCount >= 2', () => {
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="completed"
        signals={[]}
        onRerun={vi.fn()}
        rerunCount={2}
      />
    );
    const btn = screen.getByRole('button', { name: '重新精选' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('disables rerun button when status=generating', () => {
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="generating"
        signals={[]}
        onRerun={vi.fn()}
        rerunCount={0}
      />
    );
    const btn = screen.getByRole('button', { name: '重新精选' });
    expect((btn as HTMLButtonElement).disabled).toBe(true);
  });

  it('calls onRerun when rerun button clicked and count < 2', () => {
    const onRerun = vi.fn();
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="completed"
        signals={[]}
        onRerun={onRerun}
        rerunCount={1}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: '重新精选' }));
    expect(onRerun).toHaveBeenCalledTimes(1);
  });

  it('shows rerun count text when rerunCount > 0', () => {
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="completed"
        signals={[]}
        onRerun={vi.fn()}
        rerunCount={1}
      />
    );
    expect(screen.getByText('今日已精选 1 次')).toBeTruthy();
  });

  it('does not show rerun count text when rerunCount is 0', () => {
    render(
      <RadarBriefingPanel
        {...defaultProps}
        status="completed"
        signals={[]}
        onRerun={vi.fn()}
        rerunCount={0}
      />
    );
    expect(screen.queryByText(/今日已精选/)).toBeNull();
  });
});
