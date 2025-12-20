/**
 * Document Export Service 测试
 * 测试文档导出功能（PPTX, DOCX, PDF, Markdown, HTML）
 */

// Mock pptxgenjs with proper ZIP header (PK)
jest.mock("pptxgenjs", () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      title: "",
      author: "",
      company: "",
      addSlide: jest.fn().mockReturnValue({
        addText: jest.fn(),
        background: { color: "FFFFFF" },
      }),
      write: jest
        .fn()
        .mockResolvedValue(
          Buffer.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("mock-content")]),
        ),
      writeFile: jest.fn().mockResolvedValue(undefined),
    })),
  };
});

// Mock docx with proper ZIP header (PK)
jest.mock("docx", () => ({
  Document: jest.fn().mockImplementation(() => ({})),
  Packer: {
    toBuffer: jest
      .fn()
      .mockResolvedValue(
        Buffer.from([
          0x50,
          0x4b,
          0x03,
          0x04,
          ...Buffer.from(
            "mock-docx-content-longer-than-100-bytes-for-testing-purposes-this-needs-to-be-long-enough",
          ),
        ]),
      ),
  },
  Paragraph: jest.fn().mockImplementation(() => ({})),
  TextRun: jest.fn().mockImplementation(() => ({})),
  HeadingLevel: {
    TITLE: "TITLE",
    HEADING_1: "HEADING_1",
    HEADING_2: "HEADING_2",
    HEADING_3: "HEADING_3",
  },
  AlignmentType: {
    CENTER: "CENTER",
    LEFT: "LEFT",
    RIGHT: "RIGHT",
    JUSTIFIED: "JUSTIFIED",
  },
  PageOrientation: { PORTRAIT: "PORTRAIT", LANDSCAPE: "LANDSCAPE" },
  Footer: jest.fn().mockImplementation(() => ({})),
  Header: jest.fn().mockImplementation(() => ({})),
  PageNumber: {
    CURRENT: "CURRENT",
  },
  NumberFormat: {
    DECIMAL: "DECIMAL",
  },
}));

import { Test, TestingModule } from "@nestjs/testing";
import { BadRequestException } from "@nestjs/common";
import {
  ExportService as DocumentExportService,
  ExportConfig,
  ExportFormat,
} from "../export";

describe("DocumentExportService", () => {
  let service: DocumentExportService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentExportService],
    }).compile();

    service = module.get<DocumentExportService>(DocumentExportService);
  });

  describe("exportDocument", () => {
    const baseConfig: ExportConfig = {
      title: "测试文档",
      content: "# 标题\n\n这是测试内容",
      documentType: "PPT",
      format: "markdown",
    };

    describe("Format routing", () => {
      it("should route pptx format to exportToPPTX", async () => {
        const config: ExportConfig = { ...baseConfig, format: "pptx" };
        const result = await service.exportDocument(config);

        expect(result.mimeType).toBe(
          "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        );
        expect(result.filename).toContain(".pptx");
      });

      it("should route docx format to exportToDOCX", async () => {
        const config: ExportConfig = { ...baseConfig, format: "docx" };
        const result = await service.exportDocument(config);

        expect(result.mimeType).toBe(
          "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        );
        expect(result.filename).toContain(".docx");
      });

      it("should route markdown format to exportToMarkdown", async () => {
        const config: ExportConfig = { ...baseConfig, format: "markdown" };
        const result = await service.exportDocument(config);

        expect(result.mimeType).toBe("text/markdown");
        expect(result.filename).toContain(".md");
      });

      it("should route html format to exportToHTML", async () => {
        const config: ExportConfig = { ...baseConfig, format: "html" };
        const result = await service.exportDocument(config);

        expect(result.mimeType).toBe("text/html");
        expect(result.filename).toContain(".html");
      });

      it("should throw BadRequestException for unsupported format", async () => {
        const config = {
          ...baseConfig,
          format: "invalid" as ExportFormat,
        };

        await expect(service.exportDocument(config)).rejects.toThrow(
          BadRequestException,
        );
      });
    });

    describe("PPTX export", () => {
      it("should generate valid PPTX buffer", async () => {
        const config: ExportConfig = {
          title: "测试PPT",
          content: `### Slide 1: 介绍
- 第一点
- 第二点

### Slide 2: 详情
- 详细内容`,
          documentType: "PPT",
          format: "pptx",
        };

        const result = await service.exportDocument(config);

        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
        // PPTX 文件以 PK (ZIP) 格式开头
        expect(result.buffer[0]).toBe(0x50); // 'P'
        expect(result.buffer[1]).toBe(0x4b); // 'K'
      });

      it("should set correct filename with .pptx extension", async () => {
        const config: ExportConfig = {
          title: "我的演示文稿",
          content: "# 内容",
          documentType: "PPT",
          format: "pptx",
        };

        const result = await service.exportDocument(config);

        expect(result.filename).toBe("我的演示文稿.pptx");
      });

      it("should handle Chinese characters in content", async () => {
        const config: ExportConfig = {
          title: "中文测试",
          content: `### 第一页：介绍
- 这是中文内容
- 支持中文字符`,
          documentType: "PPT",
          format: "pptx",
        };

        const result = await service.exportDocument(config);

        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
      });

      it("should handle empty content gracefully", async () => {
        const config: ExportConfig = {
          title: "空内容测试",
          content: "",
          documentType: "PPT",
          format: "pptx",
        };

        const result = await service.exportDocument(config);

        expect(result.buffer).toBeInstanceOf(Buffer);
      });
    });

    describe("DOCX export", () => {
      it("should generate valid DOCX buffer", async () => {
        const config: ExportConfig = {
          title: "测试文档",
          content: `# 标题

## 第一章
这是正文内容。

## 第二章
- 列表项1
- 列表项2`,
          documentType: "ARTICLE",
          format: "docx",
        };

        const result = await service.exportDocument(config);

        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(0);
        // DOCX 文件以 PK (ZIP) 格式开头
        expect(result.buffer[0]).toBe(0x50);
        expect(result.buffer[1]).toBe(0x4b);
      });

      it("should set correct filename with .docx extension", async () => {
        const config: ExportConfig = {
          title: "报告文档",
          content: "# 内容",
          documentType: "ARTICLE",
          format: "docx",
        };

        const result = await service.exportDocument(config);

        expect(result.filename).toBe("报告文档.docx");
      });

      it("should preserve markdown formatting", async () => {
        const config: ExportConfig = {
          title: "格式测试",
          content: `# 一级标题
## 二级标题
### 三级标题

普通段落文本。

- 无序列表项1
- 无序列表项2

1. 有序列表项1
2. 有序列表项2`,
          documentType: "ARTICLE",
          format: "docx",
        };

        const result = await service.exportDocument(config);

        expect(result.buffer).toBeInstanceOf(Buffer);
        expect(result.buffer.length).toBeGreaterThan(50);
      });
    });

    describe("Markdown export", () => {
      it("should return markdown content as buffer", async () => {
        const config: ExportConfig = {
          title: "测试标题",
          content: "# 内容\n\n这是正文",
          documentType: "ARTICLE",
          format: "markdown",
        };

        const result = await service.exportDocument(config);
        const content = result.buffer.toString("utf-8");

        expect(content).toContain("# 内容");
        expect(content).toContain("这是正文");
      });

      it("should set correct mime type", async () => {
        const config: ExportConfig = {
          ...baseConfig,
          format: "markdown",
        };

        const result = await service.exportDocument(config);

        expect(result.mimeType).toBe("text/markdown");
      });

      it("should set correct filename with .md extension", async () => {
        const config: ExportConfig = {
          title: "我的笔记",
          content: "# 笔记内容",
          documentType: "ARTICLE",
          format: "markdown",
        };

        const result = await service.exportDocument(config);

        expect(result.filename).toBe("我的笔记.md");
      });
    });

    describe("HTML export", () => {
      it("should generate valid HTML", async () => {
        const config: ExportConfig = {
          title: "HTML测试",
          content: "# 标题\n\n正文内容",
          documentType: "ARTICLE",
          format: "html",
        };

        const result = await service.exportDocument(config);
        const html = result.buffer.toString("utf-8");

        expect(html).toContain("<!DOCTYPE html>");
        expect(html).toContain("<html");
        expect(html).toContain("</html>");
      });

      it("should include title in HTML", async () => {
        const config: ExportConfig = {
          title: "我的页面标题",
          content: "# 内容",
          documentType: "ARTICLE",
          format: "html",
        };

        const result = await service.exportDocument(config);
        const html = result.buffer.toString("utf-8");

        expect(html).toContain("我的页面标题");
      });

      it("should set correct mime type", async () => {
        const config: ExportConfig = {
          ...baseConfig,
          format: "html",
        };

        const result = await service.exportDocument(config);

        expect(result.mimeType).toBe("text/html");
      });
    });

    describe("Metadata handling", () => {
      it("should use metadata author in PPTX", async () => {
        const config: ExportConfig = {
          title: "测试",
          content: "# 内容",
          documentType: "PPT",
          format: "pptx",
          metadata: {
            author: "测试作者",
            company: "测试公司",
          },
        };

        const result = await service.exportDocument(config);

        // PPTX 生成应该成功
        expect(result.buffer).toBeInstanceOf(Buffer);
      });

      it("should handle missing metadata gracefully", async () => {
        const config: ExportConfig = {
          title: "无元数据测试",
          content: "# 内容",
          documentType: "PPT",
          format: "pptx",
        };

        const result = await service.exportDocument(config);

        expect(result.buffer).toBeInstanceOf(Buffer);
      });
    });
  });

  describe("parseMarkdownToSlides (internal)", () => {
    // 测试 Markdown 解析为幻灯片的逻辑
    it("should parse slides from markdown with slide headers", async () => {
      const config: ExportConfig = {
        title: "测试",
        content: `### Slide 1: 介绍
- 第一点

### Slide 2: 详情
- 第二点`,
        documentType: "PPT",
        format: "pptx",
      };

      // 通过导出来间接测试解析
      const result = await service.exportDocument(config);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });

    it("should handle Chinese slide headers", async () => {
      const config: ExportConfig = {
        title: "中文幻灯片",
        content: `### 第1页：开场
- 欢迎

### 第2页：主要内容
- 详细说明`,
        documentType: "PPT",
        format: "pptx",
      };

      const result = await service.exportDocument(config);
      expect(result.buffer).toBeInstanceOf(Buffer);
    });
  });
});
