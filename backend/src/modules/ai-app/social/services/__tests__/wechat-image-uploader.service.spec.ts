import { Test } from "@nestjs/testing";
import type { Page } from "puppeteer";
import { WechatImageUploaderService } from "../wechat-image-uploader.service";

describe("WechatImageUploaderService", () => {
  let service: WechatImageUploaderService;
  let mockPage: { evaluate: jest.Mock };

  const originalFetch = global.fetch;
  let mockFetch: jest.Mock;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [WechatImageUploaderService],
    }).compile();

    service = moduleRef.get(WechatImageUploaderService);
    mockPage = { evaluate: jest.fn() };
    mockFetch = jest.fn();
    global.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.resetAllMocks();
  });

  const makeFetchOk = (mime = "image/jpeg") => {
    // mockImplementation 让每次 fetch 返回独立的 reader 闭包，避免多张图
    // 共用同一个 returned 状态导致后续 fetch 立刻 done。
    mockFetch.mockImplementation(async () => {
      let returned = false;
      return {
        ok: true,
        status: 200,
        headers: new Map([["content-type", mime]]) as unknown as Headers,
        body: {
          getReader: () => ({
            read: async () => {
              if (returned) return { done: true, value: undefined };
              returned = true;
              return { done: false, value: new Uint8Array(8) };
            },
            cancel: async () => undefined,
          }),
        },
      };
    });
  };

  it("rewrites external img src to mmbiz CDN URL on successful upload", async () => {
    makeFetchOk();
    mockPage.evaluate.mockResolvedValue({
      url: "https://mmbiz.qpic.cn/abc/123",
      attempts: [
        {
          endpoint: "misc-uploadimg2",
          ret: 0,
          url: "https://mmbiz.qpic.cn/abc/123",
        },
      ],
    });

    const html = `<p>before</p><img src="https://example.com/foo.jpg" alt="x" /><p>after</p>`;
    const result = await service.rewriteImagesInHtml(
      mockPage as unknown as Page,
      html,
      "999",
    );

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.rewritten).toContain("https://mmbiz.qpic.cn/abc/123");
    expect(result.rewritten).not.toContain("example.com/foo.jpg");
  });

  it("keeps original URL on upload failure and increments failed counter", async () => {
    makeFetchOk();
    mockPage.evaluate.mockResolvedValue({
      url: null,
      attempts: [
        { endpoint: "misc-uploadimg2", ret: -1, url: null, errMsg: "fail" },
        {
          endpoint: "filetransfer-upload-material",
          ret: -1,
          url: null,
          errMsg: "fail",
        },
      ],
    });

    const html = `<img src="https://external.example.com/foo.jpg" />`;
    const result = await service.rewriteImagesInHtml(
      mockPage as unknown as Page,
      html,
      "999",
    );

    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.rewritten).toContain("external.example.com/foo.jpg");
  });

  it("skips images already hosted on mmbiz.qpic.cn", async () => {
    const html = `<img src="https://mmbiz.qpic.cn/abc/xyz" alt="" />`;
    const result = await service.rewriteImagesInHtml(
      mockPage as unknown as Page,
      html,
      "999",
    );

    expect(result.uploaded).toBe(0);
    expect(result.skipped).toBe(1);
    expect(mockPage.evaluate).not.toHaveBeenCalled();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("skips data: URIs and malformed URLs", async () => {
    const html = [
      `<img src="data:image/png;base64,AAA" />`,
      `<img src="not-a-url" />`,
    ].join("");
    const result = await service.rewriteImagesInHtml(
      mockPage as unknown as Page,
      html,
      "999",
    );

    expect(result.skipped).toBe(2);
    expect(result.uploaded).toBe(0);
    expect(result.failed).toBe(0);
    expect(mockPage.evaluate).not.toHaveBeenCalled();
  });

  it("keeps original URL when Node-side fetch fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 404,
      headers: new Map() as unknown as Headers,
      arrayBuffer: async () => new ArrayBuffer(0),
    });

    const html = `<img src="https://broken.example.com/foo.jpg" />`;
    const result = await service.rewriteImagesInHtml(
      mockPage as unknown as Page,
      html,
      "999",
    );

    expect(result.failed).toBe(1);
    expect(result.rewritten).toContain("broken.example.com/foo.jpg");
    expect(mockPage.evaluate).not.toHaveBeenCalled();
  });

  describe("security hardening", () => {
    it("rejects SSRF-unsafe URL pointing to internal IP (loopback)", async () => {
      const html = `<img src="http://127.0.0.1:8080/secret.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it("rejects SSRF-unsafe URL pointing to AWS metadata endpoint", async () => {
      const html = `<img src="http://169.254.169.254/latest/meta-data/" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects SSRF-unsafe URL on RFC1918 private network", async () => {
      const html = `<img src="http://10.0.0.5/foo.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(1);
    });

    it("rejects decimal IP literal (2130706433 = 127.0.0.1)", async () => {
      const html = `<img src="http://2130706433/secret.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(1);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects octal IP literal (0177.0.0.1 = 127.0.0.1)", async () => {
      const html = `<img src="http://0177.0.0.1/secret.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(1);
    });

    it("blocks via Node URL normalization + private-range check (alternate IP forms reach loopback/RFC1918)", async () => {
      // Node 的 URL parser 把 0177.0.0.1 / 2130706433 / 0x7f000001 标准化成
      // 127.0.0.1（loopback），把 10.0.00.5 标准化成 10.0.0.5（RFC1918）。
      // 私网范围检查随后命中。注意：01.0.0.1 标准化成 1.0.0.1（公网）—— 不拦
      // 是预期，那是真公网地址（APNIC quad-zero）。
      const html = [
        `<img src="http://10.0.00.5/x.jpg" />`, // → 10.0.0.5 RFC1918
        `<img src="http://0177.0.0.1/x.jpg" />`, // → 127.0.0.1 loopback
      ].join("");
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(2);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("rejects hex IP literal (0x7f000001 = 127.0.0.1)", async () => {
      const html = `<img src="http://0x7f000001/secret.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(1);
    });

    it("rejects any IPv6 literal hostname", async () => {
      const html = [
        `<img src="http://[::1]/x.jpg" />`,
        `<img src="http://[::ffff:127.0.0.1]/x.jpg" />`,
        `<img src="http://[fc00::1]/x.jpg" />`,
        `<img src="http://[fe80::1]/x.jpg" />`,
      ].join("");
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(4);
    });

    it("rejects oversized response via streaming check (server lies about Content-Length)", async () => {
      // Server reports small Content-Length but actually streams > MAX_IMAGE_BYTES
      const reader = {
        read: jest
          .fn()
          // 12 MB chunk, exceeds 10 MB cap
          .mockResolvedValueOnce({
            done: false,
            value: new Uint8Array(12 * 1024 * 1024),
          })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: jest.fn().mockResolvedValue(undefined),
      };
      const fakeBody = {
        getReader: () => reader,
      };
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ["content-type", "image/jpeg"],
          ["content-length", "1000"], // lies
        ]) as unknown as Headers,
        body: fakeBody,
      });

      const html = `<img src="https://liar.example.com/giant.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );

      expect(result.failed).toBe(1);
      expect(reader.cancel).toHaveBeenCalled();
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it("rejects oversized images via Content-Length header", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Map([
          ["content-type", "image/jpeg"],
          ["content-length", String(20 * 1024 * 1024)],
        ]) as unknown as Headers,
        arrayBuffer: async () => new ArrayBuffer(8),
      });

      const html = `<img src="https://huge.example.com/giant.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );
      expect(result.failed).toBe(1);
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it("rejects upload-result URL that is not on mmbiz.qpic.cn (XSS defense)", async () => {
      makeFetchOk();
      mockPage.evaluate.mockResolvedValue({
        url: 'https://evil.com/" onerror="alert(1)" x="',
        attempts: [{ endpoint: "misc-uploadimg2", ret: 0, url: "..." }],
      });

      const html = `<img src="https://legit.example.com/foo.jpg" />`;
      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );

      expect(result.uploaded).toBe(0);
      expect(result.failed).toBe(1);
      expect(result.rewritten).toContain("legit.example.com/foo.jpg");
      expect(result.rewritten).not.toContain("evil.com");
    });

    it("dedupes identical external URLs into one upload call (saves quota)", async () => {
      makeFetchOk();
      mockPage.evaluate.mockResolvedValue({
        url: "https://mmbiz.qpic.cn/dedup/abc",
        attempts: [],
      });

      const html = [
        `<img src="https://example.com/same.jpg" alt="a" />`,
        `<img src="https://example.com/same.jpg" alt="b" />`,
        `<img src="https://example.com/same.jpg" alt="c" />`,
      ].join("\n");

      const result = await service.rewriteImagesInHtml(
        mockPage as unknown as Page,
        html,
        "999",
      );

      expect(mockPage.evaluate).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.uploaded).toBe(3);
      expect(
        result.rewritten.match(/mmbiz\.qpic\.cn\/dedup\/abc/g)?.length,
      ).toBe(3);
    });
  });

  describe("uploadCover", () => {
    it("returns mediaId + cdnUrl on successful material upload", async () => {
      makeFetchOk();
      mockPage.evaluate.mockResolvedValue({
        mediaId: "100000234",
        cdnUrl: "https://mmbiz.qpic.cn/cover/abc",
        attempts: [
          {
            endpoint: "filetransfer-upload-material",
            ret: 0,
            mediaId: "100000234",
            cdnUrl: "https://mmbiz.qpic.cn/cover/abc",
          },
        ],
      });

      const result = await service.uploadCover(
        mockPage as unknown as Page,
        "https://example.com/cover.jpg",
        "999",
      );

      expect(result).toEqual({
        mediaId: "100000234",
        cdnUrl: "https://mmbiz.qpic.cn/cover/abc",
      });
    });

    it("returns null when material upload fails", async () => {
      makeFetchOk();
      mockPage.evaluate.mockResolvedValue({
        mediaId: null,
        cdnUrl: null,
        attempts: [
          {
            endpoint: "filetransfer-upload-material",
            ret: -1,
            mediaId: null,
            cdnUrl: null,
            errMsg: "permission denied",
          },
        ],
      });

      const result = await service.uploadCover(
        mockPage as unknown as Page,
        "https://example.com/cover.jpg",
        "999",
      );

      expect(result).toBeNull();
    });

    it("returns null when source fetch fails", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        headers: new Map() as unknown as Headers,
        arrayBuffer: async () => new ArrayBuffer(0),
      });

      const result = await service.uploadCover(
        mockPage as unknown as Page,
        "https://broken.example.com/cover.jpg",
        "999",
      );

      expect(result).toBeNull();
      expect(mockPage.evaluate).not.toHaveBeenCalled();
    });

    it("re-uploads already-hosted mmbiz URL to material library (must get media_id)", async () => {
      // Reviewer 共识 Q3：与 body 图不同，封面必须有 file_id 才能填
      // thumb_media_id，所以即便已经在 mmbiz 域，也要重传一次。
      makeFetchOk();
      mockPage.evaluate.mockResolvedValue({
        mediaId: "fresh-media-id-999",
        cdnUrl: "https://mmbiz.qpic.cn/cover/fresh",
        attempts: [],
      });

      const result = await service.uploadCover(
        mockPage as unknown as Page,
        "https://mmbiz.qpic.cn/already-hosted",
        "999",
      );

      expect(result).toEqual({
        mediaId: "fresh-media-id-999",
        cdnUrl: "https://mmbiz.qpic.cn/cover/fresh",
      });
      expect(mockFetch).toHaveBeenCalled();
      expect(mockPage.evaluate).toHaveBeenCalled();
    });

    it("rejects SSRF-unsafe URL in cover path", async () => {
      const result = await service.uploadCover(
        mockPage as unknown as Page,
        "http://169.254.169.254/cover.jpg",
        "999",
      );

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it("returns null when partial response missing mediaId or cdnUrl", async () => {
      makeFetchOk();
      mockPage.evaluate.mockResolvedValue({
        mediaId: "100000234",
        cdnUrl: null,
        attempts: [],
      });

      const result = await service.uploadCover(
        mockPage as unknown as Page,
        "https://example.com/cover.jpg",
        "999",
      );

      expect(result).toBeNull();
    });
  });

  it("processes multiple images independently (mix of success/skip/fail)", async () => {
    makeFetchOk();
    mockPage.evaluate
      .mockResolvedValueOnce({
        url: "https://mmbiz.qpic.cn/ok",
        attempts: [
          {
            endpoint: "misc-uploadimg2",
            ret: 0,
            url: "https://mmbiz.qpic.cn/ok",
          },
        ],
      })
      .mockResolvedValueOnce({
        url: null,
        attempts: [{ endpoint: "misc-uploadimg2", ret: -1, url: null }],
      });

    const html = [
      `<img src="https://a.example.com/1.jpg" />`,
      `<img src="https://mmbiz.qpic.cn/existing" />`,
      `<img src="https://b.example.com/2.jpg" />`,
    ].join("\n");

    const result = await service.rewriteImagesInHtml(
      mockPage as unknown as Page,
      html,
      "999",
    );

    expect(result.uploaded).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.rewritten).toContain("mmbiz.qpic.cn/ok");
    expect(result.rewritten).toContain("mmbiz.qpic.cn/existing");
    expect(result.rewritten).toContain("b.example.com/2.jpg");
  });
});
