import { useApiGet } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';

export interface UserToolItem {
  toolId: string;
  name: string;
  category: string;
  secretName: string;
  userConfigurable: boolean;
  configured: boolean;
  systemConfigured: boolean;
  granted: boolean;
}

interface UserToolsResponse {
  items: UserToolItem[];
}

export function useUserTools() {
  const { data, loading, error, execute } = useApiGet<UserToolsResponse>(
    '/user/tools',
    { immediate: true }
  );

  return {
    tools: data?.items ?? [],
    loading,
    error,
    refresh: execute,
  };
}

export async function requestToolGrant(
  toolId: string,
  reason?: string
): Promise<void> {
  await apiClient.post('/user/authorization/requests', {
    type: 'TOOL_GRANT',
    targetId: toolId,
    reason,
  });
}
