/**
 * File Conversion Tool Tests
 */

import { Test, TestingModule } from "@nestjs/testing";
import { FileConversionTool } from "../file-conversion.tool";
import { ExportService as DocumentExportService } from "../../../../ai-office/export";

describe("FileConversionTool", () => {
  let tool: FileConversionTool;
  let mockExportService: jest.Mocked<DocumentExportService>;

  beforeEach(async () => {
    // 创建 mock 服务
    mockExportService = {
      exportDocument: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FileConversionTool,
        {
          provide: DocumentExportService,
          useValue: mockExportService,
        },
      ],
    }).compile();

    tool = module.get<FileConversionTool>(FileConversionTool);
  });

  describe("基本属性", () => {
    it("should have correct tool type", () => {
      expect(tool.type).toBe("file_conversion");
    });

    it("should have correct name", () => {
      expect(tool.name).toBe("文件格式转换");
    });

    it("should have input and output schemas", () => {
      expect(tool.inputSchema).toBeDefined();
      expect(tool.outputSchema).toBeDefined();
    });
  });

  describe("输入验证", () => {
    it("should validate correct input", () => {
      const validInput = {
        sourceContent: "# Hello World",
        sourceFormat: "markdown" as const,
        targetFormat: "html" as const,
      };
      expect(tool.validateInput(validInput)).toBe(true);
    });

    it("should reject empty content", () => {
      const invalidInput = {
        sourceContent: "",
        sourceFormat: "markdown" as const,
        targetFormat: "html" as const,
      };
      expect(tool.validateInput(invalidInput)).toBe(false);
    });

    it("should reject same source and target format", () => {
      const invalidInput = {
        sourceContent: "test",
        sourceFormat: "json" as const,
        targetFormat: "json" as const,
      };
      expect(tool.validateInput(invalidInput)).toBe(false);
    });

    it("should reject invalid source format", () => {
      const invalidInput = {
        sourceContent: "test",
        sourceFormat: "invalid" as any,
        targetFormat: "html" as const,
      };
      expect(tool.validateInput(invalidInput)).toBe(false);
    });
  });

  describe("Markdown to HTML 转换", () => {
    it("should convert markdown to HTML", async () => {
      const input = {
        sourceContent: "# Hello\n\nThis is **bold** text.",
        sourceFormat: "markdown" as const,
        targetFormat: "html" as const,
        options: { title: "Test Document" },
      };

      const result = await tool.execute(input, { taskId: "test-1" });

      expect(result.success).toBe(true);
      expect(result.data?.content).toContain("<h1>Hello</h1>");
      expect(result.data?.content).toContain("<strong>bold</strong>");
      expect(result.data?.format).toBe("html");
      expect(result.data?.isBase64).toBe(false);
    });
  });

  describe("JSON to CSV 转换", () => {
    it("should convert JSON array to CSV", async () => {
      const jsonData = [
        { name: "Alice", age: 30 },
        { name: "Bob", age: 25 },
      ];
      const input = {
        sourceContent: JSON.stringify(jsonData),
        sourceFormat: "json" as const,
        targetFormat: "csv" as const,
      };

      const result = await tool.execute(input, { taskId: "test-2" });

      expect(result.success).toBe(true);
      expect(result.data?.content).toContain("name,age");
      expect(result.data?.content).toContain("Alice,30");
      expect(result.data?.content).toContain("Bob,25");
      expect(result.data?.format).toBe("csv");
    });
  });

  describe("CSV to JSON 转换", () => {
    it("should convert CSV to JSON", async () => {
      const csvContent = "name,age\nAlice,30\nBob,25";
      const input = {
        sourceContent: csvContent,
        sourceFormat: "csv" as const,
        targetFormat: "json" as const,
        options: { jsonPretty: true },
      };

      const result = await tool.execute(input, { taskId: "test-3" });

      expect(result.success).toBe(true);
      const parsed = JSON.parse(result.data?.content || "[]");
      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ name: "Alice", age: "30" });
      expect(parsed[1]).toEqual({ name: "Bob", age: "25" });
    });
  });

  describe("Markdown to DOCX 转换", () => {
    it("should call export service for DOCX conversion", async () => {
      mockExportService.exportDocument.mockResolvedValue({
        buffer: Buffer.from("mock docx content"),
        filename: "test.docx",
        mimeType:
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });

      const input = {
        sourceContent: "# Test Document\n\nContent here.",
        sourceFormat: "markdown" as const,
        targetFormat: "docx" as const,
        options: { title: "Test", author: "Tester" },
      };

      const result = await tool.execute(input, { taskId: "test-4" });

      expect(result.success).toBe(true);
      expect(result.data?.isBase64).toBe(true);
      expect(result.data?.format).toBe("docx");
      expect(mockExportService.exportDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          format: "docx",
          documentType: "REPORT",
          title: "Test",
        }),
      );
    });
  });

  describe("错误处理", () => {
    it("should handle invalid JSON gracefully", async () => {
      const input = {
        sourceContent: "{ invalid json",
        sourceFormat: "json" as const,
        targetFormat: "csv" as const,
      };

      const result = await tool.execute(input, { taskId: "test-5" });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should handle export service errors", async () => {
      mockExportService.exportDocument.mockRejectedValue(
        new Error("Export failed"),
      );

      const input = {
        sourceContent: "# Test",
        sourceFormat: "markdown" as const,
        targetFormat: "pdf" as const,
      };

      const result = await tool.execute(input, { taskId: "test-6" });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Export failed");
    });
  });
});
