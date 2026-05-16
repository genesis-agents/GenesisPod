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
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Map([["content-type", mime]]) as unknown as Headers,
      arrayBuffer: async () => new ArrayBuffer(8),
    });
  };

  it("rewrites external img src to mmbiz CDN URL on successful upload", async () => {
    makeFetchOk();
    mockPage.evaluate.mockResolvedValue({
      url: "https://mmbiz.qpic.cn/abc/123",
      attempts: [
        { endpoint: "misc-uploadimg2", ret: 0, url: "https://mmbiz.qpic.cn/abc/123" },
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
        { endpoint: "filetransfer-upload-material", ret: -1, url: null, errMsg: "fail" },
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

    it("returns null for already-hosted mmbiz URL (no upload needed)", async () => {
      const result = await service.uploadCover(
        mockPage as unknown as Page,
        "https://mmbiz.qpic.cn/already-hosted",
        "999",
      );

      expect(result).toBeNull();
      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockPage.evaluate).not.toHaveBeenCalled();
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
        attempts: [{ endpoint: "misc-uploadimg2", ret: 0, url: "https://mmbiz.qpic.cn/ok" }],
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
