import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/hooks/core', () => ({
  useApiGet: vi.fn(),
  useApiPost: vi.fn(),
  useApiPut: vi.fn(),
  useApiDelete: vi.fn(),
  useApiMutation: vi.fn(),
}));

vi.mock('@/lib/api/client', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import { useApiGet, useApiPost } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';
import { useAdminAgents } from '../useAdminAgents';
import type { AgentConfig } from '../useAdminAgents';

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

const makeAgent = (id = 'agent-1'): AgentConfig => ({
  id,
  agentId: `agent-id-${id}`,
  name: `Test Agent ${id}`,
  description: 'A test agent',
  agentType: 'chat',
  domain: 'research',
  systemPrompt: 'You are a helpful assistant.',
  tools: ['search', 'calculator'],
  skills: ['summarize'],
  modelType: 'CHAT',
  taskProfile: null,
  enabled: true,
  isBuiltIn: false,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('useAdminAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useApiGet).mockReturnValue(makeHookDefault());
    vi.mocked(useApiPost).mockReturnValue(makeHookDefault());
  });

  it('returns empty array when data is null', () => {
    const { result } = renderHook(() => useAdminAgents());
    expect(result.current.agents).toEqual([]);
  });

  it('returns agents list when data is available', () => {
    const agents = [makeAgent('a1'), makeAgent('a2')];
    vi.mocked(useApiGet).mockReturnValue(makeHookDefault({ data: agents }));

    const { result } = renderHook(() => useAdminAgents());
    expect(result.current.agents).toEqual(agents);
  });

  it('builds query string when domain filter is provided', () => {
    renderHook(() => useAdminAgents({ domain: 'research' }));

    expect(useApiGet).toHaveBeenCalledWith(
      expect.stringContaining('?domain=research'),
      expect.anything()
    );
  });

  it('does not append query string without filter', () => {
    renderHook(() => useAdminAgents());

    expect(useApiGet).toHaveBeenCalledWith('/admin/agents', expect.anything());
  });

  it('reflects loading state from list query', () => {
    vi.mocked(useApiGet).mockReturnValue(makeHookDefault({ loading: true }));
    vi.mocked(useApiPost).mockReturnValue(makeHookDefault());

    const { result } = renderHook(() => useAdminAgents());
    expect(result.current.loading).toBe(true);
    expect(result.current.isRefreshing).toBe(true);
  });

  it('reflects loading state from create query', () => {
    vi.mocked(useApiGet).mockReturnValue(makeHookDefault());
    vi.mocked(useApiPost).mockReturnValue(makeHookDefault({ loading: true }));

    const { result } = renderHook(() => useAdminAgents());
    expect(result.current.loading).toBe(true);
    expect(result.current.isCreating).toBe(true);
  });

  it('surfaces error from list query', () => {
    vi.mocked(useApiGet).mockReturnValue(
      makeHookDefault({ error: 'List error' })
    );

    const { result } = renderHook(() => useAdminAgents());
    expect(result.current.error).toBe('List error');
  });

  it('surfaces error from create query', () => {
    vi.mocked(useApiPost).mockReturnValue(
      makeHookDefault({ error: 'Create error' })
    );

    const { result } = renderHook(() => useAdminAgents());
    expect(result.current.error).toBe('Create error');
  });

  describe('createAgent', () => {
    it('calls createAgentApi and then refreshes', async () => {
      const newAgent = makeAgent('new-1');
      const createApiMock = vi.fn().mockResolvedValue(newAgent);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(
        makeHookDefault({ execute: createApiMock })
      );

      const { result } = renderHook(() => useAdminAgents());

      await act(async () => {
        await result.current.createAgent({
          agentId: 'new-agent',
          name: 'New Agent',
          agentType: 'chat',
          domain: 'research',
          systemPrompt: 'Test',
        });
      });

      expect(createApiMock).toHaveBeenCalledTimes(1);
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it('does not refresh if createAgentApi returns null', async () => {
      const createApiMock = vi.fn().mockResolvedValue(null);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(
        makeHookDefault({ execute: createApiMock })
      );

      const { result } = renderHook(() => useAdminAgents());

      await act(async () => {
        await result.current.createAgent({
          agentId: 'new-agent',
          name: 'New Agent',
          agentType: 'chat',
          domain: 'research',
          systemPrompt: 'Test',
        });
      });

      expect(refreshMock).not.toHaveBeenCalled();
    });
  });

  describe('updateAgent', () => {
    it('calls apiClient.patch and then refreshes', async () => {
      const updatedAgent = makeAgent('a1');
      vi.mocked(apiClient.patch).mockResolvedValue(updatedAgent);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(makeHookDefault());

      const { result } = renderHook(() => useAdminAgents());

      await act(async () => {
        await result.current.updateAgent('a1', { name: 'Updated Name' });
      });

      expect(apiClient.patch).toHaveBeenCalledWith('/admin/agents/a1', {
        name: 'Updated Name',
      });
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it('resets updateLoading to false after completion', async () => {
      vi.mocked(apiClient.patch).mockResolvedValue(makeAgent('a1'));
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(makeHookDefault());

      const { result } = renderHook(() => useAdminAgents());

      await act(async () => {
        await result.current.updateAgent('a1', { enabled: false });
      });

      expect(result.current.isUpdating).toBe(false);
    });
  });

  describe('deleteAgent', () => {
    it('calls apiClient.delete and then refreshes', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(undefined);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(makeHookDefault());

      const { result } = renderHook(() => useAdminAgents());

      await act(async () => {
        await result.current.deleteAgent('a1');
      });

      expect(apiClient.delete).toHaveBeenCalledWith('/admin/agents/a1');
      expect(refreshMock).toHaveBeenCalledTimes(1);
    });

    it('resets deleteLoading to false after completion', async () => {
      vi.mocked(apiClient.delete).mockResolvedValue(undefined);
      const refreshMock = vi.fn().mockResolvedValue(undefined);

      vi.mocked(useApiGet).mockReturnValue(
        makeHookDefault({ execute: refreshMock })
      );
      vi.mocked(useApiPost).mockReturnValue(makeHookDefault());

      const { result } = renderHook(() => useAdminAgents());

      await act(async () => {
        await result.current.deleteAgent('a1');
      });

      expect(result.current.isDeleting).toBe(false);
    });
  });

  it('exposes refreshAgents action', () => {
    const { result } = renderHook(() => useAdminAgents());
    expect(typeof result.current.refreshAgents).toBe('function');
  });
});
