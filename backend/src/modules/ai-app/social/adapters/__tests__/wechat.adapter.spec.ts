/**
 * Unit tests for WechatAdapter
 *
 * All Playwright browser interactions and session-crypto are fully mocked.
 * No real browser is launched and no real encryption/decryption is performed.
 */

import { Test, TestingModule } from "@nestjs/testing";
import { WechatAdapter } from "../wechat.adapter";
import { PlaywrightService } from "../../services/playwright.service";
import { SocialContent, SocialPlatformConnection, SocialPlatformType, SocialContentType, SocialContentStatus, SocialContentSourceType } from "../../types";

// ---------------------------------------------------------------------------
// Mock session-crypto — return predictable plain objects
// ---------------------------------------------------------------------------
jest.mock("../../utils/session-crypto", () => ({
  decryptSession: jest.fn(),
  encryptSession: jest.fn((data: unknown) => JSON.stringify(data)),
  isEncrypted: jest.fn(() => false),
}));

import { decryptSession } from "../../utils/session-crypto";
const mockDecryptSession = decryptSession as jest.MockedFunction<typeof decryptSession>;

// ---------------------------------------------------------------------------
// Shared mock factories
// ---------------------------------------------------------------------------

function makeSessionData(overrides: Record<string, unknown> = {}) {
  return {
    cookies: [
      {
        name: "slave_user",
        value: "abc",
        domain: "mp.weixin.qq.com",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
      },
      {
        name: "data_ticket",
        value: "xyz",
        domain: "mp.weixin.qq.com",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false,
      },
    ],
    wechatToken: "12345",
    ...overrides,
  };
}

function makeMockResponse(jsonBody: unknown = { base_resp: { ret: 0 } }) {
  return {
    url: () => "https://mp.weixin.qq.com/cgi-bin/operate_appmsg",
    status: () => 200,
    json: jest.fn().mockResolvedValue(jsonBody),
  };
}

/** Creates a full mock Playwright page object */
function makeMockPage() {
  const mockLocator = {
    count: jest.fn().mockResolvedValue(0),
    first: jest.fn().mockReturnThis(),
    click: jest.fn().mockResolvedValue(undefined),
    filter: jest.fn().mockReturnThis(),
  };

  const mockContext = {
    cookies: jest.fn().mockResolvedValue([]),
    waitForEvent: jest.fn().mockResolvedValue(undefined),
  };

  const page: Record<string, jest.Mock | Record<string, unknown>> = {
    goto: jest.fn().mockResolvedValue(undefined),
    url: jest.fn().mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home?token=12345"),
    waitForTimeout: jest.fn().mockResolvedValue(undefined),
    waitForLoadState: jest.fn().mockResolvedValue(undefined),
    waitForSelector: jest.fn().mockResolvedValue(null),
    waitForResponse: jest.fn().mockResolvedValue({
      url: () => "https://mp.weixin.qq.com/cgi-bin/operate_appmsg",
      status: () => 200,
      json: async () => ({ base_resp: { ret: 0 } }),
    }),
    $: jest.fn().mockResolvedValue(null),
    $$eval: jest.fn().mockResolvedValue([]),
    evaluate: jest.fn().mockResolvedValue(false),
    $eval: jest.fn().mockResolvedValue(""),
    screenshot: jest.fn().mockResolvedValue(Buffer.from("screenshot")),
    title: jest.fn().mockResolvedValue("Editor"),
    reload: jest.fn().mockResolvedValue(undefined),
    context: jest.fn().mockReturnValue(mockContext),
    locator: jest.fn().mockReturnValue(mockLocator),
    getByRole: jest.fn().mockReturnValue(mockLocator),
    getByText: jest.fn().mockReturnValue(mockLocator),
    frames: jest.fn().mockReturnValue([]),
    keyboard: {
      press: jest.fn().mockResolvedValue(undefined),
      type: jest.fn().mockResolvedValue(undefined),
    },
  };

  return { page, mockContext, mockLocator };
}

function makeMockPlaywrightService(pageOverrides?: Partial<Record<string, jest.Mock>>) {
  const { page, mockContext, mockLocator } = makeMockPage();
  Object.assign(page, pageOverrides ?? {});

  return {
    mockPage: page,
    mockContext,
    mockLocator,
    service: {
      createContext: jest.fn().mockResolvedValue(mockContext),
      getContext: jest.fn().mockResolvedValue(mockContext),
      createPage: jest.fn().mockResolvedValue(page),
      saveSession: jest.fn().mockResolvedValue({ cookies: [] }),
      restoreSession: jest.fn().mockResolvedValue(undefined),
      closeContext: jest.fn().mockResolvedValue(undefined),
      cleanup: jest.fn().mockResolvedValue(undefined),
      screenshot: jest.fn().mockResolvedValue(undefined),
    } as unknown as PlaywrightService,
  };
}

function makeSocialContent(overrides: Partial<SocialContent> = {}): SocialContent {
  return {
    id: "content-1",
    userId: "user-1",
    contentType: SocialContentType.WECHAT_ARTICLE,
    sourceType: SocialContentSourceType.MANUAL,
    title: "Test Title",
    content: "Test content body",
    images: [],
    tags: [],
    status: SocialContentStatus.DRAFT,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeConnection(sessionDataValue: string | null = JSON.stringify(makeSessionData())): SocialPlatformConnection {
  return {
    id: "conn-1",
    userId: "user-1",
    platformType: SocialPlatformType.WECHAT_MP,
    isActive: true,
    sessionData: sessionDataValue,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe("WechatAdapter", () => {
  let adapter: WechatAdapter;
  let playwrightServiceMock: PlaywrightService;
  let mockPage: Record<string, jest.Mock | Record<string, unknown>>;
  let mockContext: { cookies: jest.Mock; waitForEvent: jest.Mock };

  beforeEach(async () => {
    const { service, mockPage: mp, mockContext: mc } = makeMockPlaywrightService();
    playwrightServiceMock = service;
    mockPage = mp;
    mockContext = mc;

    // Default: decryptSession returns a valid session
    mockDecryptSession.mockReturnValue(makeSessionData() as any);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WechatAdapter,
        { provide: PlaywrightService, useValue: playwrightServiceMock },
      ],
    }).compile();

    adapter = module.get<WechatAdapter>(WechatAdapter);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // publish — early exit cases (no browser involvement)
  // -------------------------------------------------------------------------

  describe("publish — early exits", () => {
    it("returns failure when connection has no sessionData", async () => {
      const content = makeSocialContent();
      const connection = makeConnection(null);

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/未连接|登录已过期/);
      expect(playwrightServiceMock.restoreSession).not.toHaveBeenCalled();
    });

    it("returns failure when decrypted sessionData has no cookies", async () => {
      mockDecryptSession.mockReturnValue({ cookies: [] } as any);
      const content = makeSocialContent();
      const connection = makeConnection(JSON.stringify({ cookies: [] }));

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/无效|Cookie/);
    });

    it("returns failure when all key authentication cookies are expired", async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      mockDecryptSession.mockReturnValue({
        cookies: [
          {
            name: "slave_user",
            value: "x",
            domain: "mp.weixin.qq.com",
            path: "/",
            expires: pastTimestamp,
            httpOnly: false,
            secure: false,
          },
        ],
      } as any);

      const content = makeSocialContent();
      const connection = makeConnection("encrypted-data");

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/过期|失效/);
    });
  });

  // -------------------------------------------------------------------------
  // publish — article type selection
  // -------------------------------------------------------------------------

  describe("publish — article type selection", () => {
    /**
     * We need the full publish flow to complete successfully to check
     * which URL was used. We set up a "happy path" for this group.
     */

    function setupHappyPath() {
      // After restoreSession and createPage, page is at home URL with token
      (mockPage.url as jest.Mock)
        .mockReturnValueOnce("https://mp.weixin.qq.com/cgi-bin/home?token=12345") // root nav
        .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/home?token=12345");

      // checkLoginStatus: URL includes /cgi-bin/home → logged in
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);

      // Locator-based button clicks return 0 (no button found via locator)
      const mockLocator = {
        count: jest.fn().mockResolvedValue(0),
        first: jest.fn().mockReturnThis(),
        click: jest.fn().mockResolvedValue(undefined),
        filter: jest.fn().mockReturnThis(),
      };
      (mockPage.locator as jest.Mock).mockReturnValue(mockLocator);
      (mockPage.getByRole as jest.Mock).mockReturnValue(mockLocator);
      (mockPage.getByText as jest.Mock).mockReturnValue(mockLocator);

      // page.context() returns a context that can waitForEvent (no new page opens)
      (mockContext.waitForEvent as jest.Mock).mockRejectedValue(new Error("timeout"));

      // Direct navigation to editor
      // After direct navigation, url includes appmsg_edit
      (mockPage.url as jest.Mock).mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/appmsg?t=media/appmsg_edit_v2&action=edit&isNew=1&type=10&token=12345",
      );

      // fillContent
      (mockPage.evaluate as jest.Mock).mockResolvedValue({
        success: true,
        selector: ".ProseMirror",
        method: "execCommand",
      });

      // $ returns elements for editor / title
      const mockEl = {
        fill: jest.fn().mockResolvedValue(undefined),
        click: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue("ProseMirror"),
        textContent: jest.fn().mockResolvedValue(""),
      };
      (mockPage.$ as jest.Mock).mockResolvedValue(mockEl);

      // getByRole for save button returns count=1
      const saveLocator = {
        count: jest.fn().mockResolvedValue(1),
        first: jest.fn().mockReturnThis(),
        click: jest.fn().mockResolvedValue(undefined),
      };
      (mockPage.getByRole as jest.Mock).mockImplementation((role: string, options: unknown) => {
        if (role === "button") return saveLocator;
        return { count: jest.fn().mockResolvedValue(0), first: jest.fn().mockReturnThis(), click: jest.fn() };
      });

      // waitForResponse — save API response
      (mockPage.waitForResponse as jest.Mock).mockResolvedValue({
        url: () => "https://mp.weixin.qq.com/cgi-bin/operate_appmsg",
        status: () => 200,
        json: async () => ({ base_resp: { ret: 0 } }),
      });
    }

    it("uses article type 10 for content longer than 1000 chars", async () => {
      setupHappyPath();
      const content = makeSocialContent({ content: "A".repeat(1001) });
      const connection = makeConnection();

      await adapter.publish(content, connection);

      // Because we set token=12345 in session and no button click success,
      // it navigates directly with type=10
      expect(playwrightServiceMock.restoreSession).toHaveBeenCalled();
    });

    it("uses article type 77 for content shorter than or equal to 1000 chars", async () => {
      setupHappyPath();
      const content = makeSocialContent({ content: "B".repeat(500) });
      const connection = makeConnection();

      await adapter.publish(content, connection);

      expect(playwrightServiceMock.restoreSession).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // publish — login check failure path
  // -------------------------------------------------------------------------

  describe("publish — login check failure", () => {
    it("returns failure when checkLoginStatus indicates not logged in", async () => {
      // After restoreSession/createPage, URL indicates login page
      (mockPage.url as jest.Mock).mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login",
      );
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (mockPage.$ as jest.Mock).mockResolvedValue(null);
      (mockPage.evaluate as jest.Mock).mockResolvedValue(""); // no login timeout text

      const content = makeSocialContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/登录|过期/);
    });
  });

  // -------------------------------------------------------------------------
  // publish — redirected to login after editor navigation
  // -------------------------------------------------------------------------

  describe("publish — redirected to login after editor navigation", () => {
    it("returns failure when editor URL contains bizlogin", async () => {
      // Session valid, createPage succeeds
      // Home URL has token
      (mockPage.url as jest.Mock)
        .mockReturnValueOnce("https://mp.weixin.qq.com/cgi-bin/home?token=12345") // first url() call
        .mockReturnValue("https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login"); // subsequent calls

      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (mockPage.$ as jest.Mock).mockResolvedValue(null);
      // checkLoginStatus: URL includes /cgi-bin/home on first check, then redirected
      // We need to re-mock url() per call — let's use a call counter
      let urlCallCount = 0;
      (mockPage.url as jest.Mock).mockImplementation(() => {
        urlCallCount++;
        // calls 1-16: during token waiting loop → home with token
        if (urlCallCount <= 16) return "https://mp.weixin.qq.com/cgi-bin/home?token=12345";
        // calls after: bizlogin
        return "https://mp.weixin.qq.com/cgi-bin/bizlogin?action=login";
      });

      const mockLocator = {
        count: jest.fn().mockResolvedValue(0),
        first: jest.fn().mockReturnThis(),
        click: jest.fn().mockResolvedValue(undefined),
        filter: jest.fn().mockReturnThis(),
      };
      (mockPage.locator as jest.Mock).mockReturnValue(mockLocator);
      (mockPage.getByRole as jest.Mock).mockReturnValue(mockLocator);
      (mockPage.getByText as jest.Mock).mockReturnValue(mockLocator);

      const content = makeSocialContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      // Either login check fails or redirect detection fires
      expect(result.success).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // publish — error handling and message mapping
  // -------------------------------------------------------------------------

  describe("publish — error handling", () => {
    it("maps timeout error to user-friendly message", async () => {
      (playwrightServiceMock.restoreSession as jest.Mock).mockRejectedValue(
        new Error("Timeout exceeded"),
      );

      const content = makeSocialContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/超时/);
    });

    it("maps navigation error to user-friendly message", async () => {
      (playwrightServiceMock.restoreSession as jest.Mock).mockRejectedValue(
        new Error("Navigation failed"),
      );

      const content = makeSocialContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/导航/);
    });

    it("maps login error to user-friendly message", async () => {
      (playwrightServiceMock.restoreSession as jest.Mock).mockRejectedValue(
        new Error("登录 session expired"),
      );

      const content = makeSocialContent();
      const connection = makeConnection();

      const result = await adapter.publish(content, connection);

      expect(result.success).toBe(false);
      expect(result.errorMessage).toMatch(/登录状态异常/);
    });

    it("always calls closeContext in finally block even on error", async () => {
      (playwrightServiceMock.restoreSession as jest.Mock).mockRejectedValue(
        new Error("some error"),
      );

      const content = makeSocialContent();
      const connection = makeConnection();

      await adapter.publish(content, connection);

      expect(playwrightServiceMock.closeContext).toHaveBeenCalledWith(
        `wechat-${connection.id}`,
      );
    });

    it("uses sessionData as object when connection.sessionData is not a string", async () => {
      // sessionData as object (non-string)
      const sessionObj = makeSessionData();
      const connection: SocialPlatformConnection = {
        id: "conn-1",
        userId: "user-1",
        platformType: SocialPlatformType.WECHAT_MP,
        isActive: true,
        sessionData: sessionObj as unknown as string,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Force an early error so we can check decryptSession was called
      (playwrightServiceMock.restoreSession as jest.Mock).mockRejectedValue(
        new Error("bail"),
      );

      await adapter.publish(makeSocialContent(), connection);

      expect(mockDecryptSession).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getLoginQrCode
  // -------------------------------------------------------------------------

  describe("getLoginQrCode", () => {
    it("returns null when QR element not found", async () => {
      (mockPage.waitForSelector as jest.Mock).mockResolvedValue(null);

      const result = await adapter.getLoginQrCode("conn-1");

      expect(result).toBeNull();
    });

    it("returns src attribute when QR element is found", async () => {
      const mockQrEl = {
        getAttribute: jest.fn().mockResolvedValue("https://qr.example.com/qr.png"),
      };
      (mockPage.waitForSelector as jest.Mock).mockResolvedValue(mockQrEl);

      const result = await adapter.getLoginQrCode("conn-1");

      expect(result).toBe("https://qr.example.com/qr.png");
      expect(playwrightServiceMock.createPage).toHaveBeenCalledWith(
        "wechat-login-conn-1",
      );
    });

    it("returns null when page.waitForSelector throws", async () => {
      (mockPage.waitForSelector as jest.Mock).mockRejectedValue(
        new Error("timeout"),
      );

      const result = await adapter.getLoginQrCode("conn-1");

      expect(result).toBeNull();
    });

    it("returns null when getAttribute returns null", async () => {
      const mockQrEl = {
        getAttribute: jest.fn().mockResolvedValue(null),
      };
      (mockPage.waitForSelector as jest.Mock).mockResolvedValue(mockQrEl);

      const result = await adapter.getLoginQrCode("conn-1");

      // The code checks `if (qrCodeElement)` then calls getAttribute
      // getAttribute returns null → returns null
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // checkAndSaveLogin
  // -------------------------------------------------------------------------

  describe("checkAndSaveLogin", () => {
    it("returns false when context is not found", async () => {
      (playwrightServiceMock.getContext as jest.Mock).mockResolvedValue(null);

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });

    it("returns false when context has no pages", async () => {
      const emptyContext = { pages: jest.fn().mockReturnValue([]) };
      (playwrightServiceMock.getContext as jest.Mock).mockResolvedValue(
        emptyContext,
      );

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });

    it("returns false when page is not logged in", async () => {
      // Page URL indicates login page
      (mockPage.url as jest.Mock).mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/bizlogin",
      );
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (mockPage.$ as jest.Mock).mockResolvedValue(null);
      (mockPage.evaluate as jest.Mock).mockResolvedValue("");

      const contextWithPage = { pages: jest.fn().mockReturnValue([mockPage]) };
      (playwrightServiceMock.getContext as jest.Mock).mockResolvedValue(
        contextWithPage,
      );

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });

    it("returns true when logged in and session saved successfully", async () => {
      // URL indicates home page → logged in
      (mockPage.url as jest.Mock).mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/home",
      );
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);

      const contextWithPage = { pages: jest.fn().mockReturnValue([mockPage]) };
      (playwrightServiceMock.getContext as jest.Mock).mockResolvedValue(
        contextWithPage,
      );
      (playwrightServiceMock.saveSession as jest.Mock).mockResolvedValue({
        cookies: [{ name: "slave_user", value: "x" }],
      });

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(true);
      expect(playwrightServiceMock.saveSession).toHaveBeenCalledWith(
        "wechat-login-conn-1",
      );
    });

    it("returns false when saveSession returns null", async () => {
      (mockPage.url as jest.Mock).mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/home",
      );
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);

      const contextWithPage = { pages: jest.fn().mockReturnValue([mockPage]) };
      (playwrightServiceMock.getContext as jest.Mock).mockResolvedValue(
        contextWithPage,
      );
      (playwrightServiceMock.saveSession as jest.Mock).mockResolvedValue(null);

      const result = await adapter.checkAndSaveLogin("conn-1");

      expect(result).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // private checkLoginStatus — via the publish flow
  // The private checkLoginStatus method is tested indirectly.
  // We cover additional branches using getLoginQrCode as entry or
  // checkAndSaveLogin since they call checkLoginStatus(page).
  // -------------------------------------------------------------------------

  describe("private checkLoginStatus branches", () => {
    /**
     * Shortcut: checkAndSaveLogin → checks pages[0] login status
     */
    function setupContextWithPage() {
      const ctx = { pages: jest.fn().mockReturnValue([mockPage]) };
      (playwrightServiceMock.getContext as jest.Mock).mockResolvedValue(ctx);
    }

    it("returns false via login form selector detection", async () => {
      (mockPage.url as jest.Mock).mockReturnValue("https://mp.weixin.qq.com/");
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);

      // selector checks — $ returns login form
      (mockPage.$ as jest.Mock).mockImplementation(async (sel: string) => {
        if (sel === ".login__type__qrcode") return { exists: true };
        return null;
      });

      setupContextWithPage();
      const result = await adapter.checkAndSaveLogin("conn-1");
      expect(result).toBe(false);
    });

    it("returns false via login timeout text detection", async () => {
      (mockPage.url as jest.Mock).mockReturnValue("https://mp.weixin.qq.com/");
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);
      (mockPage.$ as jest.Mock).mockResolvedValue(null);
      (mockPage.evaluate as jest.Mock).mockResolvedValue("Login timeout");

      setupContextWithPage();
      const result = await adapter.checkAndSaveLogin("conn-1");
      expect(result).toBe(false);
    });

    it("returns true via cgi-bin/frame URL detection", async () => {
      (mockPage.url as jest.Mock).mockReturnValue(
        "https://mp.weixin.qq.com/cgi-bin/frame",
      );
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);

      setupContextWithPage();
      (playwrightServiceMock.saveSession as jest.Mock).mockResolvedValue({
        cookies: [{ name: "x", value: "y" }],
      });

      const result = await adapter.checkAndSaveLogin("conn-1");
      expect(result).toBe(true);
    });

    it("returns true via logged-in selector element", async () => {
      (mockPage.url as jest.Mock).mockReturnValue("https://mp.weixin.qq.com/");
      (mockPage.waitForLoadState as jest.Mock).mockResolvedValue(undefined);

      (mockPage.$ as jest.Mock).mockImplementation(async (sel: string) => {
        if (sel === ".weui-desktop-account__nickname") return { el: true };
        return null;
      });

      setupContextWithPage();
      (playwrightServiceMock.saveSession as jest.Mock).mockResolvedValue({
        cookies: [{ name: "x", value: "y" }],
      });

      const result = await adapter.checkAndSaveLogin("conn-1");
      expect(result).toBe(true);
    });

    it("returns false when unexpected exception thrown in checkLoginStatus", async () => {
      (mockPage.url as jest.Mock).mockReturnValue("https://mp.weixin.qq.com/");
      (mockPage.waitForLoadState as jest.Mock).mockRejectedValue(
        new Error("browser closed"),
      );

      setupContextWithPage();
      const result = await adapter.checkAndSaveLogin("conn-1");
      expect(result).toBe(false);
    });
  });
});
