/**
 * FileConversionTool Unit Tests
 */

import {
  FileConversionTool,
  FileConversionInput,
} from "../file-conversion.tool";
import { ExportOrchestratorService } from "../../../../../../common/export";
import { ToolContext } from "../../../abstractions/tool.interface";

// ============================================================================
// Mock setup
// ============================================================================

interface ExportJob {
  jobId: string;
  status: string;
  error?: string;
}

interface ExportFile {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}

const mockExportOrchestrator = {
  createExportJob: jest.fn() as jest.MockedFunction<
    (userId: string, options: unknown) => Promise<ExportJob>
  >,
  getJobStatus: jest.fn() as jest.MockedFunction<
    (jobId: string, userId: string) => Promise<ExportJob>
  >,
  getExportFile: jest.fn() as jest.MockedFunction<
    (jobId: string, userId: string) => Promise<ExportFile>
  >,
};

function createMockContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    executionId: "test-exec-id",
    toolId: "file-conversion",
    userId: "user-123",
    createdAt: new Date(),
    ...overrides,
  };
}

// ============================================================================
// Test suite
// ============================================================================

describe("FileConversionTool", () => {
  let tool: FileConversionTool;

  beforeEach(() => {
    jest.clearAllMocks();
    tool = new FileConversionTool(
      mockExportOrchestrator as unknown as ExportOrchestratorService,
    );
  });

  // --------------------------------------------------------------------------
  // Tool metadata
  // --------------------------------------------------------------------------

  describe("tool metadata", () => {
    it("should have correct id and category", () => {
      expect(tool.id).toBe("file-conversion");
      expect(tool.category).toBe("processing");
    });
  });

  // --------------------------------------------------------------------------
  // validateInput
  // --------------------------------------------------------------------------

  describe("validateInput", () => {
    it("should return true for valid markdown_to_html input", () => {
      const input: FileConversionInput = {
        sourceContent: "# Hello",
        sourceFormat: "markdown",
        targetFormat: "html",
      };
      expect(tool.validateInput(input)).toBe(true);
    });

    it("should return false when sourceContent is empty string", () => {
      const input: FileConversionInput = {
        sourceContent: "",
        sourceFormat: "markdown",
        targetFormat: "html",
      };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false when sourceContent is whitespace only", () => {
      const input: FileConversionInput = {
        sourceContent: "   ",
        sourceFormat: "markdown",
        targetFormat: "html",
      };
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false when sourceFormat is invalid", () => {
      const input = {
        sourceContent: "content",
        sourceFormat: "txt" as never,
        targetFormat: "html",
      } as FileConversionInput;
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false when targetFormat is invalid", () => {
      const input = {
        sourceContent: "content",
        sourceFormat: "markdown",
        targetFormat: "xml" as never,
      } as FileConversionInput;
      expect(tool.validateInput(input)).toBe(false);
    });

    it("should return false when source and target format are the same", () => {
      const input: FileConversionInput = {
        sourceContent: "content",
        sourceFormat: "html",
        targetFormat: "html",
      };
      expect(tool.validateInput(input)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // markdown_to_html
  // --------------------------------------------------------------------------

  describe("markdown to html conversion", () => {
    it("should convert markdown to HTML and return success", async () => {
      const input: FileConversionInput = {
        sourceContent: "# Title\n\nSome paragraph text.",
        sourceFormat: "markdown",
        targetFormat: "html",
        options: { title: "Test Doc" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(true);
      expect(result.data?.success).toBe(true);
      expect(result.data?.format).toBe("html");
      expect(result.data?.isBase64).toBe(false);
      expect(result.data?.mimeType).toBe("text/html");
      expect(result.data?.content).toContain("<!DOCTYPE html>");
    });

    it("should use default title 'Document' when title option is absent", async () => {
      const input: FileConversionInput = {
        sourceContent: "# Hello",
        sourceFormat: "markdown",
        targetFormat: "html",
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.filename).toBe("Document.html");
    });

    it("should convert heading syntax to h1/h2/h3 tags", async () => {
      const input: FileConversionInput = {
        sourceContent: "# H1\n## H2\n### H3",
        sourceFormat: "markdown",
        targetFormat: "html",
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.content).toContain("<h1>");
      expect(result.data?.content).toContain("<h2>");
      expect(result.data?.content).toContain("<h3>");
    });
  });

  // --------------------------------------------------------------------------
  // json_to_csv
  // --------------------------------------------------------------------------

  describe("json to csv conversion", () => {
    it("should convert JSON array to CSV", async () => {
      const data = [
        { name: "Alice", age: "30" },
        { name: "Bob", age: "25" },
      ];
      const input: FileConversionInput = {
        sourceContent: JSON.stringify(data),
        sourceFormat: "json",
        targetFormat: "csv",
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.success).toBe(true);
      expect(result.data?.format).toBe("csv");
      expect(result.data?.mimeType).toBe("text/csv");
      expect(result.data?.content).toContain("name");
      expect(result.data?.content).toContain("Alice");
    });

    it("should throw error for invalid JSON and return failure", async () => {
      const input: FileConversionInput = {
        sourceContent: "{ invalid json",
        sourceFormat: "json",
        targetFormat: "csv",
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      // BaseTool wraps doExecute throw in { success: false }
      expect(result.success).toBe(false);
      expect(result.error?.message).toContain("Invalid JSON");
    });
  });

  // --------------------------------------------------------------------------
  // csv_to_json
  // --------------------------------------------------------------------------

  describe("csv to json conversion", () => {
    it("should convert CSV to JSON array", async () => {
      const csv = "name,age\nAlice,30\nBob,25";
      const input: FileConversionInput = {
        sourceContent: csv,
        sourceFormat: "csv",
        targetFormat: "json",
        options: { jsonPretty: true },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.success).toBe(true);
      expect(result.data?.format).toBe("json");
      const parsed = JSON.parse(result.data?.content ?? "[]");
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed[0].name).toBe("Alice");
    });

    it("should handle CSV with custom delimiter", async () => {
      const csv = "name;age\nAlice;30\nBob;25";
      const input: FileConversionInput = {
        sourceContent: csv,
        sourceFormat: "csv",
        targetFormat: "json",
        options: { csvDelimiter: ";", jsonPretty: false },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.success).toBe(true);
      const parsed = JSON.parse(result.data?.content ?? "[]");
      expect(parsed[0].name).toBe("Alice");
    });
  });

  // --------------------------------------------------------------------------
  // markdown_to_json
  // --------------------------------------------------------------------------

  describe("markdown to json conversion", () => {
    it("should convert markdown to JSON structure", async () => {
      const input: FileConversionInput = {
        sourceContent: "# Section\n\nSome text here.\n- Item 1\n- Item 2",
        sourceFormat: "markdown",
        targetFormat: "json",
        options: { jsonPretty: true },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.success).toBe(true);
      expect(result.data?.format).toBe("json");
      expect(result.data?.mimeType).toBe("application/json");
      // Should be valid JSON
      expect(() => JSON.parse(result.data?.content ?? "")).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // markdown_to_docx (via export orchestrator)
  // --------------------------------------------------------------------------

  describe("markdown to docx conversion", () => {
    it("should return base64 DOCX content when export completes", async () => {
      mockExportOrchestrator.createExportJob.mockResolvedValueOnce({
        jobId: "job-001",
        status: "COMPLETED",
      });
      mockExportOrchestrator.getExportFile.mockResolvedValueOnce({
        buffer: Buffer.from("fake-docx-content"),
        fileName: "document.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const input: FileConversionInput = {
        sourceContent: "# Hello DOCX",
        sourceFormat: "markdown",
        targetFormat: "docx",
        options: { title: "Test Doc" },
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.data?.success).toBe(true);
      expect(result.data?.isBase64).toBe(true);
      expect(result.data?.format).toBe("docx");
      expect(result.data?.filename).toBe("document.docx");
    });

    it("should throw when export job fails", async () => {
      mockExportOrchestrator.createExportJob.mockResolvedValueOnce({
        jobId: "job-002",
        status: "FAILED",
        error: "Export engine error",
      });

      const input: FileConversionInput = {
        sourceContent: "# Failed export",
        sourceFormat: "markdown",
        targetFormat: "docx",
      };
      const context = createMockContext();
      const result = await tool.execute(input, context);

      expect(result.success).toBe(false);
    });
  });
});
