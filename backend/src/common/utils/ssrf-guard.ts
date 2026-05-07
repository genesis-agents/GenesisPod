// PR-5 v1.6 PR-A14 — SSRF + DNS rebinding 防护
//
// 触发：image-search 返回 URL 可能指向内网（169.254.169.254 / RFC-1918 / link-local）→ AWS metadata 泄露
// 修法：自定义 lookup → DNS 解析后检查私网 IP；锁定第一次解析结果防 rebinding
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 14.4 P-A14

/**
 * 检查 IP 是否私网 / link-local / loopback / metadata-service。
 * 同时支持 IPv4 + IPv6 主流私网段。
 */
export function isPrivateIp(ip: string): boolean {
  if (!ip) return true; // 空值视为不安全

  // IPv4 解析
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [, a, b] = v4.map(Number);
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // loopback
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local + AWS metadata 169.254.169.254
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGN)
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6 主流私网（简化匹配）
  const lower = ip.toLowerCase();
  if (lower === "::1") return true; // loopback
  if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return true; // link-local
  if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true; // fc00::/7 unique local
  if (lower.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 — 提取 IPv4 部分递归
    const v4mapped = lower.substring("::ffff:".length);
    return isPrivateIp(v4mapped);
  }
  return false;
}

/**
 * URL 入口校验：协议白名单 + DNS 解析后 IP 私网拦截。
 * 与 caller 实际 download 复用同一 IP 锁定（防 DNS rebinding）— 该锁定能力由 axios httpAgent
 * 的 lookup 选项提供，本工具仅返回 boolean 给 caller 决策。
 */
export function isUrlSafeForServerFetch(url: string): {
  safe: boolean;
  reason?: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { safe: false, reason: "url-parse-failed" };
  }

  // 协议白名单
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { safe: false, reason: `protocol-blocked:${parsed.protocol}` };
  }

  // hostname 是直接 IP？
  const hostname = parsed.hostname;
  // 简单判定：IPv4 / IPv6 字面量
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname) || hostname.includes(":")) {
    if (isPrivateIp(hostname)) {
      return { safe: false, reason: `private-ip:${hostname}` };
    }
  }
  // 域名形式 → caller 需在实际 fetch 时用 dnsPromises.lookup + isPrivateIp 二次校验
  // （本工具不做异步 DNS，仅做语法层 fast-path）
  return { safe: true };
}

/**
 * 默认热链 vs 白名单 license 才下载。
 * v1.6 § 2.D6 [P 修订] DMCA 默认安全策略：
 *   - 白名单 license（CC0 / 公有领域 / 已授权）→ 下载存 CDN
 *   - 其他 → 热链（hotlink），imageUrl === sourceUrl，不复制到自家 CDN
 */
export const SAFE_LICENSES_FOR_CDN_COPY = new Set<string>([
  "cc0",
  "cc-0",
  "public-domain",
  "ccby", // CC-BY 显示来源即可
  "cc-by",
  "ccby-sa",
  "cc-by-sa",
  "wikimedia-commons", // 来源明确
  "unsplash-license",
  "pexels-license",
  "ai-generated-genesis", // 项目自生成
]);

export function shouldCopyToCdn(license: string | null | undefined): boolean {
  if (!license) return false;
  return SAFE_LICENSES_FOR_CDN_COPY.has(license.toLowerCase());
}
