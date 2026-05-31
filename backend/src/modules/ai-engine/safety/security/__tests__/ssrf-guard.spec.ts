/**
 * SsrfGuard 单测 —— 重点覆盖 DNS rebinding（公网域名解析到内网）这一字面校验绕过路径。
 */
import { lookup } from "node:dns/promises";
import { isBlockedIp, assertUrlSafe } from "../ssrf/ssrf-guard";

jest.mock("node:dns/promises", () => ({ lookup: jest.fn() }));

const mockLookup = lookup as unknown as jest.Mock;

describe("SsrfGuard", () => {
  afterEach(() => jest.clearAllMocks());

  describe("isBlockedIp", () => {
    it.each([
      "10.0.0.1",
      "172.16.5.5",
      "172.31.255.255",
      "192.168.1.1",
      "127.0.0.1",
      "169.254.169.254", // 云元数据
      "100.64.0.1", // CGNAT
      "0.0.0.0",
      "224.0.0.1", // 多播
      "240.0.0.1", // 保留
    ])("blocks internal/reserved IPv4 %s", (ip) => {
      expect(isBlockedIp(ip)).toBe(true);
    });

    it.each(["8.8.8.8", "1.1.1.1", "93.184.216.34"])(
      "allows public IPv4 %s",
      (ip) => {
        expect(isBlockedIp(ip)).toBe(false);
      },
    );

    it.each([
      "::1", // 回环
      "::", // 未指定
      "fe80::1", // 链路本地
      "fc00::1", // 唯一本地
      "fd12:3456::1", // 唯一本地
      "::ffff:169.254.169.254", // v4-mapped 元数据
    ])("blocks internal IPv6 %s", (ip) => {
      expect(isBlockedIp(ip)).toBe(true);
    });

    it("allows public IPv6", () => {
      expect(isBlockedIp("2606:4700:4700::1111")).toBe(false);
    });

    it("fail-closed on garbage", () => {
      expect(isBlockedIp("not-an-ip")).toBe(true);
    });
  });

  describe("assertUrlSafe", () => {
    it("rejects non-http(s) protocol", async () => {
      await expect(assertUrlSafe("ftp://example.com")).rejects.toThrow();
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it("rejects non-standard port", async () => {
      await expect(assertUrlSafe("http://example.com:22")).rejects.toThrow();
    });

    it("rejects a literal internal IP without DNS", async () => {
      await expect(assertUrlSafe("http://169.254.169.254/")).rejects.toThrow();
      expect(mockLookup).not.toHaveBeenCalled();
    });

    it("rejects blocked hostnames", async () => {
      await expect(
        assertUrlSafe("http://metadata.google.internal/"),
      ).rejects.toThrow();
    });

    it("DNS REBINDING: rejects a public domain that resolves to a metadata IP", async () => {
      mockLookup.mockResolvedValueOnce([
        { address: "169.254.169.254", family: 4 },
      ]);
      await expect(assertUrlSafe("https://evil.example.com/")).rejects.toThrow(
        /SSRF|内网|保留/,
      );
      expect(mockLookup).toHaveBeenCalledWith("evil.example.com", {
        all: true,
      });
    });

    it("rejects when ANY resolved address is internal (multi-record)", async () => {
      mockLookup.mockResolvedValueOnce([
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.5", family: 4 }, // 一个内网就拒
      ]);
      await expect(
        assertUrlSafe("https://mixed.example.com/"),
      ).rejects.toThrow();
    });

    it("allows a public domain resolving to public IPs", async () => {
      mockLookup.mockResolvedValueOnce([
        { address: "93.184.216.34", family: 4 },
      ]);
      const url = await assertUrlSafe("https://example.com/path");
      expect(url.hostname).toBe("example.com");
    });

    it("fail-closed when DNS resolution fails", async () => {
      mockLookup.mockRejectedValueOnce(new Error("ENOTFOUND"));
      await expect(
        assertUrlSafe("https://nonexistent.example.com/"),
      ).rejects.toThrow(/解析/);
    });
  });
});
