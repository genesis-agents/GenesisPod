/**
 * Log Sanitization Utility
 *
 * Prevents sensitive data from being logged
 */

/**
 * Sensitive field names that should be redacted in logs
 */
const SENSITIVE_FIELDS = [
  "token",
  "access_token",
  "refresh_token",
  "password",
  "secret",
  "api_key",
  "apikey",
  "authorization",
  "cookie",
  "session",
  "credential",
  "private_key",
  "private",
  "key",
  "salt",
  "hash",
  "otp",
  "pin",
  "cvv",
  "ssn",
  "ticket",
  "data_ticket",
] as const;

/**
 * Patterns that indicate sensitive data
 */
const SENSITIVE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9\-_]+/gi,
  /eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/g, // JWT tokens
  /[a-f0-9]{32,}/gi, // Long hex strings (tokens, hashes)
];

/**
 * Sanitize an object for safe logging
 * Redacts sensitive field values
 */
export function sanitizeForLog(obj: unknown, depth = 0): unknown {
  // Prevent stack overflow
  if (depth > 10) {
    return "[MAX_DEPTH]";
  }

  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeForLog(item, depth + 1));
  }

  if (typeof obj === "object") {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase();
      const isSensitive = SENSITIVE_FIELDS.some((field) =>
        lowerKey.includes(field),
      );

      if (isSensitive && typeof value === "string") {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitizeForLog(value, depth + 1);
      }
    }
    return sanitized;
  }

  return obj;
}

/**
 * Sanitize a string, redacting sensitive patterns
 */
function sanitizeString(str: string): string {
  let result = str;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

/**
 * Safe JSON stringify for logging
 * Sanitizes sensitive data before stringifying
 */
export function safeStringify(obj: unknown, space?: number): string {
  try {
    const sanitized = sanitizeForLog(obj);
    return JSON.stringify(sanitized, null, space);
  } catch {
    return "[UNABLE_TO_STRINGIFY]";
  }
}

/**
 * 截掉 token 字面值，只露前 4 字符 + "***"。
 * 用于 logger 里需要标识"是否拿到 token / 是否换了"但不想曝完整凭据的场景。
 */
export function redactToken(token: string | null | undefined): string {
  if (!token) return "(empty)";
  if (token.length <= 4) return "***";
  return `${token.slice(0, 4)}***`;
}

/**
 * 把 URL 里 token / access_token / ticket 等查询参数的值替换成 [REDACTED]。
 * 用于 logger 里要打调试 URL 但不想曝凭据。其他参数照旧保留方便定位。
 */
export function redactUrl(url: string): string {
  return url.replace(
    /([?&](?:access_token|token|ticket|data_ticket)=)[^&#]+/gi,
    "$1[REDACTED]",
  );
}

/**
 * Create a safe log message from response body
 */
export function sanitizeResponseBody(body: unknown): string {
  // Only include non-sensitive response fields
  if (typeof body !== "object" || body === null) {
    return String(body);
  }

  const safeFields = ["ret", "errcode", "errmsg", "err_msg", "status", "code"];
  const bodyObj = body as Record<string, unknown>;

  // Extract only safe fields
  const safeBody: Record<string, unknown> = {};
  for (const field of safeFields) {
    if (field in bodyObj) {
      safeBody[field] = bodyObj[field];
    }
    // Check nested base_resp
    if (
      "base_resp" in bodyObj &&
      typeof bodyObj.base_resp === "object" &&
      bodyObj.base_resp !== null
    ) {
      const baseResp = bodyObj.base_resp as Record<string, unknown>;
      if (field in baseResp) {
        safeBody[`base_resp.${field}`] = baseResp[field];
      }
    }
  }

  return JSON.stringify(safeBody);
}
