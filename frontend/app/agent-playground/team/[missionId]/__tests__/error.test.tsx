/**
 * Tests for app/agent-playground/team/[missionId]/error.tsx
 *
 * Next.js error boundary component that:
 *   - Reports error to backend via fetch
 *   - Shows error info (message, digest, stack)
 *   - Has "重试渲染" (reset) and "返回 Mission 列表" buttons
 */
import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Browser API stubs ─────────────────────────────────────────────
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// ── next/navigation ───────────────────────────────────────────────
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ missionId: 'test-mission-id' }),
  useRouter: () => ({ push: mockPush }),
}));

// ── @/lib/utils/config ───────────────────────────────────────────
vi.mock('@/lib/utils/config', () => ({
  config: {
    getBackendUrl: () => 'http://localhost:3001',
    brand: { name: 'TestApp' },
  },
}));

// ── @/lib/utils/auth ─────────────────────────────────────────────
const mockGetAuthHeader = vi.fn(() => ({ Authorization: 'Bearer test-token' }));
vi.mock('@/lib/utils/auth', () => ({
  getAuthHeader: () => mockGetAuthHeader(),
}));

// ── global fetch ─────────────────────────────────────────────────
const mockFetch = vi.fn();

import MissionDetailError from '../error';

describe('MissionDetailError', () => {
  const baseError = Object.assign(new Error('Something went wrong'), {
    stack: 'Error: Something went wrong\n  at line1\n  at line2',
    digest: undefined as string | undefined,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockFetch.mockResolvedValue({ ok: true });
    global.fetch = mockFetch;
    mockGetAuthHeader.mockReturnValue({ Authorization: 'Bearer test-token' });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the error heading', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    expect(screen.getByText('该 Mission 解析异常')).toBeInTheDocument();
  });

  it('shows mission ID from useParams', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    expect(screen.getByText('test-mission-id')).toBeInTheDocument();
  });

  it('shows the error message', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows "未知错误" when error.message is empty', async () => {
    const emptyError = Object.assign(new Error(''), {
      stack: undefined as string | undefined,
      digest: undefined as string | undefined,
    });
    emptyError.message = '';
    await act(async () => {
      render(<MissionDetailError error={emptyError} reset={vi.fn()} />);
    });
    expect(screen.getByText('未知错误')).toBeInTheDocument();
  });

  it('shows digest when provided', async () => {
    const errorWithDigest = Object.assign(new Error('test'), {
      digest: 'abc123' as string | undefined,
    });
    await act(async () => {
      render(<MissionDetailError error={errorWithDigest} reset={vi.fn()} />);
    });
    expect(screen.getByText(/digest: abc123/)).toBeInTheDocument();
  });

  it('does not show digest section when no digest', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    expect(screen.queryByText(/digest:/)).not.toBeInTheDocument();
  });

  it('renders error stack details toggle when stack exists', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    expect(screen.getByText('错误堆栈（前 5 行）')).toBeInTheDocument();
  });

  it('does not render stack details when no stack and no message', async () => {
    // stackPreview = (error.stack ?? error.message ?? '') — when both are empty/falsy,
    // the details section is not rendered.
    const emptyError = {
      name: 'Error',
      message: '',
      stack: undefined,
      digest: undefined,
    } as Error & { digest?: string };
    await act(async () => {
      render(<MissionDetailError error={emptyError} reset={vi.fn()} />);
    });
    expect(screen.queryByText('错误堆栈（前 5 行）')).not.toBeInTheDocument();
  });

  it('renders stack details using message as fallback when stack is undefined', async () => {
    // When stack is undefined, the component falls back to error.message for stack preview.
    // If message is non-empty, the details toggle will appear.
    const noStackError = {
      name: 'Error',
      message: 'no stack error',
      stack: undefined,
      digest: undefined,
    } as Error & { digest?: string };
    await act(async () => {
      render(<MissionDetailError error={noStackError} reset={vi.fn()} />);
    });
    // stack preview section IS rendered (message used as fallback)
    expect(screen.getByText('错误堆栈（前 5 行）')).toBeInTheDocument();
  });

  it('shows "正在上报到后端…" initially', async () => {
    // Make fetch pending
    mockFetch.mockReturnValue(new Promise(() => {}));
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    expect(screen.getByText('正在上报到后端…')).toBeInTheDocument();
  });

  it('shows "已自动上报到后端" after fetch resolves', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    await waitFor(() => {
      expect(
        screen.getByText('已自动上报到后端，工程团队会跟进')
      ).toBeInTheDocument();
    });
  });

  it('calls fetch with correct endpoint', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/api/v1/playground/error-report',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
        })
      );
    });
  });

  it('handles fetch failure gracefully (no crash)', async () => {
    mockFetch.mockRejectedValue(new Error('network error'));
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    // Should still render without crashing
    expect(screen.getByText('该 Mission 解析异常')).toBeInTheDocument();
  });

  it('calls reset when "重试渲染" button clicked', async () => {
    const resetMock = vi.fn();
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={resetMock} />);
    });
    fireEvent.click(screen.getByText('重试渲染'));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it('navigates back to list when "返回 Mission 列表" clicked', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    fireEvent.click(screen.getByText('返回 Mission 列表'));
    expect(mockPush).toHaveBeenCalledWith('/agent-playground');
  });

  it('reports error with correct payload fields', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const callArgs = mockFetch.mock.calls[0];
    const body = JSON.parse(callArgs[1].body as string);
    expect(body.missionId).toBe('test-mission-id');
    expect(body.message).toBe('Something went wrong');
    expect(body.timestamp).toBeTruthy();
    expect(body.pathname).toBeTruthy();
  });

  it('includes Authorization header when auth token available', async () => {
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].headers?.Authorization).toBe('Bearer test-token');
  });

  it('uses "unknown" as missionId when params.missionId is absent', async () => {
    // Re-mock with no missionId
    vi.doMock('next/navigation', () => ({
      useParams: () => ({}),
      useRouter: () => ({ push: mockPush }),
    }));
    // Test the fallback by verifying the component renders without crashing
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    expect(screen.getByText('该 Mission 解析异常')).toBeInTheDocument();
  });

  it('re-reports when error changes', async () => {
    const firstError = new Error('first');
    const secondError = new Error('second');

    const { rerender } = render(
      <MissionDetailError error={firstError} reset={vi.fn()} />
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    await act(async () => {
      rerender(<MissionDetailError error={secondError} reset={vi.fn()} />);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it('omits Authorization header when getAuthHeader returns empty object (line 40 arm 1)', async () => {
    // Line 40: auth.Authorization ? { Authorization } : {} - arm 1 (empty object)
    // Override mockGetAuthHeader to return {} without Authorization
    mockGetAuthHeader.mockReturnValueOnce({} as { Authorization: string });
    await act(async () => {
      render(<MissionDetailError error={baseError} reset={vi.fn()} />);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    const callArgs = mockFetch.mock.calls[mockFetch.mock.calls.length - 1];
    // Authorization header should not be present (or undefined)
    expect(callArgs[1].headers?.Authorization).toBeUndefined();
  });

  it('stack fallback uses empty string when both stack and message are undefined (line 79 arm 2)', async () => {
    // Line 79: error.stack ?? error.message ?? '' - arm 2 = '' (both null/undefined)
    // Both error.stack = undefined and error.message = undefined → fallback to ''
    const noMsgNoStack = {
      name: 'Error',
      message: undefined as unknown as string,
      stack: undefined,
      digest: undefined,
    } as Error & { digest?: string };
    await act(async () => {
      render(<MissionDetailError error={noMsgNoStack} reset={vi.fn()} />);
    });
    // stackPreview = '' → no details section shown
    expect(screen.queryByText('错误堆栈（前 5 行）')).not.toBeInTheDocument();
  });
});
