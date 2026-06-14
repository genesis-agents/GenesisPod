/// <reference types="@testing-library/jest-dom" />

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('lucide-react', () => ({
  Database: (props: Record<string, unknown>) => (
    <svg data-testid="database-icon" {...props} />
  ),
  Tag: (props: Record<string, unknown>) => (
    <svg data-testid="tag-icon" {...props} />
  ),
  AlertCircle: (props: Record<string, unknown>) => (
    <svg data-testid="alert-circle-icon" {...props} />
  ),
}));

vi.mock('@/components/agent-playground/ui', () => ({
  Card: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => (
    <div data-testid="card" className={className}>
      {children}
    </div>
  ),
}));

import { MemoryIndexPanel } from '../MemoryIndexPanel';
import type { MemoryIndexState } from '@/lib/features/agent-playground/mission-presentation.types';

describe('MemoryIndexPanel', () => {
  describe('header', () => {
    it('always renders the title', () => {
      render(<MemoryIndexPanel memory={null} />);
      expect(screen.getByText('记忆自动索引')).toBeInTheDocument();
    });

    it('renders database icon', () => {
      render(<MemoryIndexPanel memory={null} />);
      expect(screen.getByTestId('database-icon')).toBeInTheDocument();
    });
  });

  describe('empty states (memory = null)', () => {
    it('shows running state text by default (missionPhase = running)', () => {
      render(<MemoryIndexPanel memory={null} />);
      expect(
        screen.getByText(
          /Mission 运行中，trajectory 将在 S8（撰写完成）后自动向量化入用户记忆/
        )
      ).toBeInTheDocument();
    });

    it('shows running state text when missionPhase is running', () => {
      render(<MemoryIndexPanel memory={null} missionPhase="running" />);
      expect(screen.getByText(/Mission 运行中/)).toBeInTheDocument();
    });

    it('shows aborted state text when missionPhase is aborted', () => {
      render(<MemoryIndexPanel memory={null} missionPhase="aborted" />);
      expect(
        screen.getByText(/Mission 已中止，未生成记忆索引/)
      ).toBeInTheDocument();
    });

    it('shows amber warning when missionPhase is completed-noindex', () => {
      render(
        <MemoryIndexPanel memory={null} missionPhase="completed-noindex" />
      );
      expect(screen.getByText(/memory:indexed 事件未发出/)).toBeInTheDocument();
      expect(screen.getByTestId('alert-circle-icon')).toBeInTheDocument();
    });

    it('shows running state for completed-success phase (no null memory branch)', () => {
      // completed-success phase with null memory falls through to the else (running) branch
      render(
        <MemoryIndexPanel memory={null} missionPhase="completed-success" />
      );
      expect(screen.getByText(/Mission 运行中/)).toBeInTheDocument();
    });
  });

  describe('with memory data', () => {
    const memory: MemoryIndexState = { chunks: 42 };

    it('renders chunk count', () => {
      render(<MemoryIndexPanel memory={memory} />);
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('renders "chunks 已索引" label', () => {
      render(<MemoryIndexPanel memory={memory} />);
      expect(screen.getByText('chunks 已索引')).toBeInTheDocument();
    });

    it('does not render namespace section when namespace is absent', () => {
      render(<MemoryIndexPanel memory={memory} />);
      expect(screen.queryByText('namespace')).not.toBeInTheDocument();
    });

    it('renders namespace when provided', () => {
      render(
        <MemoryIndexPanel memory={{ ...memory, namespace: 'user:abc123' }} />
      );
      expect(screen.getByText('user:abc123')).toBeInTheDocument();
      expect(screen.getByText(/namespace/)).toBeInTheDocument();
    });

    it('does not render tags section when tags is absent', () => {
      render(<MemoryIndexPanel memory={memory} />);
      expect(screen.queryByTestId('tag-icon')).not.toBeInTheDocument();
    });

    it('does not render tags section when tags is empty array', () => {
      render(<MemoryIndexPanel memory={{ ...memory, tags: [] }} />);
      expect(screen.queryByTestId('tag-icon')).not.toBeInTheDocument();
    });

    it('renders tags when provided', () => {
      render(
        <MemoryIndexPanel
          memory={{ ...memory, tags: ['ai', 'research', 'market'] }}
        />
      );
      expect(screen.getByText('ai')).toBeInTheDocument();
      expect(screen.getByText('research')).toBeInTheDocument();
      expect(screen.getByText('market')).toBeInTheDocument();
      expect(screen.getByTestId('tag-icon')).toBeInTheDocument();
    });

    it('renders chunk count of 0', () => {
      render(<MemoryIndexPanel memory={{ chunks: 0 }} />);
      expect(screen.getByText('0')).toBeInTheDocument();
    });

    it('renders chunk count of 1000', () => {
      render(<MemoryIndexPanel memory={{ chunks: 1000 }} />);
      expect(screen.getByText('1000')).toBeInTheDocument();
    });
  });

  describe('missionPhase with memory present', () => {
    it('ignores missionPhase when memory is not null', () => {
      render(
        <MemoryIndexPanel memory={{ chunks: 5 }} missionPhase="aborted" />
      );
      // Should show the chunk data, not the aborted message
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.queryByText(/Mission 已中止/)).not.toBeInTheDocument();
    });
  });
});
