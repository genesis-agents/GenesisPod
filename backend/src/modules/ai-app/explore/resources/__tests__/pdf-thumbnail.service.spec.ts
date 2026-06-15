/**
 * PdfThumbnailService - Unit Tests
 *
 * Targets uncovered branches: ~78 lines, 11.36% coverage
 * Focus: thumbnailExists, deleteThumbnail, generateBatchThumbnails,
 *        generateThumbnail (already-exists branch and download-failed branch)
 */

import { Test, TestingModule } from "@nestjs/testing";
import { PdfThumbnailService } from "../pdf-thumbnail.service";
import { ObjectStorageService } from "../../../../platform/facade";
import * as fs from "fs/promises";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import axios from "axios";

// Mock heavy dependencies
jest.mock("fs/promises");
jest.mock("axios");
jest.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  getDocument: jest.fn(),
}));
jest.mock("@napi-rs/canvas", () => ({
  createCanvas: jest.fn().mockReturnValue({
    getContext: jest.fn().mockReturnValue({}),
    toBuffer: jest.fn().mockReturnValue(Buffer.from("png data")),
  }),
}));
jest.mock("sharp", () =>
  jest.fn().mockReturnValue({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from("jpeg data")),
  }),
);

const mockFs = fs as jest.Mocked<typeof fs>;
const mockAxios = axios as jest.Mocked<typeof axios>;
const mockGetDocument = pdfjsLib.getDocument as unknown as jest.Mock;

describe("PdfThumbnailService", () => {
  let service: PdfThumbnailService;
  let mockObjectStorage: {
    isEnabled: jest.Mock;
    uploadBuffer: jest.Mock;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    // Default: directory creation succeeds
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.access.mockResolvedValue(undefined);
    mockFs.unlink.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);

    // Default: object storage disabled → local fallback path
    mockObjectStorage = {
      isEnabled: jest.fn().mockReturnValue(false),
      uploadBuffer: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PdfThumbnailService,
        { provide: ObjectStorageService, useValue: mockObjectStorage },
      ],
    })
      .setLogger({
        log: jest.fn(),
        error: jest.fn(),
        warn: jest.fn(),
        debug: jest.fn(),
        verbose: jest.fn(),
      })
      .compile();

    service = module.get<PdfThumbnailService>(PdfThumbnailService);

    // Wait for async constructor work
    await new Promise((resolve) => setImmediate(resolve));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ============================================================
  // thumbnailExists
  // ============================================================

  describe("thumbnailExists", () => {
    it("should return true when thumbnail file exists", async () => {
      mockFs.access.mockResolvedValue(undefined);

      const result = await service.thumbnailExists("resource-1");

      expect(result).toBe(true);
    });

    it("should return false when thumbnail file does not exist", async () => {
      mockFs.access.mockRejectedValue(new Error("ENOENT"));

      const result = await service.thumbnailExists("resource-1");

      expect(result).toBe(false);
    });
  });

  // ============================================================
  // deleteThumbnail
  // ============================================================

  describe("deleteThumbnail", () => {
    it("should delete thumbnail file successfully", async () => {
      mockFs.unlink.mockResolvedValue(undefined);

      await service.deleteThumbnail("resource-1");

      expect(mockFs.unlink).toHaveBeenCalled();
      const calledPath = (mockFs.unlink as jest.Mock).mock
        .calls[0][0] as string;
      expect(calledPath).toContain("resource-1.jpg");
    });

    it("should not throw when delete fails (file not found)", async () => {
      mockFs.unlink.mockRejectedValue(new Error("ENOENT: file not found"));

      await expect(
        service.deleteThumbnail("non-existent"),
      ).resolves.not.toThrow();
    });
  });

  // ============================================================
  // generateThumbnail - successful render
  // ============================================================

  // Configures the pdfjs/canvas render chain to succeed for a one-page PDF.
  const setupSuccessfulRender = () => {
    // downloadPdf now validates PDF magic / content-type → mock a real-looking PDF response
    mockAxios.get.mockResolvedValue({
      data: Buffer.from("%PDF-1.4 fake pdf bytes"),
      headers: { "content-type": "application/pdf" },
    });
    const page = {
      getViewport: jest.fn().mockReturnValue({ width: 400, height: 566 }),
      render: jest.fn().mockReturnValue({ promise: Promise.resolve() }),
    };
    mockGetDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: jest.fn().mockResolvedValue(page),
      }),
    });
  };

  describe("generateThumbnail - object storage upload", () => {
    it("should upload to object storage and return the persistent URL", async () => {
      setupSuccessfulRender();
      mockObjectStorage.isEnabled.mockReturnValue(true);
      mockObjectStorage.uploadBuffer.mockResolvedValue({
        success: true,
        url: "https://r2.example/thumbnails/123-abc.jpg",
      });

      const result = await service.generateThumbnail(
        "http://example.com/test.pdf",
        "resource-r2",
      );

      expect(result).toBe("https://r2.example/thumbnails/123-abc.jpg");
      expect(mockObjectStorage.uploadBuffer).toHaveBeenCalledWith(
        expect.any(Buffer),
        "thumbnails",
        "resource-r2.jpg",
        "image/jpeg",
      );
      // Should not fall back to local write on successful upload
      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });

    it("should fall back to local file when object storage is disabled", async () => {
      setupSuccessfulRender();
      mockObjectStorage.isEnabled.mockReturnValue(false);

      const result = await service.generateThumbnail(
        "http://example.com/test.pdf",
        "resource-local",
      );

      expect(result).toBe("/thumbnails/resource-local.jpg");
      expect(mockObjectStorage.uploadBuffer).not.toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalled();
    });

    it("should fall back to local file when object storage upload fails", async () => {
      setupSuccessfulRender();
      mockObjectStorage.isEnabled.mockReturnValue(true);
      mockObjectStorage.uploadBuffer.mockResolvedValue({
        success: false,
        error: "upload boom",
      });

      const result = await service.generateThumbnail(
        "http://example.com/test.pdf",
        "resource-fallback",
      );

      expect(result).toBe("/thumbnails/resource-fallback.jpg");
      expect(mockFs.writeFile).toHaveBeenCalled();
    });
  });

  // ============================================================
  // generateThumbnail - download failure branch
  // ============================================================

  describe("generateThumbnail - download failure", () => {
    it("should return null when PDF download fails", async () => {
      // thumbnailExists returns false
      mockFs.access.mockRejectedValue(new Error("ENOENT"));
      // axios.get throws (simulates download failure)
      mockAxios.get.mockRejectedValue(new Error("Network error"));

      const result = await service.generateThumbnail(
        "http://example.com/broken.pdf",
        "resource-broken",
      );

      expect(result).toBeNull();
    });
  });

  // ============================================================
  // generateBatchThumbnails
  // ============================================================

  describe("generateBatchThumbnails", () => {
    it("should skip resources with existing thumbnails", async () => {
      mockFs.access.mockResolvedValue(undefined); // all thumbnails exist

      const resources = [
        { id: "r1", pdfUrl: "http://example.com/1.pdf" },
        { id: "r2", pdfUrl: "http://example.com/2.pdf" },
      ];

      const result = await service.generateBatchThumbnails(resources);

      expect(result.skipped).toBe(2);
      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(mockAxios.get).not.toHaveBeenCalled();
    });

    it("should count failures for resources that fail generation", async () => {
      // No thumbnails exist
      mockFs.access.mockRejectedValue(new Error("ENOENT"));
      // Download fails
      mockAxios.get.mockRejectedValue(new Error("Download error"));

      const resources = [{ id: "r1", pdfUrl: "http://example.com/1.pdf" }];

      const result = await service.generateBatchThumbnails(resources);

      expect(result.failed).toBe(1);
      expect(result.success).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it("should return correct stats for empty resources list", async () => {
      const result = await service.generateBatchThumbnails([]);

      expect(result.success).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.skipped).toBe(0);
    });

    it("should process mixed results correctly", async () => {
      // r1: thumbnail exists (skip), r2: download fails (failed)
      // Note: generateThumbnail internally calls thumbnailExists once more for r2,
      // so we need a third rejection for r2's internal check inside generateThumbnail.
      mockFs.access
        .mockResolvedValueOnce(undefined) // r1 outer check: exists → skip
        .mockRejectedValueOnce(new Error("ENOENT")) // r2 outer check: not exists → proceed
        .mockRejectedValueOnce(new Error("ENOENT")); // r2 inner check inside generateThumbnail: not exists
      mockAxios.get.mockRejectedValue(new Error("Download error"));

      const resources = [
        { id: "r1", pdfUrl: "http://example.com/1.pdf" },
        { id: "r2", pdfUrl: "http://example.com/2.pdf" },
      ];

      const result = await service.generateBatchThumbnails(resources);

      expect(result.skipped).toBe(1);
      expect(result.failed).toBe(1);
    });
  });
});
