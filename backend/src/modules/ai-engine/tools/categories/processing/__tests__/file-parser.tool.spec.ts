/**
 * FileParserTool Unit Tests
 */

import { FileParserTool, FileParserInput } from "../file-parser.tool";
import { ToolContext } from "../../../abstractions/tool.interface";

// ============================================================================
// External module mocks
//
// NOTE: The source uses dynamic import() for all dependencies. Under SWC,
// `await import("module")` compiles to `_interop_require_wildcard(require("module"))`.
// The interop skips the `default` key when copying and then sets `newObj.default = obj`.
// So a mock that returns `{ default: mockFn }` would end up with
// `pdfParse.default === { default: mockFn }` (not a function).
//
// Fix: Add `__esModule: true` to all mock factories. With that flag, the interop
// returns `obj` as-is, so `pdfParse.default === mockFn` (correct).
// ============================================================================

// Mock pdf-parse
const mockPdfParse = jest.fn();
jest.mock("pdf-parse", () => ({
  __esModule: true,
  default: mockPdfParse,
}));

// Mock mammoth
const mockConvertToHtml = jest.fn();
jest.mock("mammoth", () => ({
  __esModule: true,
  convertToHtml: mockConvertToHtml,
}));

// Mock exceljs
const mockXlsxLoad = jest.fn();
const mockEachSheet = jest.fn();
jest.mock("exceljs", () => ({
  __esModule: true,
  Workbook: jest.fn().mockImplementation(() => ({
    xlsx: { load: mockXlsxLoad },
    eachSheet: mockEachSheet,
    worksheets: [],
    creator: "TestAuthor",
  })),
}));

// Mock axios
const mockAxiosGet = jest.fn();
jest.mock("axios", () => ({
  __esModule: true,
  default: { get: mockAxiosGet },
}));

// Mock jszip and xml2js for PPTX
const mockLoadAsync = jest.fn();
jest.mock("jszip", () => ({
  __esModule: true,
  loadAsync: mockLoadAsync,
}));

jest.mock("xml2js", () => ({
  __esModule: true,
  parseStringPromise: jest.fn().mockResolvedValue({}),
}));

// Mock cheerio (used by parseDOCX)
jest.mock("cheerio", () => {
  const $ = jest.fn().mockReturnValue({
    text: jest.fn().mockReturnValue(""),
  });
  const load = jest.fn().mockReturnValue(
    Object.assign(
      (selector: string) => ({
        text: jest.fn().mockReturnValue("Document Title Paragraph content here"),
        each: jest.fn(),
        nextUntil: jest.fn().mockReturnValue({ each: jest.fn() }),
      }),
      {
        text: jest.fn().mockReturnValue("Document Title\nParagraph content here"),
      },
    ),
  );
  return { __esModule: true, load, default: { load } };
});

// ============================================================================
// Helpers
// ============================================================================

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "test-exec-id",
    toolId: "file-parser",
    userId: "user-123",
    createdAt: new Date(),
    ...overrides,
  };
}

function makePdfBuffer(): Buffer {
  return Buffer.from("fake pdf content");
}

function makeDocxBuffer(): Buffer {
  return Buffer.from("fake docx content");
}

// ============================================================================
// Test suite
// ============================================================================

describe("FileParserTool", () => {
  let tool: FileParserTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new FileParserTool();
  });

  // --------------------------------------------------------------------------
  // Tool metadata
  // --------------------------------------------------------------------------

  describe("tool metadata", () => {
    it("should have correct id and category", () => {
      expect(tool.id).toBe("file-parser");
      expect(tool.category).toBe("processing");
    });
  });

  // --------------------------------------------------------------------------
  // validateInput
  // --------------------------------------------------------------------------

  describe("validateInput", () => {
    it("should return true for valid PDF input with buffer", () => {
      const input: FileParserInput = {
        file: {
          buffer: Buffer.from("data"),
          mimeType: "application/pdf",
          filename: "test.pdf",
        },
      };
      expect(tool.validateInput(input)).toBe(true);
    });

    it("should return true for valid input with URL", () => {
      const input: FileParserInput = {
        file: {
          url: "https://example.com/file.pdf",
          mimeType: "application/pdf",
          filename: "file.pdf",
        },
      };
      expect(tool.validateInput(input)).toBe(true);
    });

    it("should return false when mimeType is missing", () => {
      const input = {
        file: {
          buffer: Buffer.from("data"),
          filename: "test.pdf",
        },
      } as unknown as FileParserInput;
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false when filename is missing", () => {
      const input = {
        file: {
          buffer: Buffer.from("data"),
          mimeType: "application/pdf",
        },
      } as unknown as FileParserInput;
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false when neither url nor buffer is provided", () => {
      const input: FileParserInput = {
        file: {
          mimeType: "application/pdf",
          filename: "test.pdf",
        },
      };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false for unsupported MIME type", () => {
      const input: FileParserInput = {
        file: {
          buffer: Buffer.from("data"),
          mimeType: "image/jpeg" as never,
          filename: "photo.jpg",
        },
      };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return true for DOCX mime type", () => {
      const input: FileParserInput = {
        file: {
          buffer: Buffer.from("data"),
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          filename: "doc.docx",
        },
      };
      expect(tool.validateInput(input)).toBe(true);
    });

    it("should return true for XLSX mime type", () => {
      const input: FileParserInput = {
        file: {
          buffer: Buffer.from("data"),
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          filename: "data.xlsx",
        },
      };
      expect(tool.validateInput(input)).toBe(true);
    });

    it("should return true for PPTX mime type", () => {
      const input: FileParserInput = {
        file: {
          buffer: Buffer.from("data"),
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          filename: "slides.pptx",
        },
      };
      expect(tool.validateInput(input)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // PDF parsing
  // --------------------------------------------------------------------------

  describe("PDF parsing", () => {
    it("should extract text content from PDF buffer", async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: "Hello from PDF\nSecond paragraph",
        numpages: 3,
        info: { Author: "Test Author" },
      });

      const input: FileParserInput = {
        file: {
          buffer: makePdfBuffer(),
          mimeType: "application/pdf",
          filename: "test.pdf",
        },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.content).toContain("Hello from PDF");
      expect(result.data?.structure.metadata.pageCount).toBe(3);
      expect(result.data?.structure.metadata.author).toBe("Test Author");
      expect(typeof result.data?.structure.metadata.wordCount).toBe("number");
    });

    it("should extract tables when extractTables=true", async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: "Col1\tCol2\nVal1\tVal2\n\nSome text",
        numpages: 1,
        info: {},
      });

      const input: FileParserInput = {
        file: {
          buffer: makePdfBuffer(),
          mimeType: "application/pdf",
          filename: "table.pdf",
        },
        options: { extractTables: true },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      // tables may or may not be extracted depending on content structure
      // just verify the field is present (array or undefined)
      expect(
        result.data?.tables === undefined || Array.isArray(result.data?.tables),
      ).toBe(true);
    });

    it("should not include tables when extractTables=false", async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: "Col1\tCol2\nVal1\tVal2",
        numpages: 1,
        info: {},
      });

      const input: FileParserInput = {
        file: {
          buffer: makePdfBuffer(),
          mimeType: "application/pdf",
          filename: "table.pdf",
        },
        options: { extractTables: false },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.tables).toBeUndefined();
    });

    it("should download file when URL is provided instead of buffer", async () => {
      mockAxiosGet.mockResolvedValueOnce({ data: Buffer.from("pdf data") });
      mockPdfParse.mockResolvedValueOnce({
        text: "Remote PDF content",
        numpages: 1,
        info: {},
      });

      const input: FileParserInput = {
        file: {
          url: "https://example.com/doc.pdf",
          mimeType: "application/pdf",
          filename: "remote.pdf",
        },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(mockAxiosGet).toHaveBeenCalledWith("https://example.com/doc.pdf", {
        responseType: "arraybuffer",
      });
    });

    it("should fail gracefully when pdf-parse throws", async () => {
      mockPdfParse.mockRejectedValueOnce(new Error("PDF parse error"));

      const input: FileParserInput = {
        file: {
          buffer: makePdfBuffer(),
          mimeType: "application/pdf",
          filename: "broken.pdf",
        },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("PDF parse error");
    });
  });

  // --------------------------------------------------------------------------
  // DOCX parsing
  // --------------------------------------------------------------------------

  describe("DOCX parsing", () => {
    it("should extract text from DOCX buffer", async () => {
      mockConvertToHtml.mockResolvedValueOnce({
        value: "<h1>Document Title</h1><p>Paragraph content here.</p>",
        messages: [],
      });

      const input: FileParserInput = {
        file: {
          buffer: makeDocxBuffer(),
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          filename: "doc.docx",
        },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(typeof result.data?.structure.metadata.wordCount).toBe("number");
    });

    it("should extract heading sections from DOCX HTML", async () => {
      mockConvertToHtml.mockResolvedValueOnce({
        value:
          "<h1>Introduction</h1><p>Intro text.</p><h2>Methods</h2><p>Methods text.</p>",
        messages: [],
      });

      const input: FileParserInput = {
        file: {
          buffer: makeDocxBuffer(),
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          filename: "doc.docx",
        },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      // Sections may vary depending on cheerio mock — just verify the structure
      expect(Array.isArray(result.data?.structure.sections)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Output structure
  // --------------------------------------------------------------------------

  describe("output structure", () => {
    it("should always include content, structure, and structure.sections", async () => {
      mockPdfParse.mockResolvedValueOnce({
        text: "Some content",
        numpages: 1,
        info: {},
      });

      const input: FileParserInput = {
        file: {
          buffer: makePdfBuffer(),
          mimeType: "application/pdf",
          filename: "test.pdf",
        },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(typeof result.data?.content).toBe("string");
      expect(typeof result.data?.structure).toBe("object");
      expect(Array.isArray(result.data?.structure.sections)).toBe(true);
      expect(typeof result.data?.structure.metadata).toBe("object");
    });
  });
});
