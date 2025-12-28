import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { OfficeDocumentType } from "../documents";

// ============================================================================
// Types
// ============================================================================

export type ExportFormat =
  | "pptx"
  | "docx"
  | "xlsx"
  | "pdf"
  | "markdown"
  | "html";

export interface ExportConfig {
  format: ExportFormat;
  documentType: OfficeDocumentType;
  title: string;
  content: string; // Markdown 内容
  templateId?: string;
  metadata?: {
    author?: string;
    company?: string;
    slideCount?: number;
    wordCount?: number;
  };
}

export interface ExportResult {
  buffer: Buffer;
  filename: string;
  mimeType: string;
}

// ============================================================================
// Document Export Service
// 支持多种格式导出：PPTX, DOCX, XLSX, PDF, Markdown, HTML
// ============================================================================

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  /**
   * 导出文档
   */
  async exportDocument(config: ExportConfig): Promise<ExportResult> {
    this.logger.log(
      `[exportDocument] Exporting ${config.title} as ${config.format}`,
    );

    switch (config.format) {
      case "pptx":
        return this.exportToPPTX(config);
      case "docx":
        return this.exportToDOCX(config);
      case "xlsx":
        return this.exportToXLSX(config);
      case "pdf":
        return this.exportToPDF(config);
      case "markdown":
        return this.exportToMarkdown(config);
      case "html":
        return this.exportToHTML(config);
      default:
        throw new BadRequestException(`不支持的导出格式: ${config.format}`);
    }
  }

  // ==========================================================================
  // PPTX 导出 (使用 pptxgenjs)
  // ==========================================================================

  private async exportToPPTX(config: ExportConfig): Promise<ExportResult> {
    this.logger.log("[exportToPPTX] Starting PPTX generation");

    // 动态导入 pptxgenjs
    const PptxGenJS = (await import("pptxgenjs")).default;
    const pptx = new PptxGenJS();

    // 设置文档属性
    pptx.title = config.title;
    pptx.author = config.metadata?.author || "AI Reports";
    pptx.company = config.metadata?.company || "";
    pptx.subject = config.title;

    // 解析 Markdown 为幻灯片
    const slides = this.parseMarkdownToSlides(config.content);

    for (const slideData of slides) {
      const slide = pptx.addSlide();

      // 设置背景
      slide.background = { color: "FFFFFF" };

      // 添加标题
      if (slideData.title) {
        slide.addText(slideData.title, {
          x: 0.5,
          y: 0.3,
          w: 9,
          h: 0.8,
          fontSize: 28,
          bold: true,
          color: "1E3A5F",
          fontFace: "Microsoft YaHei",
        });
      }

      // 添加内容
      if (slideData.bullets && slideData.bullets.length > 0) {
        const bulletText = slideData.bullets.map((b) => ({
          text: b,
          options: { bullet: true, fontSize: 16, color: "333333" },
        }));

        slide.addText(bulletText, {
          x: 0.5,
          y: 1.3,
          w: 9,
          h: 4,
          fontFace: "Microsoft YaHei",
          valign: "top",
        });
      }

      // 添加可视化图表（如果有）
      if (slideData.chartType && slideData.chartData) {
        await this.addChartToSlide(
          slide,
          slideData.chartType,
          slideData.chartData,
        );
      }
    }

    // 生成文件
    const buffer = (await pptx.write({ outputType: "nodebuffer" })) as Buffer;

    return {
      buffer,
      filename: `${config.title}.pptx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    };
  }

  // ==========================================================================
  // DOCX 导出 (使用 docx)
  // ==========================================================================

  private async exportToDOCX(config: ExportConfig): Promise<ExportResult> {
    this.logger.log("[exportToDOCX] Starting DOCX generation");

    const docx = await import("docx");
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      HeadingLevel,
      AlignmentType,
    } = docx;

    // 解析 Markdown
    const sections = this.parseMarkdownToSections(config.content);

    const children: any[] = [];

    // 添加标题
    children.push(
      new Paragraph({
        text: config.title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
      }),
    );

    // 添加内容
    for (const section of sections) {
      if (section.type === "heading") {
        children.push(
          new Paragraph({
            text: section.content,
            heading:
              section.level === 1
                ? HeadingLevel.HEADING_1
                : section.level === 2
                  ? HeadingLevel.HEADING_2
                  : HeadingLevel.HEADING_3,
          }),
        );
      } else if (section.type === "paragraph") {
        children.push(
          new Paragraph({
            children: [
              new TextRun({
                text: section.content,
                size: 24, // 12pt
              }),
            ],
          }),
        );
      } else if (section.type === "bullet") {
        children.push(
          new Paragraph({
            text: section.content,
            bullet: { level: 0 },
          }),
        );
      }
    }

    const doc = new Document({
      sections: [
        {
          properties: {},
          children,
        },
      ],
    });

    const buffer = await Packer.toBuffer(doc);

    return {
      buffer: Buffer.from(buffer),
      filename: `${config.title}.docx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    };
  }

  // ==========================================================================
  // XLSX 导出 (使用 exceljs)
  // ==========================================================================

  private async exportToXLSX(config: ExportConfig): Promise<ExportResult> {
    this.logger.log("[exportToXLSX] Starting XLSX generation");

    const ExcelJS = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = config.metadata?.author || "AI Reports";
    workbook.created = new Date();

    const worksheet = workbook.addWorksheet(config.title.substring(0, 31)); // Excel 限制 31 字符

    // 解析表格数据
    const tableData = this.parseMarkdownToTable(config.content);

    // 添加表头
    if (tableData.headers.length > 0) {
      worksheet.addRow(tableData.headers);
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFE0E0E0" },
      };
    }

    // 添加数据行
    for (const row of tableData.rows) {
      worksheet.addRow(row);
    }

    // 自动调整列宽
    worksheet.columns.forEach((column: any) => {
      let maxLength = 0;
      column.eachCell?.({ includeEmpty: true }, (cell: any) => {
        const cellValue = cell.value ? String(cell.value) : "";
        maxLength = Math.max(maxLength, cellValue.length);
      });
      column.width = Math.min(50, Math.max(10, maxLength + 2));
    });

    const buffer = await workbook.xlsx.writeBuffer();

    return {
      buffer: Buffer.from(buffer),
      filename: `${config.title}.xlsx`,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  // ==========================================================================
  // PDF 导出
  // ==========================================================================

  private async exportToPDF(config: ExportConfig): Promise<ExportResult> {
    this.logger.log("[exportToPDF] Starting PDF generation");

    // 先转换为 HTML，然后使用 puppeteer 生成 PDF
    const html = this.markdownToHTML(config.content, config.title);

    const puppeteer = await import("puppeteer");
    const browser = await puppeteer.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: {
          top: "20mm",
          right: "15mm",
          bottom: "20mm",
          left: "15mm",
        },
      });

      return {
        buffer: Buffer.from(pdfBuffer),
        filename: `${config.title}.pdf`,
        mimeType: "application/pdf",
      };
    } finally {
      await browser.close();
    }
  }

  // ==========================================================================
  // Markdown 导出
  // ==========================================================================

  private async exportToMarkdown(config: ExportConfig): Promise<ExportResult> {
    const content = `# ${config.title}\n\n${config.content}`;

    return {
      buffer: Buffer.from(content, "utf-8"),
      filename: `${config.title}.md`,
      mimeType: "text/markdown",
    };
  }

  // ==========================================================================
  // HTML 导出
  // ==========================================================================

  private async exportToHTML(config: ExportConfig): Promise<ExportResult> {
    const html = this.markdownToHTML(config.content, config.title);

    return {
      buffer: Buffer.from(html, "utf-8"),
      filename: `${config.title}.html`,
      mimeType: "text/html",
    };
  }

  // ==========================================================================
  // Helper Methods
  // ==========================================================================

  /**
   * 解析 Markdown 为幻灯片结构
   */
  private parseMarkdownToSlides(markdown: string): Array<{
    title: string;
    bullets: string[];
    chartType?: string;
    chartData?: any;
  }> {
    const slides: Array<{
      title: string;
      bullets: string[];
      chartType?: string;
      chartData?: any;
    }> = [];

    // 按 --- 分割
    const slideTexts = markdown.split(/^---$/m);

    for (const slideText of slideTexts) {
      if (!slideText.trim()) continue;

      const lines = slideText.trim().split("\n");
      let title = "";
      const bullets: string[] = [];
      let chartType: string | undefined;
      let chartData: any;

      for (const line of lines) {
        // 标题
        const titleMatch = line.match(/^###?\s*(?:Slide\s*\d+:?\s*)?(.+)/);
        if (titleMatch) {
          title = titleMatch[1].trim();
          continue;
        }

        // 图表标记
        const chartMatch = line.match(/<!--\s*CHART:(\w+)\s*-->/);
        if (chartMatch) {
          chartType = chartMatch[1];
          continue;
        }

        // 流程图标记
        if (line.includes("<!-- FLOW -->")) {
          chartType = "flow";
          continue;
        }

        // 矩阵标记
        if (line.includes("<!-- MATRIX -->")) {
          chartType = "matrix";
          continue;
        }

        // 列表项
        const bulletMatch = line.match(/^[-*]\s*(.+)/);
        if (bulletMatch) {
          bullets.push(bulletMatch[1].replace(/\*\*/g, "").trim());
        }
      }

      if (title || bullets.length > 0) {
        slides.push({ title, bullets, chartType, chartData });
      }
    }

    return slides;
  }

  /**
   * 解析 Markdown 为文档节
   */
  private parseMarkdownToSections(markdown: string): Array<{
    type: "heading" | "paragraph" | "bullet";
    level?: number;
    content: string;
  }> {
    const sections: Array<{
      type: "heading" | "paragraph" | "bullet";
      level?: number;
      content: string;
    }> = [];

    const lines = markdown.split("\n");

    for (const line of lines) {
      // 跳过空行和分隔符
      if (!line.trim() || line.trim() === "---") continue;

      // 标题
      const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
      if (headingMatch) {
        sections.push({
          type: "heading",
          level: headingMatch[1].length,
          content: headingMatch[2].replace(/\*\*/g, ""),
        });
        continue;
      }

      // 列表项
      const bulletMatch = line.match(/^[-*]\s+(.+)/);
      if (bulletMatch) {
        sections.push({
          type: "bullet",
          content: bulletMatch[1].replace(/\*\*/g, ""),
        });
        continue;
      }

      // 普通段落
      if (line.trim()) {
        sections.push({
          type: "paragraph",
          content: line.replace(/\*\*/g, ""),
        });
      }
    }

    return sections;
  }

  /**
   * 解析 Markdown 为表格数据
   */
  private parseMarkdownToTable(markdown: string): {
    headers: string[];
    rows: string[][];
  } {
    const lines = markdown.split("\n").filter((l) => l.trim());
    const headers: string[] = [];
    const rows: string[][] = [];

    for (const line of lines) {
      // Markdown 表格行
      if (line.includes("|")) {
        const cells = line
          .split("|")
          .map((c) => c.trim())
          .filter((c) => c && !c.match(/^-+$/));
        if (cells.length > 0) {
          if (headers.length === 0) {
            headers.push(...cells);
          } else {
            rows.push(cells);
          }
        }
      }
      // 列表项转为单列表格
      else if (line.match(/^[-*]\s+/)) {
        const content = line.replace(/^[-*]\s+/, "").replace(/\*\*/g, "");
        if (headers.length === 0) {
          headers.push("内容");
        }
        rows.push([content]);
      }
    }

    // 如果没有解析到表格，创建默认结构
    if (headers.length === 0) {
      headers.push("项目", "说明");
      rows.push(["示例数据", "请在此编辑"]);
    }

    return { headers, rows };
  }

  /**
   * Markdown 转 HTML
   */
  private markdownToHTML(markdown: string, title: string): string {
    // 简单的 Markdown 转 HTML
    let html = markdown
      // 标题
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, "<h2>$1</h2>")
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      // 粗体
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      // 列表
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      // 分隔符
      .replace(/^---$/gm, "<hr>")
      // 段落
      .replace(/\n\n/g, "</p><p>");

    // 包裹列表
    html = html.replace(/(<li>.*?<\/li>)+/gs, (match) => `<ul>${match}</ul>`);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>
    body {
      font-family: 'Microsoft YaHei', 'PingFang SC', sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      line-height: 1.8;
      color: #333;
    }
    h1, h2, h3 { color: #1e3a5f; margin-top: 24px; }
    h1 { font-size: 2em; border-bottom: 2px solid #1e3a5f; padding-bottom: 10px; }
    h2 { font-size: 1.5em; }
    h3 { font-size: 1.2em; }
    ul { padding-left: 24px; }
    li { margin: 8px 0; }
    strong { color: #0891b2; }
    hr { border: none; border-top: 1px solid #e5e7eb; margin: 32px 0; }
    p { margin: 16px 0; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${html}</p>
</body>
</html>`;
  }

  /**
   * 添加图表到幻灯片（pptxgenjs）
   */
  private async addChartToSlide(
    slide: any,
    chartType: string,
    chartData: any,
  ): Promise<void> {
    this.logger.log(`[addChartToSlide] Adding ${chartType} chart`);

    const chartOptions = {
      x: 0.5,
      y: 1.5,
      w: 9,
      h: 4,
      showTitle: false,
      chartColors: ["0077C0", "00A4BD", "36B37E", "FF8B00", "6554C0"],
    };

    try {
      switch (chartType.toLowerCase()) {
        case "bar":
          slide.addChart("bar", chartData, {
            ...chartOptions,
            barDir: "bar",
            barGrouping: "clustered",
          });
          break;

        case "line":
          slide.addChart("line", chartData, {
            ...chartOptions,
            lineDataSymbol: "circle",
            lineDataSymbolSize: 8,
          });
          break;

        case "pie":
          slide.addChart("pie", chartData, {
            ...chartOptions,
            showPercent: true,
            showLegend: true,
            legendPos: "r",
          });
          break;

        case "doughnut":
          slide.addChart("doughnut", chartData, {
            ...chartOptions,
            showPercent: true,
            holeSize: 50,
          });
          break;

        case "area":
          slide.addChart("area", chartData, {
            ...chartOptions,
          });
          break;

        case "flow":
          // 流程图使用形状绘制
          this.addFlowDiagram(slide, chartData);
          break;

        case "matrix":
          // 矩阵图使用形状绘制
          this.addMatrixDiagram(slide, chartData);
          break;

        default:
          this.logger.warn(
            `[addChartToSlide] Unknown chart type: ${chartType}`,
          );
      }
    } catch (err) {
      this.logger.error(
        `[addChartToSlide] Failed to add chart: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 添加流程图到幻灯片
   */
  private addFlowDiagram(slide: any, data: any): void {
    const steps = data?.steps || ["步骤1", "步骤2", "步骤3"];
    const stepWidth = 2;
    const startX = 1;
    const y = 2.5;

    steps.forEach((step: string, index: number) => {
      const x = startX + index * (stepWidth + 0.5);

      // 添加步骤框
      slide.addShape("rect", {
        x,
        y,
        w: stepWidth,
        h: 1,
        fill: { color: "0077C0" },
        line: { type: "none" },
      });

      // 添加步骤文字
      slide.addText(step, {
        x,
        y,
        w: stepWidth,
        h: 1,
        fontSize: 14,
        color: "FFFFFF",
        align: "center",
        valign: "middle",
      });

      // 添加箭头（除了最后一个）
      if (index < steps.length - 1) {
        slide.addShape("rightArrow", {
          x: x + stepWidth + 0.1,
          y: y + 0.3,
          w: 0.3,
          h: 0.4,
          fill: { color: "333333" },
        });
      }
    });
  }

  /**
   * 添加矩阵图到幻灯片
   */
  private addMatrixDiagram(slide: any, data: any): void {
    const items = data?.items || [
      { label: "高优先", quadrant: 1 },
      { label: "中等", quadrant: 2 },
      { label: "低优先", quadrant: 3 },
      { label: "待定", quadrant: 4 },
    ];

    // 绘制矩阵背景
    const matrixX = 1.5;
    const matrixY = 1.5;
    const quadrantSize = 3.5;

    // 四个象限背景
    const colors = ["36B37E", "0077C0", "FF8B00", "6554C0"];
    [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ].forEach(([col, row], index) => {
      slide.addShape("rect", {
        x: matrixX + col * quadrantSize,
        y: matrixY + row * quadrantSize,
        w: quadrantSize,
        h: quadrantSize,
        fill: { color: colors[index], transparency: 70 },
        line: { color: "CCCCCC", width: 1 },
      });
    });

    // 添加项目到对应象限
    items.forEach((item: { label: string; quadrant: number }) => {
      const quadrant = item.quadrant || 1;
      const col = (quadrant - 1) % 2;
      const row = Math.floor((quadrant - 1) / 2);

      slide.addText(item.label, {
        x: matrixX + col * quadrantSize + 0.2,
        y: matrixY + row * quadrantSize + 0.2,
        w: quadrantSize - 0.4,
        h: 0.5,
        fontSize: 12,
        color: "333333",
      });
    });
  }
}
