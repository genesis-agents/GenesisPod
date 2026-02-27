import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/hooks/core', () => ({
  useApiGet: vi.fn(),
  useApiPost: vi.fn(),
  useApiPut: vi.fn(),
  useApiDelete: vi.fn(),
  useApiMutation: vi.fn(),
}));

import { useApiGet, useApiPost, useApiPut, useApiDelete } from '@/hooks/core';
import { useAdminModels } from '../useAdminModels';
import type { AIModel } from '../useAdminModels';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const makeHookDefault = (overrides = {}) => ({
  data: null,
  loading: false,
  error: null,
  execute: vi.fn().mockResolvedValue(undefined),
  refresh: vi.fn(),
  reset: vi.fn(),
  setData: vi.fn(),
  ...overrides,
});

const makeModel = (id = 'model-1'): AIModel => ({
  id,
  name: `GPT Model ${id}`,
  provider: 'openai',
  modelId: 'gpt-4o',
  type: 'CHAT',
  enabled: true,
  config: { maxTokens: 4096 },
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAdminModels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiGet).mockReturnValue(makeHookDefault());
    vi.mocked(useApiPost).mockReturnValue(makeHookDefault());
    vi.mocked(useApiPut).mockReturnValue(makeHookDefault());
    vi.mocked(useApiDelete).mockReturnValue(makeHookDefault());
  });

  it('returns empty models array when data is null', () => {
    const { result } = renderHook(() => useAdminModels());
    expect(result.current.models).toEqual([]);
  });

  it('returns models list when data is available', () => {
    const models = [makeModel('m1'), makeModel('m2')];
    vi.mocked(useApiGet).mockReturnValue(makeHookDefault({ data: models }));

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.models).toEqual(models);
    expect(result.current.models).toHaveLength(2);
  });

  it('isRefreshing matches list loading state', () => {
    vi.mocked(useApiGet).mockReturnValue(makeHookDefault({ loading: true }));

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.isRefreshing).toBe(true);
  });

  it('loading is true when any sub-query is loading', () => {
    vi.mocked(useApiPut).mockReturnValue(makeHookDefault({ loading: true }));

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.loading).toBe(true);
    expect(result.current.isUpdating).toBe(true);
  });

  it('isCreating reflects post loading state', () => {
    vi.mocked(useApiPost).mockReturnValue(makeHookDefault({ loading: true }));

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.isCreating).toBe(true);
  });

  it('isDeleting reflects delete loading state', () => {
    vi.mocked(useApiDelete).mockReturnValue(makeHookDefault({ loading: true }));

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.isDeleting).toBe(true);
  });

  it('isTesting reflects test connection loading state', () => {
    // The test connection hook is the second useApiPost call
    vi.mocked(useApiPost)
      .mockReturnValueOnce(makeHookDefault()) // create
      .mockReturnValueOnce(makeHookDefault({ loading: true })); // test

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.isTesting).toBe(true);
  });

  it('error reflects listError first', () => {
    vi.mocked(useApiGet).mockReturnValue(
      makeHookDefault({ error: 'List error' })
    );

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.error).toBe('List error');
  });

  it('error reflects createError when no listError', () => {
    vi.mocked(useApiPost)
      .mockReturnValueOnce(makeHookDefault({ error: 'Create error' }))
      .mockReturnValueOnce(makeHookDefault());

    const { result } = renderHook(() => useAdminModels());
    expect(result.current.error).toBe('Create error');
  });

  describe('createModel', () => {
    it('calls createModelApi and refreshes on success', async () => {
      const newModel = makeModel('new-1');
      const createApiMock = vi.fn().mockResolvedValue(newModel);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(
        makeHookDefault({ execute: createApiMock })
      );

      const { result } = renderHook(() => useAdminModels());

      await act(async () => {
        await result.current.createModel({
          name: 'New Model',
          provider: 'openai',
        });
      });

      expect(createApiMock).toHaveBeenCalledTimes(1);
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it('does not refresh when createModelApi returns null', async () => {
      const createApiMock = vi.fn().mockResolvedValue(null);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(
        makeHookDefault({ execute: createApiMock })
      );

      const { result } = renderHook(() => useAdminModels());

      await act(async () => {
        await result.current.createModel({ name: 'New Model' });
      });

      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  describe('updateModel', () => {
    it('calls updateModelApi with id merged into data and refreshes', async () => {
      const updatedModel = makeModel('m1');
      const updateApiMock = vi.fn().mockResolvedValue(updatedModel);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(makeHookDefault());
      vi.mocked(useApiPut).mockReturnValue(
        makeHookDefault({ execute: updateApiMock })
      );

      const { result } = renderHook(() => useAdminModels());

      await act(async () => {
        await result.current.updateModel('m1', { name: 'Updated Name' });
      });

      expect(updateApiMock).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'm1', name: 'Updated Name' })
      );
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('deleteModel', () => {
    it('calls deleteModelApi with id and refreshes', async () => {
      const deleteApiMock = vi.fn().mockResolvedValue(undefined);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(makeHookDefault());
      vi.mocked(useApiPut).mockReturnValue(makeHookDefault());
      vi.mocked(useApiDelete).mockReturnValue(
        makeHookDefault({ execute: deleteApiMock })
      );

      const { result } = renderHook(() => useAdminModels());

      await act(async () => {
        await result.current.deleteModel('m1');
      });

      expect(deleteApiMock).toHaveBeenCalledWith({ id: 'm1' });
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('testConnection', () => {
    it('calls testConnectionApi with modelId', async () => {
      const testApiMock = vi
        .fn()
        .mockResolvedValue({ success: true, message: 'Connected' });

      vi.mocked(useApiPost)
        .mockReturnValueOnce(makeHookDefault()) // createModel
        .mockReturnValueOnce(makeHookDefault({ execute: testApiMock })); // testConnection

      const { result } = renderHook(() => useAdminModels());

      await act(async () => {
        await result.current.testConnection('gpt-4o');
      });

      expect(testApiMock).toHaveBeenCalledWith({ modelId: 'gpt-4o' });
    });
  });

  it('exposes refreshModels action', () => {
    const { result } = renderHook(() => useAdminModels());
    expect(typeof result.current.refreshModels).toBe('function');
  });
});
