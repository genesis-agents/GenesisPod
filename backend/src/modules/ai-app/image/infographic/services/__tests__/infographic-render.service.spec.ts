import { Test, TestingModule } from "@nestjs/testing";
import { InfographicRenderService } from "../infographic-render.service";

// All mock functions must be defined inside the factory (jest.mock is hoisted)
jest.mock("puppeteer", () => {
  const mockPageClose = jest.fn().mockResolvedValue(undefined);
  const mockPageScreenshot = jest.fn().mockResolvedValue("base64screenshot");
  const mockPageEvaluate = jest.fn().mockResolvedValue(undefined);
  const mockPageSetContent = jest.fn().mockResolvedValue(undefined);
  const mockPageSetViewport = jest.fn().mockResolvedValue(undefined);
  const mockBrowserClose = jest.fn().mockResolvedValue(undefined);
  const mockNewPage = jest.fn().mockResolvedValue({
    setViewport: mockPageSetViewport,
    setContent: mockPageSetContent,
    evaluate: mockPageEvaluate,
    screenshot: mockPageScreenshot,
    close: mockPageClose,
  });

  return {
    launch: jest.fn().mockResolvedValue({
      newPage: mockNewPage,
      close: mockBrowserClose,
    }),
  };
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const puppeteer = require("puppeteer");

describe("InfographicRenderService", () => {
  let service: InfographicRenderService;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Re-apply default mocks after clearAllMocks
    const mockBrowserInstance = {
      newPage: jest.fn().mockResolvedValue({
        setViewport: jest.fn().mockResolvedValue(undefined),
        setContent: jest.fn().mockResolvedValue(undefined),
        evaluate: jest.fn().mockResolvedValue(undefined),
        screenshot: jest.fn().mockResolvedValue("base64screenshot"),
        close: jest.fn().mockResolvedValue(undefined),
      }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    puppeteer.launch.mockResolvedValue(mockBrowserInstance);

    const module: TestingModule = await Test.createTestingModule({
      providers: [InfographicRenderService],
    }).compile();

    service = module.get<InfographicRenderService>(InfographicRenderService);
  });

  describe("cleanup", () => {
    it("should be a no-op when no browser has been launched", async () => {
      await expect(service.cleanup()).resolves.toBeUndefined();
      expect(puppeteer.launch).not.toHaveBeenCalled();
    });

    it("should close browser after renderToImage is called", async () => {
      await service.renderToImage("<html></html>", 1200, 800);
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);

      await service.cleanup();
      const browserInstance = await puppeteer.launch.mock.results[0].value;
      expect(browserInstance.close).toHaveBeenCalledTimes(1);
    });

    it("should allow cleanup to be called again after first cleanup without error", async () => {
      await service.renderToImage("<html></html>", 800, 600);
      await service.cleanup();
      // Second cleanup: browser is null → should be no-op
      await expect(service.cleanup()).resolves.toBeUndefined();
    });
  });

  describe("renderToImage", () => {
    it("should launch browser on first call", async () => {
      await service.renderToImage("<html></html>", 1200, 800);
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    });

    it("should reuse existing browser on subsequent calls", async () => {
      await service.renderToImage("<html></html>", 1200, 800);
      await service.renderToImage("<html></html>", 800, 600);
      expect(puppeteer.launch).toHaveBeenCalledTimes(1);
    });

    it("should open a new page for each render call", async () => {
      await service.renderToImage("<html></html>", 1200, 800);
      const browserInstance = await puppeteer.launch.mock.results[0].value;
      expect(browserInstance.newPage).toHaveBeenCalledTimes(1);
    });

    it("should set viewport with provided width and height at deviceScaleFactor 2", async () => {
      await service.renderToImage("<html></html>", 1200, 800);
      const browserInstance = await puppeteer.launch.mock.results[0].value;
      const page = await browserInstance.newPage.mock.results[0].value;
      expect(page.setViewport).toHaveBeenCalledWith({
        width: 1200,
        height: 800,
        deviceScaleFactor: 2,
      });
    });

    it("should set page content with the provided html", async () => {
      const html = "<html><body>Test</body></html>";
      await service.renderToImage(html, 1200, 800);
      const browserInstance = await puppeteer.launch.mock.results[0].value;
      const page = await browserInstance.newPage.mock.results[0].value;
      expect(page.setContent).toHaveBeenCalledWith(
        html,
        expect.objectContaining({
          waitUntil: "networkidle0",
          timeout: 30000,
        }),
      );
    });

    it("should take screenshot with clip at specified dimensions", async () => {
      await service.renderToImage("<html></html>", 1200, 800);
      const browserInstance = await puppeteer.launch.mock.results[0].value;
      const page = await browserInstance.newPage.mock.results[0].value;
      expect(page.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "png",
          encoding: "base64",
          clip: { x: 0, y: 0, width: 1200, height: 800 },
        }),
      );
    });

    it("should return data URL with base64 screenshot", async () => {
      const result = await service.renderToImage("<html></html>", 1200, 800);
      expect(result).toBe("data:image/png;base64,base64screenshot");
    });

    it("should close the page in finally block even when screenshot throws", async () => {
      const screenshotError = new Error("Screenshot error");
      const mockBrowserInstance = {
        newPage: jest.fn().mockResolvedValue({
          setViewport: jest.fn().mockResolvedValue(undefined),
          setContent: jest.fn().mockResolvedValue(undefined),
          evaluate: jest.fn().mockResolvedValue(undefined),
          screenshot: jest.fn().mockRejectedValue(screenshotError),
          close: jest.fn().mockResolvedValue(undefined),
        }),
        close: jest.fn().mockResolvedValue(undefined),
      };
      puppeteer.launch.mockResolvedValue(mockBrowserInstance);

      await expect(
        service.renderToImage("<html></html>", 1200, 800),
      ).rejects.toThrow("Screenshot error");

      const page = await mockBrowserInstance.newPage.mock.results[0].value;
      expect(page.close).toHaveBeenCalledTimes(1);
    });

    it("should use default dimensions of 1200x800 when not provided", async () => {
      await service.renderToImage("<html></html>");
      const browserInstance = await puppeteer.launch.mock.results[0].value;
      const page = await browserInstance.newPage.mock.results[0].value;
      expect(page.setViewport).toHaveBeenCalledWith(
        expect.objectContaining({ width: 1200, height: 800 }),
      );
    });

    it("should pass custom dimensions to screenshot clip", async () => {
      await service.renderToImage("<html></html>", 960, 540);
      const browserInstance = await puppeteer.launch.mock.results[0].value;
      const page = await browserInstance.newPage.mock.results[0].value;
      expect(page.screenshot).toHaveBeenCalledWith(
        expect.objectContaining({
          clip: { x: 0, y: 0, width: 960, height: 540 },
        }),
      );
    });
  });
});
