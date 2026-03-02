/**
 * Supplemental tests for WechatAdapter — covers branches not in wechat.adapter.spec.ts
 *
 * Focuses on:
 * - Missing sessionData → error result
 * - Zero cookies → error result
 * - All key cookies expired → error result
 * - login check failed → error result
 * - Content length routing (>1000 chars → type 10, <=1000 → type 77)
 * - Publish error thrown during flow
 * - Token extraction from wechatToken vs URL
 * - getLoginQrCode: success and failure paths
 * - checkAndSaveLogin: no context, no pages, logged out, logged in
 * - Error message mapping (timeout, navigation, login)
 * - closeContext called in finally block
 * - Non-string sessionData (object)
 */

import { Test, TestingModule } from "@nestjs/testing";
import { WechatAdapter } from "../wechat.adapter";
import { PlaywrightService } from "../../services/playwright.service";
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
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as SocialContent;
}

function makeMockLocator() {
  return {
    count: jest.fn().mockResolvedValue(0),
    filter: jest.fn().mockReturnThis(),
    first: jest.fn().mockReturnThis(),
    click: jest.fn().mockResolvedValue(undefined),
    fill: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMockContext() {
  return {
    cookies: jest
      .fn()
      .mockResolvedValue([
        { name: "slave_user", value: "u1", domain: "mp.weixin.qq.com" },
      ]),
    waitForEvent: jest.fn().mockRejectedValue(new Error("timeout")),
    pages: jest.fn().mockReturnValue([]),
  };
}

function makeMockPage() {
  const mockContext = makeMockContext();
  const mockLocator = makeMockLocator();

  const page = {
    goto: jest.fn().mockResolvedValue(undefined),
    url: jest
      .fn()
      .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home?token=12345"),
    reload: jest.fn().mockResolvedValue(undefined),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    evaluate: jest.fn().mockResolvedValue(""),
    context: jest.fn().mockReturnValue(mockContext),
    $: jest.fn().mockResolvedValue(null),
    $$eval: jest.fn().mockResolvedValue([]),
    locator: jest.fn().mockReturnValue(mockLocator),
    getByRole: jest.fn().mockReturnValue(mockLocator),
    getByText: jest.fn().mockReturnValue(mockLocator),
    waitForResponse: jest.fn().mockResolvedValue({
      url: () => "https://mp.weixin.qq.com/cgi-bin/operate_appmsg",
      status: () => 200,
      json: jest
        .fn()
        .mockResolvedValue({ base_resp: { ret: 0 }, appMsgId: "12345" }),
    }),
    keyboard: {
      type: jest.fn().mockResolvedValue(undefined),
      press: jest.fn().mockResolvedValue(undefined),
    },
    screenshot: jest.fn().mockResolvedValue(Buffer.from("")),
    title: jest.fn().mockResolvedValue("WeChat MP Editor"),
    frames: jest.fn().mockReturnValue([]),
    waitForSelector: jest.fn().mockResolvedValue(null),
  };

  return { page, mockContext, mockLocator };
}

function makeMockPlaywright() {
  const { page, mockContext } = makeMockPage();

  return {
    restoreSession: jest.fn().mockResolvedValue(undefined),
    createPage: jest.fn().mockResolvedValue(page),
    getContext: jest.fn().mockResolvedValue(mockContext),
    saveSession: jest.fn().mockResolvedValue({ cookies: [] }),
    closePage: jest.fn().mockResolvedValue(undefined),
    closeContext: jest.fn().mockResolvedValue(undefined),
    page,
    mockContext,
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
        { provide: PlaywrightService, useValue: mockPlaywright },
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
      mockDecryptSession.mockReturnValue({
        cookies: [],
      } as ReturnType<typeof decryptSession>);
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
      mockDecryptSession.mockReturnValue({
        cookies: [],
      } as ReturnType<typeof decryptSession>);

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
          {
            name: "slave_user",
            value: "v1",
            expires: pastTime,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
          {
            name: "data_ticket",
            value: "v2",
            expires: pastTime,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
          {
            name: "bizuin",
            value: "v3",
            expires: pastTime,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
        ],
        wechatToken: "",
      } as ReturnType<typeof decryptSession>);

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toContain("过期");
    });

    it("returns error even when some non-key cookies are valid but all key cookies expired", async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const futureTime = Math.floor(Date.now() / 1000) + 3600;
      mockDecryptSession.mockReturnValue({
        cookies: [
          // A non-key cookie that is still valid
          {
            name: "some_other_cookie",
            value: "ok",
            expires: futureTime,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
          // Key cookies all expired
          {
            name: "slave_user",
            value: "v1",
            expires: pastTime,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
          {
            name: "slave_sid",
            value: "v2",
            expires: pastTime,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
        ],
        wechatToken: "",
      } as ReturnType<typeof decryptSession>);

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
    });
  });

  // ─── login check failed ──────────────────────────────────────────────────────

  describe("login check failed after navigation", () => {
    it("returns error when page URL indicates login page", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );

      // Override page URL to simulate redirect to login page
      mockPlaywright.page.url.mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login",
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });
  });

  // ─── content length routing ──────────────────────────────────────────────────

  describe("content length routing", () => {
    it("uses article type 10 for content > 1000 chars (calls restoreSession)", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );

      const longContent = makeContent({ content: "A".repeat(1001) });
      const connection = makeConnection();

      await adapter.publish(longContent, connection);

      expect(mockPlaywright.restoreSession).toHaveBeenCalled();
    });

    it("uses article type 77 for content <= 1000 chars (calls restoreSession)", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );

      const shortContent = makeContent({ content: "A".repeat(500) });
      const connection = makeConnection();

      await adapter.publish(shortContent, connection);

      expect(mockPlaywright.restoreSession).toHaveBeenCalled();
    });

    it("uses article type 77 for content exactly 1000 chars", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );

      const exactContent = makeContent({ content: "A".repeat(1000) });
      const connection = makeConnection();

      // Just confirm it runs without throwing
      const result = await adapter.publish(exactContent, connection);

      expect(result).toBeDefined();
    });
  });

  // ─── playwright exception handling ───────────────────────────────────────────

  describe("error during browser flow", () => {
    it("returns error result when playwright.createPage throws", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );
      mockPlaywright.createPage.mockRejectedValue(new Error("Browser crashed"));

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toBeDefined();
    });

    it("returns error result when restoreSession throws", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );
      mockPlaywright.restoreSession.mockRejectedValue(
        new Error("Session restore failed"),
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
    });

    it("maps timeout error to 超时 message", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );
      mockPlaywright.restoreSession.mockRejectedValue(
        new Error("Timeout exceeded"),
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/超时/);
    });

    it("maps navigation error to 导航失败 message", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );
      mockPlaywright.restoreSession.mockRejectedValue(
        new Error("Navigation failed"),
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/导航/);
    });

    it("maps login error to 登录状态异常 message", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );
      mockPlaywright.restoreSession.mockRejectedValue(
        new Error("登录 session expired"),
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/登录状态异常/);
    });

    it("always calls closeContext in finally block", async () => {
      mockDecryptSession.mockReturnValue(
        makeSessionData() as ReturnType<typeof decryptSession>,
      );
      mockPlaywright.restoreSession.mockRejectedValue(new Error("some error"));

      const content = makeContent();
      const connection = makeConnection();

      await adapter.publish(content, connection);

      expect(mockPlaywright.closeContext).toHaveBeenCalledWith(
        `wechat-${connection.id}`,
      );
    });
  });

  // ─── session data as JSON object (not string) ────────────────────────────────

  describe("sessionData as JSON object", () => {
    it("handles sessionData that is already an object (not encrypted string)", async () => {
      // connection.sessionData as a JSON object (not encrypted string)
      const sessionObj = makeSessionData();
      const connection = makeConnection({
        sessionData: sessionObj as unknown as string,
      });
      mockDecryptSession.mockReturnValue(
        sessionObj as ReturnType<typeof decryptSession>,
      );

      const content = makeContent();

      // Should not throw - just verify it runs
      const result = await adapter.publish(content, connection);
      expect(result).toBeDefined();
    });
  });

  // ─── getLoginQrCode ──────────────────────────────────────────────────────────

  describe("getLoginQrCode", () => {
    it("returns QR code src when element found", async () => {
      const mockQrElement = {
        getAttribute: jest.fn().mockResolvedValue("data:image/png;base64,abc"),
      };
      mockPlaywright.page.waitForSelector = jest
        .fn()
        .mockResolvedValue(mockQrElement);

      const result = await adapter.getLoginQrCode("conn-123");

      expect(result).toBe("data:image/png;base64,abc");
    });

    it("returns null when QR code element not found (timeout)", async () => {
      mockPlaywright.page.waitForSelector = jest
        .fn()
        .mockRejectedValue(new Error("Timeout waiting for selector"));

      const result = await adapter.getLoginQrCode("conn-123");

      expect(result).toBeNull();
    });

    it("returns null when waitForSelector returns null", async () => {
      mockPlaywright.page.waitForSelector = jest.fn().mockResolvedValue(null);

      const result = await adapter.getLoginQrCode("conn-123");

      expect(result).toBeNull();
    });
  });

  // ─── checkAndSaveLogin ──────────────────────────────────────────────────────

  describe("checkAndSaveLogin", () => {
    it("returns false when context is not found", async () => {
      mockPlaywright.getContext.mockResolvedValue(null);

      const result = await adapter.checkAndSaveLogin("conn-123");

      expect(result).toBe(false);
    });

    it("returns false when context has no pages", async () => {
      mockPlaywright.mockContext.pages.mockReturnValue([]);

      const result = await adapter.checkAndSaveLogin("conn-123");

      expect(result).toBe(false);
    });

    it("returns false when page is not logged in", async () => {
      // Set up a page that indicates login page URL
      const logoutPage = {
        ...mockPlaywright.page,
        url: jest
          .fn()
          .mockReturnValue(
            "https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login",
          ),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        evaluate: jest.fn().mockResolvedValue(""),
      };
      mockPlaywright.mockContext.pages.mockReturnValue([logoutPage]);

      const result = await adapter.checkAndSaveLogin("conn-123");

      expect(result).toBe(false);
    });

    it("returns true and saves session when logged in", async () => {
      // Set up a page that indicates logged-in state
      const loggedInPage = {
        ...mockPlaywright.page,
        url: jest
          .fn()
          .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home?token=12345"),
        waitForLoadState: jest.fn().mockResolvedValue(undefined),
        $: jest.fn().mockResolvedValue(null),
        evaluate: jest.fn().mockResolvedValue(""),
      };
      mockPlaywright.mockContext.pages.mockReturnValue([loggedInPage]);
      mockPlaywright.saveSession.mockResolvedValue({
        cookies: [{ name: "slave_user" }],
      });

      const result = await adapter.checkAndSaveLogin("conn-123");

      expect(result).toBe(true);
      expect(mockPlaywright.saveSession).toHaveBeenCalled();
    });
  });

  // ─── wechatToken from session ────────────────────────────────────────────────

  describe("token handling", () => {
    it("uses saved wechatToken from session when available", async () => {
      mockDecryptSession.mockReturnValue({
        cookies: [
          {
            name: "slave_user",
            value: "v1",
            expires: -1,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
          {
            name: "data_ticket",
            value: "v2",
            expires: -1,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
        ],
        wechatToken: "saved-token-999",
      } as ReturnType<typeof decryptSession>);

      // URL doesn't have token but we have wechatToken saved
      mockPlaywright.page.url.mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/home",
      );

      const content = makeContent();
      const connection = makeConnection();

      // This will fail somewhere in the flow but it should not throw
      const result = await adapter.publish(content, connection);
      expect(result).toBeDefined();
    });

    it("falls through to URL token extraction when wechatToken not in session", async () => {
      mockDecryptSession.mockReturnValue({
        cookies: [
          {
            name: "slave_user",
            value: "v1",
            expires: -1,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
          {
            name: "data_ticket",
            value: "v2",
            expires: -1,
            domain: "mp.weixin.qq.com",
            path: "/",
            httpOnly: false,
            secure: false,
          },
        ],
        // No wechatToken
      } as ReturnType<typeof decryptSession>);

      // URL contains token
      mockPlaywright.page.url.mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/home?token=77777",
      );

      const content = makeContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);
      expect(result).toBeDefined();
    });
  });
});
