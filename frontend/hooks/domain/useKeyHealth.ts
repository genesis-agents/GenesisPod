/**
 * Key Health Hook
 * 获取工具 API Key 的健康状态
 */

import { useApiGet } from '../core';
import type { KeyHealthStatus } from '@/types/admin';

interface UseKeyHealthOptions {
  /** 是否立即加载 */
  immediate?: boolean;
}

/**
 * 获取工具的 API Key 健康状态
 *
 * @param toolId - 工具 ID (如 'tavily', 'serper', 'web-search')
 * @param options - 配置选项
 * @returns 密钥健康状态列表和操作方法
 *
 * @example
 * ```tsx
 * const { keyHealth, isLoading, refetch } = useKeyHealth('tavily');
 * ```
 */
export function useKeyHealth(
  toolId: string | null,
  options: UseKeyHealthOptions = {}
) {
  const { immediate = true } = options;

  // 只在 toolId 存在时发起请求
  // 使用占位符路径避免空字符串请求，通过 immediate: false 禁用实际请求
  const apiPath = toolId
    ? `/admin/ai/tools/${encodeURIComponent(toolId)}/key-health`
    : '/admin/ai/tools/__placeholder__/key-health'; // 占位符，不会实际请求

  const shouldFetch = immediate && !!toolId;

  const {
    data: keyHealth,
    loading: isLoading,
    error,
    execute: refetch,
  } = useApiGet<KeyHealthStatus[]>(apiPath, {
    immediate: shouldFetch,
  });

  // 计算健康统计
  const stats = keyHealth
    ? {
        total: keyHealth.length,
        healthy: keyHealth.filter((k) => k.isHealthy).length,
        unhealthy: keyHealth.filter((k) => !k.isHealthy).length,
      }
    : null;

  return {
    /** 密钥健康状态列表 */
    keyHealth: keyHealth ?? [],
    /** 健康统计 */
    stats,
    /** 是否正在加载 */
    isLoading: shouldFetch ? isLoading : false,
    /** 错误信息 */
    error: shouldFetch ? error : null,
    /** 刷新数据 - 仅当 toolId 有效时才执行 */
    refetch: toolId ? refetch : () => Promise.resolve(undefined),
  };
}
