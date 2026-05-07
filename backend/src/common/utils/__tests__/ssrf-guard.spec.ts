// PR-5 v1.6 § 14.4 PR-A14 — RV-12b SSRF + DNS rebinding 防护

import {
  isPrivateIp,
  isUrlSafeForServerFetch,
  shouldCopyToCdn,
  SAFE_LICENSES_FOR_CDN_COPY,
} from "../ssrf-guard";

describe("PR-5 v1.6 ssrf-guard", () => {
  describe("isPrivateIp IPv4", () => {
    it.each([
      "127.0.0.1",
      "10.0.0.1",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "169.254.169.254", // AWS metadata 关键拦截点
      "0.0.0.0",
      "100.64.0.1",
      "224.0.0.1", // multicast
    ])("%s 拦截", (ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    });

    it.each([
      "1.1.1.1",
      "8.8.8.8",
      "172.15.0.1", // 不在 16-31 范围
      "172.32.0.1",
      "192.169.0.1",
      "192.167.0.1",
      "100.63.0.1",
      "100.128.0.1",
    ])("%s 公网 → 通过", (ip) => {
      expect(isPrivateIp(ip)).toBe(false);
    });
  });

  describe("isPrivateIp IPv6", () => {
    it.each([
      "::1",
      "fe80::1",
      "fc00::1",
      "fd00::1",
      "::ffff:127.0.0.1", // IPv4-mapped IPv6 loopback
      "::ffff:169.254.169.254", // IPv4-mapped metadata
    ])("%s 拦截", (ip) => {
      expect(isPrivateIp(ip)).toBe(true);
    });

    it.each(["2001:4860:4860::8888", "::ffff:8.8.8.8"])(
      "%s 公网 → 通过",
      (ip) => {
        expect(isPrivateIp(ip)).toBe(false);
      },
    );
  });

  describe("isPrivateIp 边界", () => {
    it("空字符串 → 拦截（fail-safe）", () => {
      expect(isPrivateIp("")).toBe(true);
    });
  });

  describe("isUrlSafeForServerFetch", () => {
    it("HTTP / HTTPS 协议公网域名 → 通过", () => {
      expect(isUrlSafeForServerFetch("https://example.com/img.png")).toEqual({
        safe: true,
      });
      expect(isUrlSafeForServerFetch("http://example.com/img.png")).toEqual({
        safe: true,
      });
    });

    it("file:// / ftp:// / data: → 协议拦截", () => {
      expect(isUrlSafeForServerFetch("file:///etc/passwd").safe).toBe(false);
      expect(isUrlSafeForServerFetch("ftp://example.com/x").safe).toBe(false);
      expect(isUrlSafeForServerFetch("data:image/png;base64,...").safe).toBe(
        false,
      );
    });

    it("hostname 是私网 IP 字面量 → 拦截", () => {
      expect(
        isUrlSafeForServerFetch("http://169.254.169.254/latest/meta-data").safe,
      ).toBe(false);
      expect(isUrlSafeForServerFetch("http://10.0.0.1/secret").safe).toBe(
        false,
      );
    });

    it("非法 URL → 拦截", () => {
      expect(isUrlSafeForServerFetch("not a url").safe).toBe(false);
    });
  });

  describe("RV-12c DMCA 默认热链 + 白名单 license 才下载", () => {
    it.each(["cc0", "cc-0", "public-domain", "cc-by", "ai-generated-genesis"])(
      "%s license 允许 CDN copy",
      (lic) => {
        expect(shouldCopyToCdn(lic)).toBe(true);
      },
    );

    it.each(["all-rights-reserved", "unknown", null, undefined, ""])(
      "%s license 默认热链（不 CDN copy）",
      (lic) => {
        expect(shouldCopyToCdn(lic as string | null)).toBe(false);
      },
    );

    it("license 大小写不敏感", () => {
      expect(shouldCopyToCdn("CC-BY")).toBe(true);
      expect(shouldCopyToCdn("Public-Domain")).toBe(true);
    });

    it("SAFE_LICENSES_FOR_CDN_COPY 是只读 set（防意外被改）", () => {
      // 集合存在的合理性验证
      expect(SAFE_LICENSES_FOR_CDN_COPY.size).toBeGreaterThan(5);
      expect(SAFE_LICENSES_FOR_CDN_COPY.has("cc0")).toBe(true);
    });
  });
});
