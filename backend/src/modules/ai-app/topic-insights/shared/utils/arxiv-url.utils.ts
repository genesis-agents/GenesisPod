/**
 * arXiv URL Utils
 *
 * 来源：baseline `38347e2a7:services/data/data-enrichment.service.ts:L445-L491`
 * 原 arXiv 抓取升级逻辑。
 *
 * 业务用途：
 *   - `/abs/{id}` 是摘要页，没有图片 → 升级到 `/html/{id}` 抓图表
 *   - arXiv HTML 页面中图片用相对路径（如 `Figure1.png`），base URL 必须带
 *     尾部斜杠，否则 `new URL("Figure1.png", "https://arxiv.org/html/2601.1")`
 *     解析到父目录 `/html/Figure1.png`（404），而不是 `/html/2601.1/Figure1.png`
 */

export interface ArxivFetchTarget {
  /** 实际请求的 URL（arXiv /abs/ → /html/ 升级后的地址） */
  readonly fetchUrl: string;
  /** 用于 `new URL(relative, baseUrl)` 解析相对路径的 base（必须带尾部斜杠）*/
  readonly baseUrl: string;
  /** 是否执行了 arXiv 升级（方便日志追踪） */
  readonly upgraded: boolean;
}

const ARXIV_ABS_RE = /arxiv\.org\/abs\/([\w.]+)/;
const ARXIV_HTML_NO_SLASH_RE = /arxiv\.org\/html\/[\w.]+$/;

/**
 * 解析 arXiv 抓取目标。
 * 非 arXiv URL 原样返回（fetchUrl == baseUrl == url, upgraded=false）。
 *
 * @param url 原始 URL（可能是 /abs/{id}, /html/{id}, 或其他域名）
 */
export function resolveArxivFetchTarget(url: string): ArxivFetchTarget {
  // Case 1: /abs/{id} → 升级到 /html/{id}/
  const absMatch = url.match(ARXIV_ABS_RE);
  if (absMatch) {
    const htmlUrl = `https://arxiv.org/html/${absMatch[1]}/`;
    return { fetchUrl: htmlUrl, baseUrl: htmlUrl, upgraded: true };
  }

  // Case 2: /html/{id} 无尾部斜杠 → 补斜杠（URL 本身保持不升级，但 base 带斜杠）
  if (ARXIV_HTML_NO_SLASH_RE.test(url)) {
    const withSlash = url + "/";
    return { fetchUrl: withSlash, baseUrl: withSlash, upgraded: false };
  }

  // Case 3: 其他（非 arXiv / 已经带尾部斜杠）原样返回
  return { fetchUrl: url, baseUrl: url, upgraded: false };
}
