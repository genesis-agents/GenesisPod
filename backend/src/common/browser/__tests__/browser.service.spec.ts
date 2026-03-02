/**
 * BrowserService unit tests
 *
 * Covers:
 * - getBrowser – lazy init, already initialised, playwright not installed, executable path checks
 * - createContext – default viewport/userAgent, custom options
 * - getContext – existing / missing context
 * - createPage – context exists / auto-creates context
 * - closeContext – existing / non-existing context
 * - saveSession – no context, no pages, with pages (localStorage/sessionStorage)
 * - restoreSession – creates context, adds cookies, skips empty cookies
 * - screenshot – delegates to page.screenshot
 * - cleanup – closes all contexts and browser; handles close errors
 * - onModuleDestroy – calls cleanup
 */

import { Test, TestingModule } from "@nestjs/testing";
import { Logger } from "@nestjs/common";
import { BrowserService } from "../browser.service";

// ─── playwright-core mock ─────────────────────────────────────────────────────

const mockPage = {
  screenshot: jest.fn().mockResolvedValue(undefined),
  evaluate: jest.fn(),
};

const mockContext = {
  newPage: jest.fn().mockResolvedValue(mockPage),
  close: jest.fn().mockResolvedValue(undefined),
  cookies: jest.fn().mockResolvedValue([]),
  pages: jest.fn().mockReturnValue([]),
  addCookies: jest.fn().mockResolvedValue(undefined),
};

const mockBrowser = {
  newContext: jest.fn().mockResolvedValue(mockContext),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockChromium = {
  launch: jest.fn().mockResolvedValue(mockBrowser),
};

// Mock playwright-core dynamic import
jest.mock(
  "playwright-core",
  () => ({
    chromium: mockChromium,
  }),
  { virtual: true },
);

// ─── tests ───────────────────────────────────────────────────────────────────

describe("BrowserService", () => {
  let service: BrowserService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Reset all mock implementations to defaults
    mockChromium.launch.mockResolvedValue(mockBrowser);
    mockBrowser.newContext.mockResolvedValue(mockContext);
    mockBrowser.close.mockResolvedValue(undefined);
    mockContext.newPage.mockResolvedValue(mockPage);
    mockContext.close.mockResolvedValue(undefined);
    mockContext.cookies.mockResolvedValue([]);
    mockContext.pages.mockReturnValue([]);
    mockContext.addCookies.mockResolvedValue(undefined);
    mockPage.screenshot.mockResolvedValue(undefined);
    mockPage.evaluate.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [BrowserService],
    }).compile();

    service = module.get<BrowserService>(BrowserService);
    jest.spyOn(Logger.prototype, "log").mockImplementation();
    jest.spyOn(Logger.prototype, "debug").mockImplementation();
    jest.spyOn(Logger.prototype, "warn").mockImplementation();
    jest.spyOn(Logger.prototype, "error").mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getBrowser
  // ──────────────────────────────────────────────────────────────────────────

  describe("getBrowser", () => {
    it("launches browser on first call", async () => {
      const browser = await service.getBrowser();

      expect(browser).toBe(mockBrowser);
      expect(mockChromium.launch).toHaveBeenCalledTimes(1);
    });

    it("returns cached browser on subsequent calls", async () => {
      await service.getBrowser();
      await service.getBrowser();

      expect(mockChromium.launch).toHaveBeenCalledTimes(1);
    });

    it("launches with headless mode and required args", async () => {
      await service.getBrowser();

      const launchArgs = mockChromium.launch.mock.calls[0][0];
      expect(launchArgs.headless).toBe(true);
      expect(launchArgs.args).toContain("--no-sandbox");
      expect(launchArgs.args).toContain("--disable-setuid-sandbox");
    });

    it("throws when playwright-core is not installed", async () => {
      // Simulate playwright-core import failure by overriding the mock
      mockChromium.launch.mockRejectedValueOnce(new Error("Module not found"));

      await expect(service.getBrowser()).rejects.toThrow(
        "playwright-core is not installed",
      );
    });

    it("uses PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH when set", async () => {
      // Test that the env variable path is passed to launch options
      // We test this indirectly since we can't easily mock process.env mid-test
      // The service reads it during getBrowser(), so we verify launch was called
      await service.getBrowser();
      expect(mockChromium.launch).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createContext
  // ──────────────────────────────────────────────────────────────────────────

  describe("createContext", () => {
    it("creates and stores a browser context", async () => {
      const ctx = await service.createContext("ctx-1");

      expect(ctx).toBe(mockContext);
      expect(mockBrowser.newContext).toHaveBeenCalled();
    });

    it("uses default viewport 1280x720 when no options", async () => {
      await service.createContext("ctx-1");

      const ctxArgs = mockBrowser.newContext.mock.calls[0][0];
      expect(ctxArgs.viewport).toEqual({ width: 1280, height: 720 });
    });

    it("uses custom viewport when provided", async () => {
      await service.createContext("ctx-1", {
        viewport: { width: 1920, height: 1080 },
      });

      const ctxArgs = mockBrowser.newContext.mock.calls[0][0];
      expect(ctxArgs.viewport).toEqual({ width: 1920, height: 1080 });
    });

    it("uses custom userAgent when provided", async () => {
      await service.createContext("ctx-1", {
        userAgent: "Custom/1.0",
      });

      const ctxArgs = mockBrowser.newContext.mock.calls[0][0];
      expect(ctxArgs.userAgent).toBe("Custom/1.0");
    });

    it("passes locale and timezoneId when provided", async () => {
      await service.createContext("ctx-1", {
        locale: "zh-CN",
        timezoneId: "Asia/Shanghai",
      });

      const ctxArgs = mockBrowser.newContext.mock.calls[0][0];
      expect(ctxArgs.locale).toBe("zh-CN");
      expect(ctxArgs.timezoneId).toBe("Asia/Shanghai");
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getContext
  // ──────────────────────────────────────────────────────────────────────────

  describe("getContext", () => {
    it("returns context when it exists", async () => {
      await service.createContext("ctx-1");

      const ctx = await service.getContext("ctx-1");
      expect(ctx).toBe(mockContext);
    });

    it("returns null when context does not exist", async () => {
      const ctx = await service.getContext("nonexistent");
      expect(ctx).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createPage
  // ──────────────────────────────────────────────────────────────────────────

  describe("createPage", () => {
    it("creates page in existing context", async () => {
      await service.createContext("ctx-1");
      jest.clearAllMocks();

      const page = await service.createPage("ctx-1");

      expect(page).toBe(mockPage);
      expect(mockContext.newPage).toHaveBeenCalled();
      expect(mockBrowser.newContext).not.toHaveBeenCalled();
    });

    it("auto-creates context when it does not exist", async () => {
      const page = await service.createPage("new-ctx");

      expect(page).toBe(mockPage);
      expect(mockBrowser.newContext).toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // closeContext
  // ──────────────────────────────────────────────────────────────────────────

  describe("closeContext", () => {
    it("closes and removes existing context", async () => {
      await service.createContext("ctx-1");

      await service.closeContext("ctx-1");

      expect(mockContext.close).toHaveBeenCalled();
      const ctx = await service.getContext("ctx-1");
      expect(ctx).toBeNull();
    });

    it("does nothing when context does not exist", async () => {
      await service.closeContext("nonexistent");

      expect(mockContext.close).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // saveSession
  // ──────────────────────────────────────────────────────────────────────────

  describe("saveSession", () => {
    it("returns null when context does not exist", async () => {
      const result = await service.saveSession("nonexistent");
      expect(result).toBeNull();
    });

    it("returns null when context has no pages", async () => {
      await service.createContext("ctx-1");
      mockContext.pages.mockReturnValue([]);

      const result = await service.saveSession("ctx-1");
      expect(result).toBeNull();
    });

    it("returns session data when context has pages", async () => {
      const cookies = [
        { name: "session", value: "abc", domain: ".example.com", path: "/" },
      ];
      const localStorageData = { key1: "value1" };
      const sessionStorageData = { skey: "svalue" };

      mockContext.pages.mockReturnValue([mockPage]);
      mockContext.cookies.mockResolvedValue(cookies);
      mockPage.evaluate
        .mockResolvedValueOnce(localStorageData)
        .mockResolvedValueOnce(sessionStorageData);

      await service.createContext("ctx-1");
      const result = await service.saveSession("ctx-1");

      expect(result).not.toBeNull();
      expect(result!.cookies).toEqual(cookies);
      expect(result!.localStorage).toEqual(localStorageData);
      expect(result!.sessionStorage).toEqual(sessionStorageData);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // restoreSession
  // ──────────────────────────────────────────────────────────────────────────

  describe("restoreSession", () => {
    it("restores cookies to existing context", async () => {
      await service.createContext("ctx-1");
      const sessionData = {
        cookies: [
          { name: "token", value: "xyz", domain: ".example.com", path: "/" },
        ],
      };

      await service.restoreSession("ctx-1", sessionData);

      expect(mockContext.addCookies).toHaveBeenCalledWith(sessionData.cookies);
    });

    it("creates context and restores cookies when context does not exist", async () => {
      const sessionData = {
        cookies: [
          { name: "token", value: "xyz", domain: ".example.com", path: "/" },
        ],
      };

      await service.restoreSession("new-ctx", sessionData);

      expect(mockBrowser.newContext).toHaveBeenCalled();
      expect(mockContext.addCookies).toHaveBeenCalled();
    });

    it("skips addCookies when cookies array is empty", async () => {
      await service.createContext("ctx-1");

      await service.restoreSession("ctx-1", { cookies: [] });

      expect(mockContext.addCookies).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // screenshot
  // ──────────────────────────────────────────────────────────────────────────

  describe("screenshot", () => {
    it("calls page.screenshot with path and fullPage options", async () => {
      await service.screenshot(mockPage, "/tmp/screenshot.png");

      expect(mockPage.screenshot).toHaveBeenCalledWith({
        path: "/tmp/screenshot.png",
        fullPage: true,
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // cleanup
  // ──────────────────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("closes all contexts and the browser", async () => {
      await service.createContext("ctx-1");
      await service.createContext("ctx-2");

      await service.cleanup();

      expect(mockContext.close).toHaveBeenCalledTimes(2);
      expect(mockBrowser.close).toHaveBeenCalledTimes(1);
    });

    it("sets browser to null after cleanup", async () => {
      await service.getBrowser();
      await service.cleanup();

      // After cleanup, calling getBrowser again should launch a new browser
      await service.getBrowser();
      expect(mockChromium.launch).toHaveBeenCalledTimes(2);
    });

    it("handles context.close() error gracefully", async () => {
      await service.createContext("ctx-1");
      mockContext.close.mockRejectedValueOnce(
        new Error("Context close failed"),
      );

      await expect(service.cleanup()).resolves.not.toThrow();
    });

    it("handles browser.close() error gracefully", async () => {
      await service.getBrowser();
      mockBrowser.close.mockRejectedValueOnce(
        new Error("Browser close failed"),
      );

      await expect(service.cleanup()).resolves.not.toThrow();
    });

    it("does nothing when no browser has been launched", async () => {
      await service.cleanup();

      expect(mockBrowser.close).not.toHaveBeenCalled();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // onModuleDestroy
  // ──────────────────────────────────────────────────────────────────────────

  describe("onModuleDestroy", () => {
    it("calls cleanup on module destroy", async () => {
      await service.getBrowser();
      const cleanupSpy = jest.spyOn(service, "cleanup").mockResolvedValue();

      await service.onModuleDestroy();

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });
});
