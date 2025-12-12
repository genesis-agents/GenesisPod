/**
 * useApi - 通用 API 调用 Hook
 *
 * 提供：
 * 1. 自动加载状态管理
 * 2. 错误处理
 * 3. 数据缓存
 * 4. 请求去重
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { apiClient, ApiError } from '@/lib/api/client';

export interface UseApiOptions<T> {
  // 初始数据
  initialData?: T;
  // 是否立即执行
  immediate?: boolean;
  // 依赖项（变化时重新请求）
  deps?: unknown[];
  // 缓存键
  cacheKey?: string;
  // 缓存时间（毫秒）
  cacheTTL?: number;
  // 错误回调
  onError?: (error: ApiError) => void;
  // 成功回调
  onSuccess?: (data: T) => void;
}

export interface UseApiResult<T, P = void> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | null;
  execute: (params?: P) => Promise<T | undefined>;
  reset: () => void;
  setData: (data: T | undefined) => void;
}

// 简单的内存缓存
const cache = new Map<string, { data: unknown; timestamp: number }>();

/**
 * GET 请求 Hook
 */
export function useApiGet<T>(
  path: string,
  options: UseApiOptions<T> = {}
): UseApiResult<T> {
  const {
    initialData,
    immediate = true,
    deps = [],
    cacheKey,
    cacheTTL = 0,
    onError,
    onSuccess,
  } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(immediate);
  const [error, setError] = useState<ApiError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const execute = useCallback(async () => {
    // 检查缓存
    if (cacheKey && cacheTTL > 0) {
      const cached = cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < cacheTTL) {
        setData(cached.data as T);
        setLoading(false);
        return cached.data as T;
      }
    }

    // 取消之前的请求
    abortRef.current?.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.get<T>(path, {
        signal: abortRef.current.signal,
      });
      setData(result);

      // 更新缓存
      if (cacheKey && cacheTTL > 0) {
        cache.set(cacheKey, { data: result, timestamp: Date.now() });
      }

      onSuccess?.(result);
      return result;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      const apiError = err as ApiError;
      setError(apiError);
      onError?.(apiError);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [path, cacheKey, cacheTTL, onError, onSuccess]);

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setLoading(false);
  }, [initialData]);

  // 自动执行
  useEffect(() => {
    if (immediate) {
      execute();
    }
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [immediate, ...deps]);

  return { data, loading, error, execute, reset, setData };
}

/**
 * POST 请求 Hook
 */
export function useApiPost<T, P = unknown>(
  path: string,
  options: Omit<UseApiOptions<T>, 'immediate' | 'deps'> = {}
): UseApiResult<T, P> {
  const { initialData, onError, onSuccess } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = useCallback(
    async (params?: P) => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiClient.post<T>(path, params);
        setData(result);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError);
        onError?.(apiError);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [path, onError, onSuccess]
  );

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setLoading(false);
  }, [initialData]);

  return { data, loading, error, execute, reset, setData };
}

/**
 * PUT 请求 Hook
 */
export function useApiPut<T, P = unknown>(
  path: string,
  options: Omit<UseApiOptions<T>, 'immediate' | 'deps'> = {}
): UseApiResult<T, P> {
  const { initialData, onError, onSuccess } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = useCallback(
    async (params?: P) => {
      setLoading(true);
      setError(null);

      try {
        const result = await apiClient.put<T>(path, params);
        setData(result);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError);
        onError?.(apiError);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [path, onError, onSuccess]
  );

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setLoading(false);
  }, [initialData]);

  return { data, loading, error, execute, reset, setData };
}

/**
 * DELETE 请求 Hook
 */
export function useApiDelete<T>(
  path: string,
  options: Omit<UseApiOptions<T>, 'immediate' | 'deps'> = {}
): UseApiResult<T> {
  const { initialData, onError, onSuccess } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const result = await apiClient.delete<T>(path);
      setData(result);
      onSuccess?.(result);
      return result;
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError);
      onError?.(apiError);
      return undefined;
    } finally {
      setLoading(false);
    }
  }, [path, onError, onSuccess]);

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setLoading(false);
  }, [initialData]);

  return { data, loading, error, execute, reset, setData };
}

/**
 * 通用 Mutation Hook (POST/PUT/PATCH/DELETE)
 */
export function useApiMutation<T, P = unknown>(
  method: 'post' | 'put' | 'patch' | 'delete',
  path: string,
  options: Omit<UseApiOptions<T>, 'immediate' | 'deps'> = {}
): UseApiResult<T, P> {
  const { initialData, onError, onSuccess } = options;

  const [data, setData] = useState<T | undefined>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const execute = useCallback(
    async (params?: P) => {
      setLoading(true);
      setError(null);

      try {
        let result: T;
        switch (method) {
          case 'post':
            result = await apiClient.post<T>(path, params);
            break;
          case 'put':
            result = await apiClient.put<T>(path, params);
            break;
          case 'patch':
            result = await apiClient.patch<T>(path, params);
            break;
          case 'delete':
            result = await apiClient.delete<T>(path);
            break;
        }
        setData(result);
        onSuccess?.(result);
        return result;
      } catch (err) {
        const apiError = err as ApiError;
        setError(apiError);
        onError?.(apiError);
        return undefined;
      } finally {
        setLoading(false);
      }
    },
    [method, path, onError, onSuccess]
  );

  const reset = useCallback(() => {
    setData(initialData);
    setError(null);
    setLoading(false);
  }, [initialData]);

  return { data, loading, error, execute, reset, setData };
}
