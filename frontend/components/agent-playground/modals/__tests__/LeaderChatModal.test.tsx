import React from 'react';
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeaderChatModal } from '../LeaderChatModal';

// Stub browser APIs
Element.prototype.scrollIntoView = vi.fn();
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// Mock API
const mockListLeaderChat = vi.fn();
const mockSendLeaderChat = vi.fn();

vi.mock('@/services/agent-playground/api', () => ({
  listLeaderChat: (...args: unknown[]) => mockListLeaderChat(...args),
  sendLeaderChat: (...args: unknown[]) => mockSendLeaderChat(...args),
}));

// Controllable AuthContext mock
let mockAuthUser: {
  fullName?: string | null;
  username?: string | null;
} | null = {
  fullName: 'Test User',
  username: 'testuser',
};

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: mockAuthUser,
    isLoading: false,
    isAdmin: false,
  }),
}));

// Mock LeaderChatDock
vi.mock('@/components/common/leader-chat', () => ({
  LeaderChatDock: ({
    open,
    onClose,
    messages,
    loading,
    error,
    sending,
    onSend,
    title,
    subtitle,
    accentColor,
    userName,
    renderAssistantHeaderExtra,
    renderAssistantBodyPrefix,
    renderAssistantBodyExtra,
  }: {
    open: boolean;
    onClose: () => void;
    messages: Array<{
      id: string;
      role: string;
      content: string;
      meta?: unknown;
    }>;
    loading: boolean;
    error: string | null;
    sending: boolean;
    onSend: (text: string) => void;
    title: string;
    subtitle?: string;
    accentColor?: string;
    userName: string;
    renderAssistantHeaderExtra?: (msg: {
      id: string;
      role: string;
      content: string;
      meta?: unknown;
    }) => React.ReactNode;
    renderAssistantBodyPrefix?: (msg: {
      id: string;
      role: string;
      content: string;
      meta?: unknown;
    }) => React.ReactNode;
    renderAssistantBodyExtra?: (msg: {
      id: string;
      role: string;
      content: string;
      meta?: unknown;
    }) => React.ReactNode;
  }) =>
    open ? (
      <div data-testid="leader-chat-dock">
        <span data-testid="dock-title">{title}</span>
        <span data-testid="dock-subtitle">{subtitle}</span>
        <span data-testid="dock-user">{userName}</span>
        {loading && <span data-testid="loading">loading</span>}
        {error && <span data-testid="error">{error}</span>}
        {sending && <span data-testid="sending">sending</span>}
        <button data-testid="close-btn" onClick={onClose}>
          close
        </button>
        <button data-testid="send-btn" onClick={() => onSend('test message')}>
          send
        </button>
        {messages.map((m) => (
          <div key={m.id} data-testid={`msg-${m.id}`} data-role={m.role}>
            <span>{m.content}</span>
            {m.role === 'assistant' && renderAssistantHeaderExtra && (
              <div data-testid="header-extra">
                {renderAssistantHeaderExtra(m)}
              </div>
            )}
            {m.role === 'assistant' && renderAssistantBodyPrefix && (
              <div data-testid="body-prefix">
                {renderAssistantBodyPrefix(m)}
              </div>
            )}
            {m.role === 'assistant' && renderAssistantBodyExtra && (
              <div data-testid="body-extra">{renderAssistantBodyExtra(m)}</div>
            )}
          </div>
        ))}
      </div>
    ) : null,
}));

function makeApiMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    role: 'assistant',
    content: 'Hello',
    tokensUsed: 10,
    createdAt: new Date().toISOString(),
    decision: null,
    ...overrides,
  };
}

describe('LeaderChatModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListLeaderChat.mockResolvedValue([]);
    mockAuthUser = { fullName: 'Test User', username: 'testuser' };
  });

  it('does not render when open=false', () => {
    render(<LeaderChatModal missionId="m1" open={false} onClose={vi.fn()} />);
    expect(screen.queryByTestId('leader-chat-dock')).toBeNull();
  });

  it('renders when open=true', async () => {
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('leader-chat-dock')).toBeInTheDocument();
    });
  });

  it('shows title and subtitle', async () => {
    render(
      <LeaderChatModal
        missionId="m1"
        open
        onClose={vi.fn()}
        topic="AI Research"
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('dock-title')).toHaveTextContent(
        '与 Leader 对话'
      );
      expect(screen.getByTestId('dock-subtitle')).toHaveTextContent(
        'AI Research'
      );
    });
  });

  it('uses Research mission as default subtitle', async () => {
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('dock-subtitle')).toHaveTextContent(
        'Research mission'
      );
    });
  });

  it('shows username from useAuth', async () => {
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('dock-user')).toHaveTextContent('Test User');
    });
  });

  it('loads messages on open', async () => {
    const messages = [
      makeApiMessage({
        id: 'u1',
        role: 'user',
        content: 'Hello',
        decision: null,
      }),
      makeApiMessage({
        id: 'a1',
        role: 'assistant',
        content: 'Hi there',
        decision: null,
      }),
    ];
    mockListLeaderChat.mockResolvedValue(messages);
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('Hello')).toBeInTheDocument();
      expect(screen.getByText('Hi there')).toBeInTheDocument();
    });
  });

  it('shows loading state while fetching messages', async () => {
    mockListLeaderChat.mockReturnValue(new Promise(() => {}));
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    expect(screen.getByTestId('loading')).toBeInTheDocument();
  });

  it('shows error when loading fails', async () => {
    mockListLeaderChat.mockRejectedValue(new Error('Load failed'));
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Load failed');
    });
  });

  it('does not load when closed', () => {
    render(<LeaderChatModal missionId="m1" open={false} onClose={vi.fn()} />);
    expect(mockListLeaderChat).not.toHaveBeenCalled();
  });

  it('calls onClose when close button clicked', async () => {
    const onClose = vi.fn();
    render(<LeaderChatModal missionId="m1" open onClose={onClose} />);
    await waitFor(() => screen.getByTestId('close-btn'));
    fireEvent.click(screen.getByTestId('close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('sends message optimistically', async () => {
    mockSendLeaderChat.mockResolvedValue({
      user: makeApiMessage({
        id: 'u2',
        role: 'user',
        content: 'test message',
        decision: null,
      }),
      assistant: makeApiMessage({
        id: 'a2',
        role: 'assistant',
        content: 'Response',
        decision: null,
      }),
    });
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId('send-btn'));
    fireEvent.click(screen.getByTestId('send-btn'));
    // Optimistic user message should appear briefly
    await waitFor(() => {
      expect(mockSendLeaderChat).toHaveBeenCalledWith('m1', 'test message');
    });
  });

  it('shows sending state while sending', async () => {
    mockSendLeaderChat.mockReturnValue(new Promise(() => {}));
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId('send-btn'));
    fireEvent.click(screen.getByTestId('send-btn'));
    expect(screen.getByTestId('sending')).toBeInTheDocument();
  });

  it('shows error when send fails', async () => {
    mockSendLeaderChat.mockRejectedValue(new Error('Send failed'));
    render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
    await waitFor(() => screen.getByTestId('send-btn'));
    fireEvent.click(screen.getByTestId('send-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('error')).toHaveTextContent('Send failed');
    });
  });

  it('calls onDimensionsAppended when dimensions added', async () => {
    const onDimensionsAppended = vi.fn();
    mockSendLeaderChat.mockResolvedValue({
      user: makeApiMessage({
        id: 'u3',
        role: 'user',
        content: 'test message',
        decision: null,
      }),
      assistant: makeApiMessage({
        id: 'a3',
        role: 'assistant',
        content: 'Added dimensions',
        decision: null,
      }),
      appendedDimensionIds: ['dim-1', 'dim-2'],
    });
    render(
      <LeaderChatModal
        missionId="m1"
        open
        onClose={vi.fn()}
        onDimensionsAppended={onDimensionsAppended}
      />
    );
    await waitFor(() => screen.getByTestId('send-btn'));
    fireEvent.click(screen.getByTestId('send-btn'));
    await waitFor(() => {
      expect(onDimensionsAppended).toHaveBeenCalledWith(['dim-1', 'dim-2']);
    });
  });

  it('does not call onDimensionsAppended when empty array', async () => {
    const onDimensionsAppended = vi.fn();
    mockSendLeaderChat.mockResolvedValue({
      user: makeApiMessage({
        id: 'u4',
        role: 'user',
        content: 'x',
        decision: null,
      }),
      assistant: makeApiMessage({
        id: 'a4',
        role: 'assistant',
        content: 'ok',
        decision: null,
      }),
      appendedDimensionIds: [],
    });
    render(
      <LeaderChatModal
        missionId="m1"
        open
        onClose={vi.fn()}
        onDimensionsAppended={onDimensionsAppended}
      />
    );
    await waitFor(() => screen.getByTestId('send-btn'));
    fireEvent.click(screen.getByTestId('send-btn'));
    await waitFor(() => expect(mockSendLeaderChat).toHaveBeenCalled());
    expect(onDimensionsAppended).not.toHaveBeenCalled();
  });

  describe('renderAssistantHeaderExtra', () => {
    it('renders DIRECT_ANSWER chip', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Here is the answer',
          decision: { type: 'DIRECT_ANSWER' },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('回答')).toBeInTheDocument();
      });
    });

    it('renders CREATE_TODO chip', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Created task',
          decision: { type: 'CREATE_TODO', todo: [] },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('追加任务')).toBeInTheDocument();
      });
    });

    it('renders CLARIFY chip', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Please clarify',
          decision: { type: 'CLARIFY', clarifyOptions: [] },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('需要澄清')).toBeInTheDocument();
      });
    });

    it('renders ACKNOWLEDGE chip', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Acknowledged',
          decision: { type: 'ACKNOWLEDGE' },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('收到')).toBeInTheDocument();
      });
    });

    it('returns null for unknown decision type', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Unknown',
          decision: { type: 'UNKNOWN_TYPE' },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('Unknown'));
      // No chip should appear for unknown type
      expect(screen.queryByText('回答')).toBeNull();
    });

    it('returns null when no decision', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'No decision',
          decision: null,
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('No decision'));
      const headerExtra = screen.getByTestId('header-extra');
      expect(headerExtra.textContent).toBe('');
    });
  });

  describe('renderAssistantBodyPrefix', () => {
    it('renders understanding chip when decision has understanding', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Response',
          decision: {
            type: 'DIRECT_ANSWER',
            understanding: 'User wants to know X',
          },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('理解：')).toBeInTheDocument();
        expect(screen.getByText('User wants to know X')).toBeInTheDocument();
      });
    });

    it('returns null when no understanding', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'No understanding',
          decision: { type: 'DIRECT_ANSWER' },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('No understanding'));
      expect(screen.queryByText('理解：')).toBeNull();
    });

    it('returns null when no decision', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'No decision',
          decision: null,
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('No decision'));
      expect(screen.queryByText('理解：')).toBeNull();
    });
  });

  describe('renderAssistantBodyExtra', () => {
    it('renders CREATE_TODO list with items', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Added tasks',
          decision: {
            type: 'CREATE_TODO',
            todo: [
              { name: 'Task 1', rationale: 'Reason 1' },
              { name: 'Task 2', rationale: 'Reason 2' },
            ],
          },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('Task 1')).toBeInTheDocument();
        expect(screen.getByText('Reason 1')).toBeInTheDocument();
        expect(screen.getByText('Task 2')).toBeInTheDocument();
        expect(
          screen.getByText(/已追加到 Mission · 2 个任务/)
        ).toBeInTheDocument();
      });
    });

    it('returns null for CREATE_TODO with empty todo', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Empty TODO',
          decision: { type: 'CREATE_TODO', todo: [] },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('Empty TODO'));
      expect(screen.queryByText(/已追加到 Mission/)).toBeNull();
    });

    it('renders CLARIFY options as buttons', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Clarify needed',
          decision: {
            type: 'CLARIFY',
            clarifyOptions: ['Option A', 'Option B'],
          },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('Option A')).toBeInTheDocument();
        expect(screen.getByText('Option B')).toBeInTheDocument();
      });
    });

    it('clicking CLARIFY option sends message', async () => {
      mockSendLeaderChat.mockResolvedValue({
        user: makeApiMessage({
          id: 'u2',
          role: 'user',
          content: 'Option A',
          decision: null,
        }),
        assistant: makeApiMessage({
          id: 'a2',
          role: 'assistant',
          content: 'Response',
          decision: null,
        }),
      });
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Please choose',
          decision: {
            type: 'CLARIFY',
            clarifyOptions: ['Option A'],
          },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('Option A'));
      fireEvent.click(screen.getByText('Option A'));
      await waitFor(() => {
        expect(mockSendLeaderChat).toHaveBeenCalledWith('m1', 'Option A');
      });
    });

    it('returns null for CLARIFY with empty options', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'No options',
          decision: { type: 'CLARIFY', clarifyOptions: [] },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('No options'));
      expect(screen.queryByRole('button', { name: /Option/ })).toBeNull();
    });

    it('returns null when no decision', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'No dec',
          decision: null,
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('No dec'));
      const bodyExtra = screen.getByTestId('body-extra');
      expect(bodyExtra.textContent).toBe('');
    });

    it('returns null for ACKNOWLEDGE decision', async () => {
      const messages = [
        makeApiMessage({
          id: 'a1',
          role: 'assistant',
          content: 'Ack',
          decision: { type: 'ACKNOWLEDGE' },
        }),
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByText('Ack'));
      const bodyExtra = screen.getByTestId('body-extra');
      expect(bodyExtra.textContent).toBe('');
    });
  });

  describe('useAuth fallbacks (line 65 branch coverage)', () => {
    it('uses fullName when available', async () => {
      // fullName='Test User' → shows 'Test User'
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByTestId('dock-user'));
      expect(screen.getByTestId('dock-user')).toHaveTextContent('Test User');
    });

    it('falls back to username when fullName is null (covers || username branch)', async () => {
      mockAuthUser = { fullName: null, username: 'myuser' };
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByTestId('dock-user'));
      expect(screen.getByTestId('dock-user')).toHaveTextContent('myuser');
    });

    it("falls back to 'User' when both fullName and username are null (covers || 'User' branch at line 65)", async () => {
      mockAuthUser = { fullName: null, username: null };
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByTestId('dock-user'));
      expect(screen.getByTestId('dock-user')).toHaveTextContent('User');
    });

    it("falls back to 'User' when user is null", async () => {
      mockAuthUser = null;
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByTestId('dock-user'));
      expect(screen.getByTestId('dock-user')).toHaveTextContent('User');
    });
  });

  describe('cancelled effect cleanup', () => {
    it('does not setState when component unmounts during fetch (success path)', async () => {
      let resolve: (v: unknown[]) => void;
      mockListLeaderChat.mockReturnValue(
        new Promise((r) => {
          resolve = r;
        })
      );
      const { unmount } = render(
        <LeaderChatModal missionId="m1" open onClose={vi.fn()} />
      );
      unmount();
      // Resolve after unmount — should not throw
      act(() => {
        resolve!([]);
      });
      // No assertion needed - just verifying no errors thrown
    });

    it('does not setState when component unmounts during fetch that then fails (covers cancelled error branch lines 85-86)', async () => {
      // This covers the `if (!cancelled)` branch in the catch handler where cancelled=true
      let reject: (e: Error) => void;
      mockListLeaderChat.mockReturnValue(
        new Promise<unknown[]>((_, r) => {
          reject = r;
        })
      );
      const { unmount } = render(
        <LeaderChatModal missionId="m1" open onClose={vi.fn()} />
      );
      unmount();
      // Reject after unmount — cancelled=true, so catch branch skips setState
      act(() => {
        reject!(new Error('Network gone'));
      });
      // No assertion — just verifying no errors thrown when cancelled
    });
  });

  describe('non-Error exception handling (line 136 branch coverage)', () => {
    it('handles non-Error thrown during send (covers String(e) branch)', async () => {
      // Throw a string (not an Error) to hit the `String(e)` branch at line 136
      mockSendLeaderChat.mockRejectedValue('string-error');
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => screen.getByTestId('send-btn'));
      fireEvent.click(screen.getByTestId('send-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent('string-error');
      });
    });

    it('handles non-Error thrown during fetch load (covers String(e) branch in catch)', async () => {
      // Throw a plain object to hit `String(e)` branch at lines 85-86
      mockListLeaderChat.mockRejectedValue('fetch-string-error');
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByTestId('error')).toHaveTextContent(
          'fetch-string-error'
        );
      });
    });
  });

  describe('message transformation', () => {
    it('converts API message with decision', async () => {
      const messages = [
        {
          id: 'msg-with-decision',
          role: 'assistant',
          content: 'With decision',
          tokensUsed: 5,
          createdAt: new Date().toISOString(),
          decision: { type: 'DIRECT_ANSWER', score: 90 },
        },
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('With decision')).toBeInTheDocument();
        expect(screen.getByText('回答')).toBeInTheDocument();
      });
    });

    it('converts API message without decision', async () => {
      const messages = [
        {
          id: 'msg-no-decision',
          role: 'user',
          content: 'No decision msg',
          tokensUsed: null,
          createdAt: new Date().toISOString(),
          decision: null,
        },
      ];
      mockListLeaderChat.mockResolvedValue(messages);
      render(<LeaderChatModal missionId="m1" open onClose={vi.fn()} />);
      await waitFor(() => {
        expect(screen.getByText('No decision msg')).toBeInTheDocument();
      });
    });
  });
});
