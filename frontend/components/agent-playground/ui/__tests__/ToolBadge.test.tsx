import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ToolBadge } from '../ToolBadge';

describe('ToolBadge', () => {
  it('renders known tool label: web-search', () => {
    render(<ToolBadge toolId="web-search" />);
    expect(screen.getByText('网络搜索')).toBeInTheDocument();
  });

  it('renders known tool label: web-scraper', () => {
    render(<ToolBadge toolId="web-scraper" />);
    expect(screen.getByText('网页抓取')).toBeInTheDocument();
  });

  it('renders known tool label: arxiv-search', () => {
    render(<ToolBadge toolId="arxiv-search" />);
    expect(screen.getByText('arXiv')).toBeInTheDocument();
  });

  it('renders known tool label: github-search', () => {
    render(<ToolBadge toolId="github-search" />);
    expect(screen.getByText('GitHub')).toBeInTheDocument();
  });

  it('renders known tool label: knowledge-base', () => {
    render(<ToolBadge toolId="knowledge-base" />);
    const els = screen.getAllByText('知识库');
    expect(els.length).toBeGreaterThan(0);
  });

  it('renders known tool label: rag-search', () => {
    render(<ToolBadge toolId="rag-search" />);
    const els = screen.getAllByText('知识库');
    expect(els.length).toBeGreaterThan(0);
  });

  it('renders known tool label: federal-register', () => {
    render(<ToolBadge toolId="federal-register" />);
    expect(screen.getByText('联邦公报')).toBeInTheDocument();
  });

  it('renders known tool label: congress-gov', () => {
    render(<ToolBadge toolId="congress-gov" />);
    expect(screen.getByText('国会立法')).toBeInTheDocument();
  });

  it('renders known tool label: whitehouse-news', () => {
    render(<ToolBadge toolId="whitehouse-news" />);
    expect(screen.getByText('白宫新闻')).toBeInTheDocument();
  });

  it('renders known tool label: academic-search', () => {
    render(<ToolBadge toolId="academic-search" />);
    expect(screen.getByText('学术')).toBeInTheDocument();
  });

  it('renders known tool label: hackernews', () => {
    render(<ToolBadge toolId="hackernews" />);
    expect(screen.getByText('HN')).toBeInTheDocument();
  });

  it('renders unknown tool id as label (fallback)', () => {
    render(<ToolBadge toolId="my-custom-tool" />);
    expect(screen.getByText('my-custom-tool')).toBeInTheDocument();
  });

  it('title attribute shows "label · toolId"', () => {
    const { container } = render(<ToolBadge toolId="web-search" />);
    const span = container.querySelector('span[title]');
    expect(span?.getAttribute('title')).toBe('网络搜索 · web-search');
  });

  it('does not show count chip when count is undefined', () => {
    const { container } = render(<ToolBadge toolId="web-search" />);
    const countChip = container.querySelector('span.font-mono');
    expect(countChip).toBeNull();
  });

  it('does not show count chip when count = 1', () => {
    const { container } = render(<ToolBadge toolId="web-search" count={1} />);
    const countChip = container.querySelector('span.font-mono');
    expect(countChip).toBeNull();
  });

  it('shows count chip when count > 1', () => {
    render(<ToolBadge toolId="web-search" count={5} />);
    expect(screen.getByText('×5')).toBeInTheDocument();
  });

  it('size=xs applies smaller classes', () => {
    const { container } = render(<ToolBadge toolId="web-search" size="xs" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-[10px]');
  });

  it('size=sm (default) applies normal classes', () => {
    const { container } = render(<ToolBadge toolId="web-search" size="sm" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('text-[11px]');
  });

  it('unknown tool uses "other" tone (gray classes)', () => {
    const { container } = render(<ToolBadge toolId="unknown-thing" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-gray-50');
  });

  it('web tool uses web tone (blue classes)', () => {
    const { container } = render(<ToolBadge toolId="web-search" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-blue-50');
  });

  it('academic tool uses academic tone (violet classes)', () => {
    const { container } = render(<ToolBadge toolId="arxiv-search" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-violet-50');
  });

  it('gov tool uses gov tone (amber classes)', () => {
    const { container } = render(<ToolBadge toolId="congress-gov" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-amber-50');
  });

  it('kb tool uses kb tone (emerald classes)', () => {
    const { container } = render(<ToolBadge toolId="knowledge-base" />);
    const span = container.querySelector('span');
    expect(span?.className).toContain('bg-emerald-50');
  });
});
