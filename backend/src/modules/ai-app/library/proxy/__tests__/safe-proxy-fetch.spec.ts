/**
 * safeProxyGet — SSRF gate tests.
 *
 * Uses LITERAL IPs so assertUrlSafe blocks them without any DNS lookup
 * (offline-deterministic). Public hostnames / DNS-rebinding behaviour is
 * covered by ssrf-guard's own spec; here we prove the proxy helper actually
 * routes through the gate and rejects metadata/internal targets, and that
 * axios is never called for a blocked target.
 */

import axios from "axios";
import { safeProxyGet } from "../safe-proxy-fetch";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe("safeProxyGet — SSRF protection", () => {
  beforeEach(() => jest.clearAllMocks());

  const blocked = [
    ["cloud metadata", "http://169.254.169.254/latest/meta-data/"],
    ["IPv4 loopback", "http://127.0.0.1/admin"],
    ["private 10/8", "http://10.0.0.5/"],
    ["private 192.168/16", "http://192.168.1.1/"],
    ["CGNAT 100.64/10", "http://100.64.0.1/"],
    ["IPv6 loopback", "http://[::1]/"],
  ];

  it.each(blocked)("rejects %s and never calls axios", async (_label, url) => {
    await expect(safeProxyGet(url)).rejects.toThrow();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("rejects non-http(s) protocols", async () => {
    await expect(safeProxyGet("file:///etc/passwd")).rejects.toThrow();
    await expect(safeProxyGet("gopher://127.0.0.1/")).rejects.toThrow();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });

  it("fetches a public literal IP target and returns the response", async () => {
    mockedAxios.get.mockResolvedValueOnce({
      status: 200,
      data: "ok",
      headers: {},
    } as never);

    const res = await safeProxyGet("http://1.1.1.1/", { responseType: "text" });

    expect(res.status).toBe(200);
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    // Redirect following is manual: built-in axios redirects are disabled.
    expect(mockedAxios.get).toHaveBeenCalledWith(
      "http://1.1.1.1/",
      expect.objectContaining({ maxRedirects: 0 }),
    );
  });

  it("re-validates a redirect Location before following it (blocks rebinding redirect)", async () => {
    // First hop: public IP returns a 302 pointing at the metadata service.
    mockedAxios.get.mockResolvedValueOnce({
      status: 302,
      data: "",
      headers: { location: "http://169.254.169.254/latest/meta-data/" },
    } as never);

    await expect(safeProxyGet("http://1.1.1.1/")).rejects.toThrow();
    // Only the first (public) hop was fetched; the internal redirect target
    // was rejected by assertUrlSafe before any second fetch.
    expect(mockedAxios.get).toHaveBeenCalledTimes(1);
  });
});
