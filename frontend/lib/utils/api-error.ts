/**
 * api-error —— 全站统一的 API 错误人性化（canonical，2026-06-12 用户指令）。
 *
 * 背景：多个 service 把 `${res.status}: ${raw json body}` 直接抛给 UI，
 * 用户看到整段 JSON / 英文技术栈（实证：foresight 402 quota 原文糊脸）。
 *
 * 规则（顺序敏感）：
 *   1. 解析 Nest 标准错误体 { statusCode, message, code }（message 可为数组）
 *   2. 后端给的中文 message 直接透传（后端已人性化的不二次包装，
 *      例如 "主题还没有带 falsifier 的假设卡…"）
 *   3. 已知英文技术签名 → 中文友好语（配额/限流/超时/密钥失败/网络）
 *   4. 状态码兜底标签
 *   5. 非中文透传场景附截短技术细节（≤120 字）便于反馈排障
 *
 * 用法：
 *   if (!res.ok) throw await apiError(res, '导入草稿');
 */

interface NestErrorBody {
  statusCode?: number;
  message?: string | string[];
  code?: string;
  error?: string;
}

const STATUS_LABELS: Record<number, string> = {
  400: '请求无效',
  401: '登录状态已失效，请重新登录',
  402: 'AI 模型配额或余额不足',
  403: '没有权限执行此操作',
  404: '资源不存在或已被删除',
  409: '操作冲突，请刷新后重试',
  429: '请求过于频繁，请稍后再试',
  500: '服务开小差了，请稍后再试',
  502: '服务暂时不可达，请稍后再试',
  503: '服务暂时不可用，请稍后再试',
  504: '服务响应超时，请稍后再试',
};

/** 已知英文技术签名 → 中文友好语（按顺序匹配，命中即止） */
const SIGNATURE_MAP: Array<{ re: RegExp; toMessage: (raw: string) => string }> =
  [
    {
      re: /all api key.*for provider '?([\w.-]+)'?.*failed/i,
      toMessage: (raw) => {
        const provider = raw.match(/provider '?([\w.-]+)'?/i)?.[1];
        return `「${provider ?? '当前'}」模型服务的全部 API Key 均不可用 —— 请到「模型设置」检查 Key 余额/有效性，或更换默认模型`;
      },
    },
    {
      re: /quota.?exceeded|payment required|insufficient.*(balance|funds|quota)/i,
      toMessage: () =>
        'AI 模型配额或余额已用尽 —— 请到「模型设置」为所选 Provider 充值或更换默认模型',
    },
    {
      re: /rate.?limit|too many requests/i,
      toMessage: () => '触发模型限流 —— 系统会自动退避，请稍后再试',
    },
    {
      re: /timed?.?out|ETIMEDOUT|deadline/i,
      toMessage: () => '请求超时，请稍后再试',
    },
    {
      re: /ECONNREFUSED|ECONNRESET|fetch failed|network error|socket hang/i,
      toMessage: () => '服务暂时不可达，请检查网络或稍后再试',
    },
    {
      re: /unauthori[sz]ed|invalid token|jwt/i,
      toMessage: () => '登录状态已失效，请重新登录',
    },
  ];

const CJK_RE = /[一-鿿]/;

/** 从原始响应体提取最有信息量的 message 字符串 */
function extractMessage(rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) return '';
  try {
    const parsed = JSON.parse(trimmed) as NestErrorBody;
    const msg = parsed.message ?? parsed.error ?? '';
    if (Array.isArray(msg)) return msg.join('；');
    if (typeof msg === 'string' && msg) return msg;
  } catch {
    /* 非 JSON 体：按纯文本处理 */
  }
  return trimmed;
}

/**
 * 把 (status, 原始响应体) 转成用户可读的中文错误文案。
 * 纯函数，便于单测与非 fetch 场景（WS/SSE）复用。
 */
export function humanizeApiError(
  status: number,
  rawBody: string,
  context?: string
): string {
  const message = extractMessage(rawBody);
  const prefix = context ? `${context}失败：` : '';

  /* 后端已人性化的中文 message 直接透传（截 300 防极端长文） */
  if (message && CJK_RE.test(message)) {
    return `${prefix}${message.slice(0, 300)}`;
  }

  /* 英文技术签名 → 友好语 */
  for (const { re, toMessage } of SIGNATURE_MAP) {
    if (re.test(message)) {
      return `${prefix}${toMessage(message)}`;
    }
  }

  /* 状态码兜底 + 截短技术细节（帮助用户反馈排障，不糊整段 JSON） */
  const label =
    STATUS_LABELS[status] ??
    (status >= 500 ? STATUS_LABELS[500] : '请求失败，请稍后重试');
  const detail = message.replace(/\s+/g, ' ').slice(0, 120);
  return detail
    ? `${prefix}${label}（${detail}${message.length > 120 ? '…' : ''}）`
    : `${prefix}${label}`;
}

/** fetch Response → 友好 Error（读 body，永不抛出二次异常） */
export async function apiError(
  res: Response,
  context?: string
): Promise<Error> {
  const body = await res.text().catch(() => '');
  return new Error(humanizeApiError(res.status, body, context));
}
