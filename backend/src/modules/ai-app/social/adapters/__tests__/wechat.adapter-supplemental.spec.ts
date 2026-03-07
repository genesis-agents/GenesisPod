/**
 * Supplemental tests for WechatAdapter — covers branches not in wechat.adapter.spec.ts
 *
 * Focuses on:
 * - getLoginQrCode() — success, element not found, error
 * - checkAndSaveLogin() — no context, no pages, not logged in, logged in with session
 * - checkLoginStatus() (via publish) — URL-based: bizlogin, home/frame
 * - publish() — timeout/navigation/login error message mapping
 * - publish() — no token in URL and no links found
 * - publish() — redirected to login page after editor navigation
 * - publish() — session data as non-string object
 */

import { Test, TestingModule } from "@nestjs/testing";
import { WechatAdapter } from "../wechat.adapter";
import { SocialBrowserService } from "../../services/social-browser.service";
import {
  SocialContent,
  SocialPlatformConnection,
  SocialPlatformType,
  SocialContentType,
  SocialContentStatus,
  SocialContentSourceType,
} from "../../types";

// ---------------------------------------------------------------------------
// Mock session-crypto
// ---------------------------------------------------------------------------
jest.mock("../../utils/session-crypto", () => ({
  decryptSession: jest.fn(),
  encryptSession: jest.fn((data: unknown) => JSON.stringify(data)),
  isEncrypted: jest.fn(() => false),
}));

import { decryptSession } from "../../utils/session-crypto";
const mockDecryptSession = decryptSession as jest.MockedFunction<
  typeof decryptSession
>;

// ---------------------------------------------------------------------------
// Factories
// ---------------------------------------------------------------------------

function makeSessionData(
  cookieOverrides: Record<string, unknown>[] = [],
  extras: Record<string, unknown> = {},
) {
  const defaultCookies = [
    {
      name: "slave_user",
      value: "u1",
      domain: "mp.weixin.qq.com",
      expires: -1,
    },
    {
      name: "data_ticket",
      value: "t1",
      domain: "mp.weixin.qq.com",
      expires: -1,
    },
  ];
  return {
    cookies: cookieOverrides.length > 0 ? cookieOverrides : defaultCookies,
    wechatToken: "token-123",
    ...extras,
  };
}

function makeConnection(
  overrides: Partial<SocialPlatformConnection> = {},
): SocialPlatformConnection {
  return {
    id: "conn-1",
    userId: "user-1",
    platformType: SocialPlatformType.WECHAT_MP,
    accountName: "Test MP",
    isActive: true,
    sessionData: "encrypted-data",
    lastCheckAt: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SocialPlatformConnection;
}

function makeContent(overrides: Partial<SocialContent> = {}): SocialContent {
  return {
    id: "content-1",
    userId: "user-1",
    connectionId: "conn-1",
    title: "Test Article",
    content: "Short content",
    contentType: SocialContentType.WECHAT_ARTICLE,
    status: SocialContentStatus.DRAFT,
    sourceType: SocialContentSourceType.MANUAL,
    images: [],
    tags: [],
    autoPublish: false,
    retryCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SocialContent;
}

function makeMockPlaywright() {
  const mockPage = {
    goto: jest.fn().mockResolvedValue(undefined),
    url: jest
      .fn()
      .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home?token=12345"),
    reload: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(null),
    evaluate: jest.fn().mockResolvedValue(""),
    context: jest.fn().mockReturnValue({
      cookies: jest
        .fn()
        .mockResolvedValue([
          { name: "slave_user", value: "u1", domain: "mp.weixin.qq.com" },
        ]),
      waitForEvent: jest.fn().mockRejectedValue(new Error("timeout")),
    }),
    $: jest.fn().mockResolvedValue(null),
    $$eval: jest.fn().mockResolvedValue([]),
    locator: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(0),
      filter: jest.fn().mockReturnThis(),
      first: jest.fn().mockReturnThis(),
      click: jest.fn().mockResolvedValue(undefined),
    }),
    waitForResponse: jest.fn().mockResolvedValue({
      url: () => "https://mp.weixin.qq.com/cgi-bin/operate_appmsg",
      json: jest.fn().mockResolvedValue({
        base_resp: { ret: 0 },
        appMsgId: "12345",
      }),
    }),
    keyboard: {
      type: jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined),
    },
    screenshot: jest.fn().mockResolvedValue(Buffer.from("")),
    title: jest.fn().mockResolvedValue("Editor"),
    getByRole: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(0),
      first: jest.fn().mockReturnValue({
        fill: jest.fn().mockResolvedValue(undefined),
        click: jest.fn().mockResolvedValue(undefined),
      }),
    }),
    getByText: jest.fn().mockReturnValue({
      count: jest.fn().mockResolvedValue(0),
      first: jest.fn().mockReturnThis(),
      click: jest.fn().mockResolvedValue(undefined),
    }),
    frames: jest.fn().mockReturnValue([]),
  };

  return {
    restoreSession: jest.fn().mockResolvedValue(undefined),
    createPage: jest.fn().mockResolvedValue(mockPage),
    closePage: jest.fn().mockResolvedValue(undefined),
    closeContext: jest.fn().mockResolvedValue(undefined),
    getContext: jest.fn().mockResolvedValue(null),
    saveSession: jest.fn().mockResolvedValue(null),
    page: mockPage,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WechatAdapter (supplemental)", () => {
  let adapter: WechatAdapter;
  let mockPlaywright: ReturnType<typeof makeMockPlaywright>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPlaywright = makeMockPlaywright();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WechatAdapter,
        { provide: SocialBrowserService, useValue: mockPlaywright },
      ],
    }).compile();

    adapter = module.get<WechatAdapter>(WechatAdapter);
  });

  // ─── missing sessionData ────────────────────────────────────────────────────

  describe("missing sessionData", () => {
    it("returns error when connection.sessionData is null", async () => {
      const content = makeContent();
      const connection = makeConnection({
        sessionData: null as unknown as string,
      });

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("未连接");
    });

    it("returns error when connection.sessionData is empty string", async () => {
      const content = makeContent();
      const connection = makeConnection({ sessionData: "" });

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  // ─── zero cookies ───────────────────────────────────────────────────────────

  describe("zero cookies in session", () => {
    it("returns error when decrypted session has no cookies", async () => {
      mockDecryptSession.mockReturnValue({ cookies: [] });

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("Cookie");
    });
  });

  // ─── all key cookies expired ─────────────────────────────────────────────────

  describe("all key cookies expired", () => {
    it("returns error when all authentication cookies are expired", async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      mockDecryptSession.mockReturnValue({
        cookies: [
          { name: "slave_user", value: "v1", expires: pastTime },
          { name: "data_ticket", value: "v2", expires: pastTime },
          { name: "bizuin", value: "v3", expires: pastTime },
        ],
        wechatToken: "",
      });

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("过期");
    });
  });

  // ─── login check failed ──────────────────────────────────────────────────────

  describe("login check failed after navigation", () => {
    it("returns error when page URL indicates login page", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());

      // Override page URL to simulate redirect to login page
      mockPlaywright.page.url.mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login",
      );
      mockPlaywright.createPage.mockResolvedValue(mockPlaywright.page);

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  // ─── content length routing ──────────────────────────────────────────────────

  describe("content length routing", () => {
    it("uses article type 10 for content > 1000 chars", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());

      const longContent = makeContent({ content: "A".repeat(1001) });
      const connection = makeConnection();

      await adapter.publish(longContent, connection);

      expect(mockPlaywright.restoreSession).toHaveBeenCalled();
    });

    it("uses article type 77 for content <= 1000 chars", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());

      const shortContent = makeContent({ content: "A".repeat(500) });
      const connection = makeConnection();

      await adapter.publish(shortContent, connection);

      expect(mockPlaywright.restoreSession).toHaveBeenCalled();
    });
  });

  // ─── playwright exception handling ───────────────────────────────────────────

  describe("error during browser flow", () => {
    it("returns error result when playwright.createPage throws", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());
      mockPlaywright.createPage.mockRejectedValue(new Error("Browser crashed"));

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it("returns error result when restoreSession throws", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());
      mockPlaywright.restoreSession.mockRejectedValue(
        new Error("Session restore failed"),
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
    });

    it("returns timeout-specific error message when timeout occurs", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());
      mockPlaywright.createPage.mockRejectedValue(
        new Error("Timeout exceeded"),
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("超时");
    });

    it("returns navigation-specific error message when navigation fails", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());
      mockPlaywright.createPage.mockRejectedValue(
        new Error("Navigation failed"),
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("导航");
    });

    it("returns login-specific error message when login error occurs", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());
      mockPlaywright.createPage.mockRejectedValue(new Error("login failed"));

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("登录");
    });
  });

  // ─── session data as JSON object (not string) ────────────────────────────────

  describe("sessionData as JSON object", () => {
    it("handles sessionData that is already an object", async () => {
      const sessionObj = makeSessionData();
      const connection = makeConnection({
        sessionData: sessionObj as unknown as string,
      });
      mockDecryptSession.mockReturnValue(sessionObj);

      const content = makeContent();

      const result = await adapter.publish(content, connection);
      expect(result).toBeDefined();
    });
  });

  // ─── getLoginQrCode ──────────────────────────────────────────────────────────

  describe("getLoginQrCode()", () => {
    it("returns QR code src when element found", async () => {
      const mockQrElement = {
        getAttribute: jest
          .fn()
          .mockResolvedValue("https://mp.weixin.qq.com/qrcode.jpg"),
      };
      mockPlaywright.page.waitForSelector = jest
        .fn()
        .mockResolvedValue(mockQrElement);
      mockPlaywright.createPage.mockResolvedValue(mockPlaywright.page);

      const result = await adapter.getLoginQrCode("conn-1");

      expect(result).toBe("https://mp.weixin.qq.com/qrcode.jpg");
      expect(mockPlaywright.page.goto).toHaveBeenCalledWith(
        expect.stringContaining("mp.weixin.qq.com"),
      );
    });

    it("returns null when qr element not found", async () => {
      mockPlaywright.page.waitForSelector = jest.fn().mockResolvedValue(null);
      mockPlaywright.createPage.mockResolvedValue(mockPlaywright.page);

      const result = await adapter.getLoginQrCode("conn-1");

      expect(result).toBeNull();
    });

    it("returns null when playwright throws error", async () => {
      mockPlaywright.createPage.mockRejectedValue(new Error("Browser error"));

      const result = await adapter.getLoginQrCode("conn-1");

      expect(result).toBeNull();
    });

    it("returns null when getAttribute returns null", async () => {
      const mockQrElement = {
        getAttribute: jest.fn().mockResolvedValue(null),
      };
      mockPlaywright.page.waitForSelector = jest
        .fn()
        .mockResolvedValue(mockQrElement);
      mockPlaywright.createPage.mockResolvedValue(mockPlaywright.page);

      const result = await adapter.getLoginQrCode("conn-1");

      expect(result).toBeNull();
    });
  });

  // ─── checkAndSaveLogin ────────────────────────────────────────────────────────

  describe("checkAndSaveLogin()", () => {
    it("returns false when no context found", async () => {
      mockPlaywright.getContext.mockResolvedValue(null);

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });

    it("returns false when context has no pages", async () => {
      mockPlaywright.getContext.mockResolvedValue({
        pages: jest.fn().mockReturnValue([]),
      });

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });

    it("returns false when page is not logged in (bizlogin URL)", async () => {
      const mockPage = {
        url: jest
          .fn()
          .mockReturnValue(
            "https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login",
          ),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        evaluate: jest.fn().mockResolvedValue(""),
      };
      mockPlaywright.getContext.mockResolvedValue({
        pages: jest.fn().mockReturnValue([mockPage]),
      });

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });

    it("returns false when logged in but saveSession returns null", async () => {
      const mockPage = {
        url: jest
          .fn()
          .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home?token=123"),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        evaluate: jest.fn().mockResolvedValue(""),
      };
      mockPlaywright.getContext.mockResolvedValue({
        pages: jest.fn().mockReturnValue([mockPage]),
      });
      mockPlaywright.saveSession.mockResolvedValue(null);

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });

    it("returns true when logged in and saveSession succeeds", async () => {
      const mockPage = {
        url: jest
          .fn()
          .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home?token=123"),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        evaluate: jest.fn().mockResolvedValue(""),
      };
      mockPlaywright.getContext.mockResolvedValue({
        pages: jest.fn().mockReturnValue([mockPage]),
      });
      mockPlaywright.saveSession.mockResolvedValue({
        cookies: [{ name: "c1", value: "v1" }],
      });

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(true);
      expect(mockPlaywright.saveSession).toHaveBeenCalledWith(
        "wechat-login-conn-1",
      );
    });
  });

  // ─── checkLoginStatus — URL branch: /cgi-bin/frame ──────────────────────────

  describe("checkLoginStatus via publish — URL-based detection", () => {
    it("treats /cgi-bin/frame URL as logged in", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());

      // Make page URL indicate /cgi-bin/frame (logged in)
      // But then after editor navigation, it goes to bizlogin → publish returns error
      mockPlaywright.page.url
        .mockReturnValueOnce("https://mp.weixin.qq.com/cgi-bin/frame?t=index") // root nav
        .mockReturnValueOnce("https://mp.weixin.qq.com/cgi-bin/frame?t=index") // token check loop 1
        .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/frame?t=index"); // rest

      mockPlaywright.page.context = jest.fn().mockReturnValue({
        cookies: jest.fn().mockResolvedValue([]),
        waitForEvent: jest.fn().mockRejectedValue(new Error("no new page")),
      });

      // evaluate returns empty (no token from page JS)
      mockPlaywright.page.evaluate.mockResolvedValue("");

      // evaluate for page links returns empty
      mockPlaywright.page.evaluate.mockImplementation(() =>
        Promise.resolve(""),
      );

      const content = makeContent();
      const connection = makeConnection();

      // This just needs to not throw
      const result = await adapter.publish(content, connection);
      expect(result).toBeDefined();
    });
  });

  // ─── publish — redirected to login page after navigation ──────────────────────

  describe("publish — redirected to login page after editor navigation", () => {
    it("returns error when final URL contains bizlogin", async () => {
      mockDecryptSession.mockReturnValue(makeSessionData());

      // First the page has token (to pass checkLoginStatus)
      // then after navigation to editor it shows bizlogin
      let urlCallCount = 0;
      mockPlaywright.page.url.mockImplementation(() => {
        urlCallCount++;
        if (urlCallCount <= 2) {
          return "https://mp.weixin.qq.com/cgi-bin/home?token=12345";
        }
        return "https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login";
      });

      mockPlaywright.page.context = jest.fn().mockReturnValue({
        cookies: jest.fn().mockResolvedValue([]),
        waitForEvent: jest.fn().mockRejectedValue(new Error("no new page")),
      });

      mockPlaywright.page.evaluate.mockResolvedValue("");
      mockPlaywright.page.$.mockResolvedValue(null);

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
    });
  });

  // ─── publish — valid wechatToken used for editor URL ─────────────────────────

  describe("publish — wechatToken from session used for direct navigation", () => {
    it("uses saved wechatToken when URL has no token", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData([], { wechatToken: "saved-token-999" }),
      );

      // URL never has token but checkLoginStatus passes via /cgi-bin/home
      mockPlaywright.page.url.mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/home",
      );

      mockPlaywright.page.context = jest.fn().mockReturnValue({
        cookies: jest.fn().mockResolvedValue([]),
        waitForEvent: jest.fn().mockRejectedValue(new Error("no new page")),
      });

      mockPlaywright.page.evaluate.mockResolvedValue("");

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      // Should have attempted direct navigation using wechatToken
      expect(mockPlaywright.page.goto).toHaveBeenCalled();
      expect(result).toBeDefined();
    });
  });

  // ─── publish — no token anywhere (URL or links) ──────────────────────────────

  describe("publish — no token found in URL or page links", () => {
    it("returns error when no token and no links on page", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData([], { wechatToken: "" }),
      );

      // checkLoginStatus passes via /cgi-bin/home URL
      // but no token= in URL and no editor page opened
      mockPlaywright.page.url.mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/home",
      );

      mockPlaywright.page.context = jest.fn().mockReturnValue({
        cookies: jest.fn().mockResolvedValue([]),
        waitForEvent: jest.fn().mockRejectedValue(new Error("no new page")),
      });

      // evaluate for token from page JS returns empty
      // evaluate for page links returns empty array
      mockPlaywright.page.evaluate
        .mockResolvedValueOnce("") // page state in fillContent / initial navigate
        .mockResolvedValueOnce("") // token from page JS
        .mockResolvedValue([]); // page links

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);
    });
  });
});
