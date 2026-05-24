/**
 * v3.1 B.4 错误信号契约 stub —— self-heal 的输入面
 *
 * 本片只提供契约 + 最小嗅探实现。B 子片 3 替换为严格 4 重检查（§4.3）：
 *   1. HTTP status 白名单（仅 400/422）
 *   2. error code 白名单（按 apiFormat 分）
 *   3. 响应位置严格（仅 4xx body）
 *   4. 反向校验（request 实际发了对应字段才映射）
 *
 * 接入点：AiApiCallerService catch 块（B 子片 3 接），本片不接调用方。
 */

export interface ErrorSignal {
  /** HTTP status code（4xx 范围才会被 self-heal 接受） */
  httpStatus: number;
  /** provider error code（如 'invalid_request_error', 'INVALID_ARGUMENT', 'unsupported_response_format'） */
  errorCode: string;
  /** 响应体片段（截断 200 字符，B+ 脱敏） */
  bodySnippet: string;
}

/**
 * 最小嗅探实现 —— B 子片 2 仅作契约稳定，self-heal spec 直接 mock。
 *
 * B 子片 3 替换为严格实现：分 OpenAI / Anthropic / Google 三套 status + body 解析。
 */
export function extractErrorSignal(rawError: unknown): ErrorSignal | null {
  if (rawError === null || rawError === undefined) return null;

  // axios / fetch error 通用形态嗅探（B+ 替换为严格类型分发）
  const e = rawError as {
    status?: number;
    response?: { status?: number; data?: unknown };
    code?: string;
    message?: string;
  };

  const httpStatus =
    typeof e.status === "number"
      ? e.status
      : typeof e.response?.status === "number"
        ? e.response.status
        : 0;
  if (httpStatus === 0) return null;

  const errorCode =
    typeof e.code === "string" && e.code.length > 0 ? e.code : "unknown";

  const bodyRaw =
    typeof e.response?.data === "string"
      ? e.response.data
      : e.response?.data !== undefined
        ? JSON.stringify(e.response.data)
        : typeof e.message === "string"
          ? e.message
          : "";
  const bodySnippet = bodyRaw.slice(0, 200);

  return { httpStatus, errorCode, bodySnippet };
}
