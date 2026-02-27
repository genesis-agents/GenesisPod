import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// Mocks must be declared before imports
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));

vi.mock('@/lib/utils/config', () => ({
  config: {
    apiUrl: 'http://test-api',
    apiBaseUrl: 'http://test-api',
    streamApiUrl: 'http://test-stream',
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

// Mock the entire stores module
vi.mock('@/stores', () => {
  const mockStoreState = {
    session: null,
    generating: false,
    progress: null,
    pages: [],
    taskDecomposition: null,
    outlinePlan: null,
    qualityReport: null,
    error: null,
    setSession: vi.fn(),
    setGenerating: vi.fn(),
    setProgress: vi.fn(),
    setPages: vi.fn(),
    updatePage: vi.fn(),
    setTaskDecomposition: vi.fn(),
    setOutlinePlan: vi.fn(),
    setQualityReport: vi.fn(),
    addStreamEvent: vi.fn(),
    clearStreamEvents: vi.fn(),
    setError: vi.fn(),
    addCheckpoint: vi.fn(),
  };

  const store = Object.assign(
    vi.fn(() => mockStoreState),
    {
      getState: vi.fn(() => ({
        ...mockStoreState,
        pages: [],
        progress: null,
      })),
    }
  );

  return {
    useSlidesStore: store,
    calculateOverallProgress: vi.fn((phase: string, progress: number) => {
      const weights: Record<string, { start: number; end: number }> = {
        task_decomposition: { start: 0, end: 30 },
        outline_planning: { start: 30, end: 60 },
        page_rendering: { start: 60, end: 90 },
        quality_review: { start: 90, end: 100 },
      };
      const w = weights[phase] || { start: 0, end: 100 };
      return Math.round(w.start + (progress / 100) * (w.end - w.start));
    }),
  };
});

const mockFetch = vi.fn();
global.fetch = mockFetch;

import { useAuth } from '@/contexts/AuthContext';
import { useSlidesStore, calculateOverallProgress } from '@/stores';

interface MockStoreState {
  session: null | Record<string, unknown>;
  generating: boolean;
  progress: null | number;
  pages: unknown[];
  taskDecomposition: null | Record<string, unknown>;
  outlinePlan: null | Record<string, unknown>;
  qualityReport: null | Record<string, unknown>;
  error: null | string;
  setSession: ReturnType<typeof vi.fn>;
  setGenerating: ReturnType<typeof vi.fn>;
  setProgress: ReturnType<typeof vi.fn>;
  setPages: ReturnType<typeof vi.fn>;
  updatePage: ReturnType<typeof vi.fn>;
  setTaskDecomposition: ReturnType<typeof vi.fn>;
  setOutlinePlan: ReturnType<typeof vi.fn>;
  setQualityReport: ReturnType<typeof vi.fn>;
  addStreamEvent: ReturnType<typeof vi.fn>;
  clearStreamEvents: ReturnType<typeof vi.fn>;
  setError: ReturnType<typeof vi.fn>;
  addCheckpoint: ReturnType<typeof vi.fn>;
}
const getMockStore = () =>
  (vi.mocked(useSlidesStore) as unknown as () => MockStoreState)();

function makeReadableStream(chunks: string[]): ReadableStream {
  let index = 0;
  const encoder = new TextEncoder();
  return new ReadableStream({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(encoder.encode(chunks[index++]));
      } else {
        controller.close();
      }
    },
  });
}

function makeSSEChunk(event: Record<string, unknown>): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

describe('useSlideGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-1' },
      accessToken: 'test-token',
      login: vi.fn(),
      logout: vi.fn(),
      loading: false,
    } as never);

    // Reset store mock state
    const store = getMockStore();
    Object.assign(store, {
      session: null,
      generating: false,
      progress: null,
      pages: [],
      taskDecomposition: null,
      outlinePlan: null,
      qualityReport: null,
      error: null,
    });

    (
      vi.mocked(useSlidesStore) as unknown as {
        getState: ReturnType<typeof vi.fn>;
      }
    ).getState = vi.fn(() => ({
      pages: [],
      progress: null,
    })) as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns initial state from store', async () => {
    const { useSlideGeneration } = await import('../useSlideGeneration');
    const { result } = renderHook(() => useSlideGeneration());

    expect(result.current.generating).toBe(false);
    expect(result.current.progress).toBeNull();
    expect(result.current.pages).toEqual([]);
    expect(result.current.error).toBeNull();
    expect(result.current.session).toBeNull();
    expect(result.current.taskDecomposition).toBeNull();
    expect(result.current.outlinePlan).toBeNull();
    expect(result.current.qualityReport).toBeNull();
  });

  it('exposes generate and cancel functions', async () => {
    const { useSlideGeneration } = await import('../useSlideGeneration');
    const { result } = renderHook(() => useSlideGeneration());

    expect(typeof result.current.generate).toBe('function');
    expect(typeof result.current.cancel).toBe('function');
  });

  it('cancel sets generating to false and progress to null', async () => {
    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    act(() => {
      result.current.cancel();
    });

    expect(store.setGenerating).toHaveBeenCalledWith(false);
    expect(store.setProgress).toHaveBeenCalledWith(null);
  });

  it('generate aborts on AbortError and returns silently', async () => {
    mockFetch.mockRejectedValueOnce(
      Object.assign(new Error('Aborted'), { name: 'AbortError' })
    );

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test Presentation',
        sourceText: 'Some content',
        targetPages: 5,
      });
    });

    const store = getMockStore();
    // setError should NOT be called for AbortError
    expect(store.setError).not.toHaveBeenCalled();
  });

  it('generate sets error and stops generating on network failure', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test Presentation',
        sourceText: 'Content',
        targetPages: 3,
      });
    });

    expect(store.setError).toHaveBeenCalledWith('Network error');
    expect(store.setGenerating).toHaveBeenCalledWith(false);
  });

  it('generate sets error when response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
      body: null,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setError).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('generate sets error when response body is null', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: null,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setError).toHaveBeenCalledWith('Response body is null');
  });

  it('generate initializes progress at task_decomposition', async () => {
    // Return a stream that closes immediately
    const stream = makeReadableStream([]);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setGenerating).toHaveBeenCalledWith(true);
    expect(store.setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'task_decomposition',
        phaseProgress: 0,
        overallProgress: 0,
      })
    );
    expect(store.clearStreamEvents).toHaveBeenCalled();
    expect(store.setError).toHaveBeenCalledWith(null);
  });

  it('processes execution:started event', async () => {
    const event = {
      type: 'execution:started',
      data: { sessionId: 'session-abc' },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onSessionCreated = vi.fn();
    const { result } = renderHook(() =>
      useSlideGeneration({ onSessionCreated })
    );

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'session-abc',
        userId: 'user-1',
        title: 'PPT 生成',
        status: 'active',
      })
    );
    expect(onSessionCreated).toHaveBeenCalledWith('session-abc');
  });

  it('processes phase:started event and updates progress', async () => {
    const event = {
      type: 'phase:started',
      data: { phase: 'analyzing' },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onPhaseStarted = vi.fn();
    const { result } = renderHook(() => useSlideGeneration({ onPhaseStarted }));

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseProgress: 0,
        overallProgress: 0,
      })
    );
    // onPhaseStarted called with mapped frontend phase
    expect(onPhaseStarted).toHaveBeenCalled();
  });

  it('processes phase:progress event', async () => {
    const event = {
      type: 'phase:progress',
      data: { phase: 'planning', progress: 50, message: 'Halfway done' },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phaseProgress: 50,
        message: 'Halfway done',
      })
    );
  });

  it('processes slide:generated event and updates page', async () => {
    (
      vi.mocked(useSlidesStore) as unknown as {
        getState: ReturnType<typeof vi.fn>;
      }
    ).getState = vi.fn(() => ({
      pages: [
        {
          pageNumber: 1,
          outline: {
            pageNumber: 1,
            title: 'Page 1',
            templateType: 'multiColumn',
            purpose: '',
            keyPoints: [],
          },
          status: 'pending',
        },
        {
          pageNumber: 2,
          outline: {
            pageNumber: 2,
            title: 'Page 2',
            templateType: 'multiColumn',
            purpose: '',
            keyPoints: [],
          },
          status: 'pending',
        },
      ],
      progress: null,
    })) as never;

    const event = {
      type: 'slide:generated',
      data: {
        pageNumber: 1,
        totalPages: 2,
        html: '<div>Slide 1</div>',
        title: 'Introduction',
      },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onPageCompleted = vi.fn();
    const { result } = renderHook(() =>
      useSlideGeneration({ onPageCompleted })
    );

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 2,
      });
    });

    expect(store.updatePage).toHaveBeenCalledWith(
      1,
      expect.objectContaining({
        status: 'completed',
        html: '<div>Slide 1</div>',
      })
    );
    expect(onPageCompleted).toHaveBeenCalledWith(1);
  });

  it('processes execution:completed event', async () => {
    const event = {
      type: 'execution:completed',
      sessionId: 'session-xyz',
      data: { totalPages: 5, checkpointId: 'cp-1' },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useSlideGeneration({ onComplete }));

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'quality_review',
        phaseProgress: 100,
        overallProgress: 100,
        message: '生成完成！',
      })
    );
    expect(store.setGenerating).toHaveBeenCalledWith(false);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointId: 'cp-1' })
    );
  });

  it('processes execution:failed event', async () => {
    const event = {
      type: 'execution:failed',
      data: { error: 'Server overloaded' },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onError = vi.fn();
    const { result } = renderHook(() => useSlideGeneration({ onError }));

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setError).toHaveBeenCalledWith('Server overloaded');
    expect(store.setGenerating).toHaveBeenCalledWith(false);
    expect(onError).toHaveBeenCalledWith('Server overloaded');
  });

  it('processes legacy session_created event', async () => {
    const event = {
      type: 'session_created',
      data: {
        session: { id: 'legacy-session', title: 'My PPT' },
      },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onSessionCreated = vi.fn();
    const { result } = renderHook(() =>
      useSlideGeneration({ onSessionCreated })
    );

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setSession).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'legacy-session',
        title: 'My PPT',
      })
    );
    expect(onSessionCreated).toHaveBeenCalledWith('legacy-session');
  });

  it('processes legacy error event', async () => {
    const event = {
      type: 'error',
      data: { error: 'Legacy error occurred' },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onError = vi.fn();
    const { result } = renderHook(() => useSlideGeneration({ onError }));

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.setError).toHaveBeenCalledWith('Legacy error occurred');
    expect(onError).toHaveBeenCalledWith('Legacy error occurred');
  });

  it('processes legacy complete event', async () => {
    const event = {
      type: 'complete',
      data: {
        sessionId: 'sess-1',
        checkpointId: 'cp-legacy',
        totalPages: 3,
      },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const onComplete = vi.fn();
    const { result } = renderHook(() => useSlideGeneration({ onComplete }));

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 3,
      });
    });

    expect(store.setGenerating).toHaveBeenCalledWith(false);
    expect(onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ checkpointId: 'cp-legacy' })
    );
  });

  it('addStreamEvent is called for each parsed event', async () => {
    const event = {
      type: 'execution:started',
      data: { sessionId: 'sess-2' },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });

    expect(store.addStreamEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'execution:started' })
    );
  });

  it('handles malformed JSON in SSE data gracefully', async () => {
    const stream = makeReadableStream(['data: {invalid json}\n\n']);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const { result } = renderHook(() => useSlideGeneration());

    // Should not throw
    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 5,
      });
    });
  });

  it('processes page_started legacy event', async () => {
    const event = {
      type: 'page_started',
      data: { pageNumber: 2, totalPages: 4 },
    };
    const stream = makeReadableStream([makeSSEChunk(event)]);

    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      body: stream,
    });

    const { useSlideGeneration } = await import('../useSlideGeneration');
    const store = getMockStore();
    const { result } = renderHook(() => useSlideGeneration());

    await act(async () => {
      await result.current.generate({
        title: 'Test',
        sourceText: 'Source',
        targetPages: 4,
      });
    });

    expect(store.updatePage).toHaveBeenCalledWith(
      2,
      expect.objectContaining({ status: 'generating' })
    );
  });
});
