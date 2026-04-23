/**
 * UT-FIG-VALIDURL · isValidFigureUrl
 *
 * 判断一个 URL 是否可作为 figure 嵌入报告。
 *
 * 规则：
 * - 必须是合法 http / https 协议
 * - 后缀必须是图片类型（png / jpg / jpeg / webp / svg / gif / avif）
 *   或 query 中含 image/图片 标识
 * - 拒绝 data:URL（防 XSS 和尺寸炸弹）
 * - 拒绝 javascript:/vbscript:/file:
 * - 拒绝本地 / 私有网段域名（防 SSRF 依赖；此处做弱校验，hard block 留给下游 fetcher）
 */

const IMG_EXT_RE = /\.(png|jpg|jpeg|webp|svg|gif|avif)(\?.*)?$/i;
const BLOCKED_SCHEMES = ["data:", "javascript:", "vbscript:", "file:", "ftp:"];
const PRIVATE_HOST_RE =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/;

export function isValidFigureUrl(url: unknown): boolean {
  if (typeof url !== "string") return false;
  const trimmed = url.trim();
  if (trimmed.length === 0 || trimmed.length > 2048) return false;

  const lower = trimmed.toLowerCase();
  if (BLOCKED_SCHEMES.some((s) => lower.startsWith(s))) return false;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return false;
  }

  if (PRIVATE_HOST_RE.test(parsed.hostname)) return false;

  const hasImgExt = IMG_EXT_RE.test(parsed.pathname);
  if (hasImgExt) return true;

  // 无明确扩展名但 query 含 format=png 等模式也通过
  const search = parsed.search.toLowerCase();
  if (
    search.includes("format=") ||
    search.includes("image=") ||
    search.includes(".png") ||
    search.includes(".jpg") ||
    search.includes(".webp")
  ) {
    return true;
  }

  return false;
}
