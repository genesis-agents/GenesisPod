import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Mocks — declared before imports so hoisting works correctly
// ---------------------------------------------------------------------------

const mockSocket = {
  on: vi.fn(),
  emit: vi.fn(),
  connect: vi.fn(),
  disconnect: vi.fn(),
  connected: false,
  id: 'mock-writing-socket-id',
  off: vi.fn(),
  removeAllListeners: vi.fn(),
};

vi.mock('socket.io-client', () => ({
  io: vi.fn(() => mockSocket),
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
  },
}));

import { io } from 'socket.io-client';
import { useWritingWebSocket } from '../useWritingWebSocket';
import type { ChapterContentData } from '../useWritingWebSocket';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getSocketHandler(
  event: string
): ((...args: unknown[]) => void) | undefined {
  const call = mockSocket.on.mock.calls.find((c) => c[0] === event);
  return call?.[1] as ((...args: unknown[]) => void) | undefined;
}

function fireConnect() {
  const handler = getSocketHandler('connect');
  if (handler) {
    act(() => {
      handler();
    });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useWritingWebSocket', () => {
  const PROJECT_ID = 'project-writing-123';

  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.connected = false;
    mockSocket.on.mockClear();
    mockSocket.emit.mockClear();
    mockSocket.disconnect.mockClear();
    mockSocket.removeAllListeners.mockClear();
  });

  // -------------------------------------------------------------------------
  // Connection guards
  // -------------------------------------------------------------------------

  describe('connection guards', () => {
    it('does not connect when projectId is null', () => {
      renderHook(() => useWritingWebSocket(null));
      expect(io).not.toHaveBeenCalled();
    });

    it('does not connect when projectId is empty string', () => {
      renderHook(() => useWritingWebSocket(''));
      expect(io).not.toHaveBeenCalled();
    });

    it('does not connect when enabled is false (boolean arg)', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID, false));
      expect(io).not.toHaveBeenCalled();
    });

    it('does not connect when enabled option is false (options object)', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID, { enabled: false }));
      expect(io).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Connection setup
  // -------------------------------------------------------------------------

  describe('connection setup', () => {
    it('connects to /ai-writing namespace', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID));

      expect(io).toHaveBeenCalledWith(
        expect.stringContaining('/ai-writing'),
        expect.anything()
      );
    });

    it('connects without auth options (no JWT in handshake)', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID));

      const ioOptions = vi.mocked(io).mock.calls[0][1] as Record<
        string,
        unknown
      >;
      // The writing socket does NOT include an auth object
      expect(ioOptions?.auth).toBeUndefined();
    });

    it('connects when enabled is true (boolean)', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID, true));
      expect(io).toHaveBeenCalled();
    });

    it('connects when options object has no enabled field (defaults to true)', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID, {}));
      expect(io).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Initial return state
  // -------------------------------------------------------------------------

  describe('initial return state', () => {
    it('returns isConnected false initially', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));
      expect(result.current.isConnected).toBe(false);
    });

    it('returns null error initially', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));
      expect(result.current.error).toBeNull();
    });

    it('returns progress 0 initially', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));
      expect(result.current.progress).toBe(0);
    });

    it('returns empty activeAgentIds initially', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));
      expect(result.current.activeAgentIds).toEqual([]);
    });

    it('returns empty chapters Map initially', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));
      expect(result.current.chapters).toBeInstanceOf(Map);
      expect(result.current.chapters.size).toBe(0);
    });

    it('returns empty consistencyIssues array initially', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));
      expect(result.current.consistencyIssues).toEqual([]);
    });

    it('returns null worldSettings initially', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));
      expect(result.current.worldSettings).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Connect event
  // -------------------------------------------------------------------------

  describe('on connect event', () => {
    it('sets isConnected to true on connect', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      expect(result.current.isConnected).toBe(true);
    });

    it('emits join:project with projectId on connect', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      expect(mockSocket.emit).toHaveBeenCalledWith('join:project', {
        projectId: PROJECT_ID,
      });
    });
  });

  // -------------------------------------------------------------------------
  // Disconnect
  // -------------------------------------------------------------------------

  describe('disconnect', () => {
    it('emits leave:project when disconnect is called with active projectId', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      act(() => {
        result.current.disconnect();
      });

      expect(mockSocket.emit).toHaveBeenCalledWith('leave:project', {
        projectId: PROJECT_ID,
      });
    });

    it('calls socket.disconnect when disconnect is called', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      act(() => {
        result.current.disconnect();
      });

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('sets isConnected to false after disconnect', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      expect(result.current.isConnected).toBe(true);

      act(() => {
        result.current.disconnect();
      });

      expect(result.current.isConnected).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Boolean vs options arg
  // -------------------------------------------------------------------------

  describe('enabledOrOptions parameter', () => {
    it('accepts a boolean true as second argument', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID, true));
      expect(io).toHaveBeenCalled();
    });

    it('accepts a boolean false as second argument', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID, false));
      expect(io).not.toHaveBeenCalled();
    });

    it('accepts an options object with enabled: true', () => {
      const onEvent = vi.fn();
      renderHook(() =>
        useWritingWebSocket(PROJECT_ID, { enabled: true, onEvent })
      );
      expect(io).toHaveBeenCalled();
    });

    it('accepts an options object with enabled: false', () => {
      renderHook(() => useWritingWebSocket(PROJECT_ID, { enabled: false }));
      expect(io).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Socket event handling
  // -------------------------------------------------------------------------

  describe('socket event handling', () => {
    it('stores chapter content when chapter:content event fires', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      const chapterData: ChapterContentData = {
        chapterNumber: 1,
        title: 'Chapter One',
        content: 'Once upon a time...',
        wordCount: 5,
        volumeIndex: 0,
        timestamp: new Date().toISOString(),
      };

      const chapterHandler = getSocketHandler('chapter:content');
      if (chapterHandler) {
        act(() => {
          chapterHandler(chapterData);
        });

        expect(result.current.chapters.get(1)).toEqual(chapterData);
      }
    });

    it('accumulates consistencyIssues when consistency:issues_found fires', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      const issueData = {
        chapterNumber: 2,
        passed: false,
        issues: [
          {
            type: 'character',
            severity: 'error' as const,
            description: 'Character name inconsistency',
          },
        ],
        timestamp: new Date().toISOString(),
      };

      const issuesHandler = getSocketHandler('consistency:issues_found');
      if (issuesHandler) {
        act(() => {
          issuesHandler(issueData);
        });

        expect(result.current.consistencyIssues).toHaveLength(1);
        expect(result.current.consistencyIssues[0].chapterNumber).toBe(2);
      }
    });

    it('updates worldSettings when world:building_completed fires with settings', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      const worldData = {
        settings: { magic: 'high', tech: 'low' },
        timestamp: new Date().toISOString(),
      };

      const worldHandler = getSocketHandler('world:building_completed');
      if (worldHandler) {
        act(() => {
          worldHandler(worldData);
        });

        expect(result.current.worldSettings).toEqual(worldData.settings);
      }
    });

    it('updates progress when mission:progress fires', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      const progressData = {
        missionId: 'mission-1',
        progress: 42,
        currentStep: 'Writing chapter 3',
        activeAgents: ['writer-agent'],
        timestamp: new Date().toISOString(),
      };

      const progressHandler = getSocketHandler('mission:progress');
      if (progressHandler) {
        act(() => {
          progressHandler(progressData);
        });

        expect(result.current.progress).toBe(42);
        expect(result.current.currentStep).toBe('Writing chapter 3');
      }
    });

    it('calls onEvent callback when an event fires', () => {
      const onEvent = vi.fn();
      renderHook(() =>
        useWritingWebSocket(PROJECT_ID, { enabled: true, onEvent })
      );

      fireConnect();

      const missionHandler = getSocketHandler('mission:started');
      if (missionHandler) {
        act(() => {
          missionHandler({ message: 'Mission launched' });
        });

        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'mission:started' })
        );
      }
    });

    it('adds agent to activeAgentIds when agent:working with status working', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      const agentHandler = getSocketHandler('agent:working');
      if (agentHandler) {
        act(() => {
          agentHandler({
            agentId: 'writer-1',
            agentName: 'Writer',
            agentRole: 'writer',
            status: 'working',
            timestamp: new Date().toISOString(),
          });
        });

        expect(result.current.activeAgentIds).toContain('writer-1');
      }
    });

    it('fires onEvent for keeper:updating_bible event', () => {
      const onEvent = vi.fn();
      renderHook(() =>
        useWritingWebSocket(PROJECT_ID, { enabled: true, onEvent })
      );

      fireConnect();

      const keeperHandler = getSocketHandler('keeper:updating_bible');
      if (keeperHandler) {
        act(() => {
          keeperHandler({
            chapterNumber: 3,
            timestamp: new Date().toISOString(),
          });
        });
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'keeper:updating_bible' })
        );
      }
    });

    it('fires onEvent for keeper:bible_updated event', () => {
      const onEvent = vi.fn();
      renderHook(() =>
        useWritingWebSocket(PROJECT_ID, { enabled: true, onEvent })
      );

      fireConnect();

      const bibleHandler = getSocketHandler('keeper:bible_updated');
      if (bibleHandler) {
        act(() => {
          bibleHandler({
            chapterNumber: 3,
            updates: {
              newFacts: ['Fact 1', 'Fact 2'],
              characterUpdates: [],
              timelineEvents: [],
            },
            timestamp: new Date().toISOString(),
          });
        });
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'keeper:bible_updated' })
        );
      }
    });

    it('fires onEvent for keeper:bible_updated without updates (null path)', () => {
      const onEvent = vi.fn();
      renderHook(() =>
        useWritingWebSocket(PROJECT_ID, { enabled: true, onEvent })
      );

      fireConnect();

      const bibleHandler = getSocketHandler('keeper:bible_updated');
      if (bibleHandler) {
        act(() => {
          bibleHandler({
            chapterNumber: 1,
            timestamp: new Date().toISOString(),
          });
        });
        expect(onEvent).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'keeper:bible_updated' })
        );
      }
    });

    it('removes agent from activeAgentIds when agent:working with status completed', () => {
      const { result } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();

      const agentHandler = getSocketHandler('agent:working');
      if (agentHandler) {
        // First add
        act(() => {
          agentHandler({
            agentId: 'writer-1',
            agentName: 'Writer',
            agentRole: 'writer',
            status: 'working',
            timestamp: new Date().toISOString(),
          });
        });

        // Then complete
        act(() => {
          agentHandler({
            agentId: 'writer-1',
            agentName: 'Writer',
            agentRole: 'writer',
            status: 'completed',
            timestamp: new Date().toISOString(),
          });
        });

        expect(result.current.activeAgentIds).not.toContain('writer-1');
      }
    });
  });

  // -------------------------------------------------------------------------
  // Return shape
  // -------------------------------------------------------------------------

  describe('return shape', () => {
    it('returns all expected fields', () => {
      const { result } = renderHook(() => useWritingWebSocket(null));

      expect(result.current).toHaveProperty('isConnected');
      expect(result.current).toHaveProperty('error');
      expect(result.current).toHaveProperty('progress');
      expect(result.current).toHaveProperty('currentStep');
      expect(result.current).toHaveProperty('activeAgentIds');
      expect(result.current).toHaveProperty('chapters');
      expect(result.current).toHaveProperty('consistencyIssues');
      expect(result.current).toHaveProperty('worldSettings');
      expect(result.current).toHaveProperty('connect');
      expect(result.current).toHaveProperty('disconnect');
    });
  });

  // -------------------------------------------------------------------------
  // Unmount cleanup
  // -------------------------------------------------------------------------

  describe('unmount cleanup', () => {
    it('calls removeAllListeners and disconnect on unmount', () => {
      const { unmount } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();
      unmount();

      expect(mockSocket.removeAllListeners).toHaveBeenCalled();
      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('emits leave:project on unmount', () => {
      const { unmount } = renderHook(() => useWritingWebSocket(PROJECT_ID));

      fireConnect();
      unmount();

      expect(mockSocket.emit).toHaveBeenCalledWith('leave:project', {
        projectId: PROJECT_ID,
      });
    });
  });
});
