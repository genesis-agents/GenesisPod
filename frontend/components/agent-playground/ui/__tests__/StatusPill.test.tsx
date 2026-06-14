import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusPill } from '../StatusPill';

describe('StatusPill', () => {
  it('renders done status with label', () => {
    render(<StatusPill status="done" />);
    expect(screen.getByText('已完成')).toBeInTheDocument();
  });

  it('renders running status with label', () => {
    render(<StatusPill status="running" />);
    expect(screen.getByText('进行中')).toBeInTheDocument();
  });

  it('renders failed status with label', () => {
    render(<StatusPill status="failed" />);
    expect(screen.getByText('失败')).toBeInTheDocument();
  });

  it('renders pending status with label', () => {
    render(<StatusPill status="pending" />);
    expect(screen.getByText('待启动')).toBeInTheDocument();
  });

  it('renders blocked status with label', () => {
    render(<StatusPill status="blocked" />);
    expect(screen.getByText('阻塞')).toBeInTheDocument();
  });

  it('renders cancelled status with label', () => {
    render(<StatusPill status="cancelled" />);
    expect(screen.getByText('已放弃')).toBeInTheDocument();
  });

  it('showLabel=false renders empty label string', () => {
    render(<StatusPill status="done" showLabel={false} />);
    expect(screen.queryByText('已完成')).not.toBeInTheDocument();
  });

  it('showLabel=true (default) shows label', () => {
    render(<StatusPill status="running" showLabel={true} />);
    expect(screen.getByText('进行中')).toBeInTheDocument();
  });

  it('renders with size=md', () => {
    const { container } = render(<StatusPill status="done" size="md" />);
    // StatusBadge renders a span; verify it mounts
    expect(container.querySelector('span')).toBeTruthy();
  });

  it('renders with size=sm (default)', () => {
    const { container } = render(<StatusPill status="done" />);
    expect(container.querySelector('span')).toBeTruthy();
  });

  it('running status has pulse prop set (renders animate-spin)', () => {
    const { container } = render(<StatusPill status="running" />);
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // SVG className is SVGAnimatedString in jsdom, use getAttribute or check class attr
    const classAttr = svg?.getAttribute('class') ?? '';
    expect(classAttr).toContain('animate-spin');
  });

  it('non-running status does not have animate-spin', () => {
    const { container } = render(<StatusPill status="done" />);
    const svg = container.querySelector('svg');
    const classAttr = svg?.getAttribute('class') ?? '';
    expect(classAttr).not.toContain('animate-spin');
  });
});
