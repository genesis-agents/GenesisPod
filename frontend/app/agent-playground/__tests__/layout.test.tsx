/**
 * Tests for app/agent-playground/layout.tsx
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Mock AppShell — heavy layout component
vi.mock('@/components/layout/AppShell', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

import AgentPlaygroundLayout from '../layout';

describe('AgentPlaygroundLayout', () => {
  it('renders AppShell wrapper', () => {
    render(
      <AgentPlaygroundLayout>
        <div data-testid="child-content">hello</div>
      </AgentPlaygroundLayout>
    );
    expect(screen.getByTestId('app-shell')).toBeInTheDocument();
  });

  it('renders children inside main element', () => {
    render(
      <AgentPlaygroundLayout>
        <div data-testid="child-content">page content</div>
      </AgentPlaygroundLayout>
    );
    const child = screen.getByTestId('child-content');
    expect(child).toBeInTheDocument();
    expect(child.textContent).toBe('page content');
  });

  it('wraps children in a main tag with correct classes', () => {
    render(
      <AgentPlaygroundLayout>
        <span>test</span>
      </AgentPlaygroundLayout>
    );
    const main = document.querySelector('main');
    expect(main).toBeInTheDocument();
    expect(main?.className).toContain('flex');
    expect(main?.className).toContain('flex-col');
    expect(main?.className).toContain('overflow-hidden');
  });

  it('renders multiple children', () => {
    render(
      <AgentPlaygroundLayout>
        <div data-testid="child-a">A</div>
        <div data-testid="child-b">B</div>
      </AgentPlaygroundLayout>
    );
    expect(screen.getByTestId('child-a')).toBeInTheDocument();
    expect(screen.getByTestId('child-b')).toBeInTheDocument();
  });
});
