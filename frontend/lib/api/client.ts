/**
 * 统一的 API 客户端
 *
 * 提供：
 * 1. 基础 HTTP 请求封装
 * 2. SSE 流式响应支持
 * 3. 错误处理
 * 4. 请求重试
 * 5. 类型安全
 */

import { config } from '../config';

// ==================== 类型定义 ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
}

export interface ApiError {
  message: string;
  code?: string;
  status?: number;
  details?: unknown;
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

export interface SSEEvent<T = unknown> {
  type: string;
  data: T;
  timestamp: string;
  id?: string;
}

export interface SSEProgressEvent {
  type: 'progress';
  phase: string;
  progress: number;
  message: string;
  current?: number;
  total?: number;
}

export interface SSECompleteEvent<T = unknown> {
  type: 'complete';
  result: T;
  totalTime?: number;
}

export interface SSEErrorEvent {
  type: 'error';
  error: string;
  code?: string;
  recoverable?: boolean;
}

export type SSEHandler<T = unknown> = {
  onProgress?: (event: SSEProgressEvent) => void;
  onComplete?: (event: SSECompleteEvent<T>) => void;
  onError?: (event: SSEErrorEvent) => void;
  onEvent?: (event: SSEEvent) => void;
};

// ==================== API 客户端类 ====================

class ApiClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = config.apiUrl;
  }

  /**
   * 发送 GET 请求
   */
  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  /**
   * 发送 POST 请求
   */
  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  /**
   * 发送 PUT 请求
   */
  async put<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  /**
   * 发送 DELETE 请求
   */
  async delete<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  /**
   * 发送 PATCH 请求
   */
  async patch<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });
  }

  /**
   * 上传文件
   */
  async upload<T>(
    path: string,
    formData: FormData,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: formData,
      // 不设置 Content-Type，让浏览器自动处理 multipart/form-data
    });
  }

  /**
   * 基础请求方法
   */
  private async request<T>(
    path: string,
    options: RequestOptions = {}
  ): Promise<T> {
    const {
      timeout = 30000,
      retries = 0,
      retryDelay = 1000,
      ...init
    } = options;
    const url = this.buildUrl(path);

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw this.createApiError(
            errorData.message || response.statusText,
            errorData.code,
            response.status,
            errorData
          );
        }

        // 如果响应为空，返回空对象
        const text = await response.text();
        if (!text) {
          return {} as T;
        }

        return JSON.parse(text) as T;
      } catch (error) {
        lastError = error as Error;

        // 如果是最后一次重试，抛出错误
        if (attempt === retries) {
          throw lastError;
        }

        // 等待后重试
        await this.sleep(retryDelay * Math.pow(2, attempt));
      }
    }

    throw lastError;
  }

  /**
   * 创建 SSE 连接
   */
  createSSEStream<T = unknown>(
    path: string,
    handlers: SSEHandler<T>
  ): {
    eventSource: EventSource;
    close: () => void;
  } {
    const url = this.buildUrl(path);
    const eventSource = new EventSource(url);

    // 定义需要监听的事件类型
    const eventTypes = [
      'progress',
      'complete',
      'error',
      'heartbeat',
      'chunk',
      'message',
    ];

    const handleEvent = (event: MessageEvent) => {
      try {
        const parsed = JSON.parse(event.data);

        // 调用通用事件处理器
        handlers.onEvent?.(parsed);

        // 根据类型调用特定处理器
        if (parsed.type === 'progress' && handlers.onProgress) {
          handlers.onProgress(parsed.data || parsed);
        } else if (parsed.type === 'complete' && handlers.onComplete) {
          handlers.onComplete(parsed.data || parsed);
        } else if (parsed.type === 'error' && handlers.onError) {
          handlers.onError(parsed.data || parsed);
        }
      } catch (e) {
        console.error('[ApiClient] SSE parse error:', e);
      }
    };

    // 监听所有事件类型
    eventTypes.forEach((type) => {
      eventSource.addEventListener(type, handleEvent);
    });

    // 也监听默认的 message 事件
    eventSource.onmessage = handleEvent;

    // 错误处理
    eventSource.onerror = () => {
      handlers.onError?.({
        type: 'error',
        error: 'SSE connection error',
        recoverable: false,
      });
    };

    return {
      eventSource,
      close: () => {
        eventTypes.forEach((type) => {
          eventSource.removeEventListener(type, handleEvent);
        });
        eventSource.close();
      },
    };
  }

  /**
   * POST 请求并返回 SSE 流 (使用 fetch)
   */
  async postSSEStream<T = unknown>(
    path: string,
    body: unknown,
    handlers: SSEHandler<T>
  ): Promise<{ close: () => void }> {
    const url = this.buildUrl(path);
    const controller = new AbortController();

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw this.createApiError(
          errorData.message || response.statusText,
          errorData.code,
          response.status
        );
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error('No response body');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      const processStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6);
                try {
                  const parsed = JSON.parse(data);
                  handlers.onEvent?.(parsed);

                  if (parsed.type === 'progress') {
                    handlers.onProgress?.(parsed.data || parsed);
                  } else if (parsed.type === 'complete') {
                    handlers.onComplete?.(parsed.data || parsed);
                  } else if (parsed.type === 'error') {
                    handlers.onError?.(parsed.data || parsed);
                  }
                } catch {
                  // 忽略解析错误
                }
              }
            }
          }
        } catch (error) {
          if ((error as Error).name !== 'AbortError') {
            handlers.onError?.({
              type: 'error',
              error: (error as Error).message,
              recoverable: false,
            });
          }
        }
      };

      processStream();

      return {
        close: () => controller.abort(),
      };
    } catch (error) {
      handlers.onError?.({
        type: 'error',
        error: (error as Error).message,
        recoverable: false,
      });
      return { close: () => {} };
    }
  }

  /**
   * 构建完整 URL
   */
  private buildUrl(path: string): string {
    // 如果已经是完整 URL，直接返回
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    // 确保路径以 / 开头
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${this.baseUrl}${normalizedPath}`;
  }

  /**
   * 创建 API 错误
   */
  private createApiError(
    message: string,
    code?: string,
    status?: number,
    details?: unknown
  ): ApiError {
    return {
      message,
      code,
      status,
      details,
    };
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// 导出单例
export const apiClient = new ApiClient();

// 导出类型和方法
export default apiClient;
