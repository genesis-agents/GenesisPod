import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  Res,
  Get,
  HttpStatus,
} from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../../common/guards/jwt-auth.guard";
import {
  DocumentExportService,
  ExportFormat,
  ExportConfig,
} from "./document-export.service";
import { OfficeDocumentService } from "./office-document.service";
import { IsIn, IsOptional, IsUUID, IsString } from "class-validator";
import {
  OFFICE_DOCUMENT_TYPES,
  OfficeDocumentType,
} from "./office-document.dto";

// ============================================================================
// DTOs
// ============================================================================

const EXPORT_FORMATS = [
  "pptx",
  "docx",
  "xlsx",
  "pdf",
  "markdown",
  "html",
] as const;

class ExportDocumentDto {
  @IsUUID()
  documentId: string = "";

  @IsIn(EXPORT_FORMATS)
  format: ExportFormat = "markdown";

  @IsOptional()
  @IsString()
  templateId?: string;
}

class ExportContentDto {
  @IsString()
  title: string = "";

  @IsIn(OFFICE_DOCUMENT_TYPES)
  documentType: OfficeDocumentType = "ARTICLE";

  @IsString()
  content: string = "";

  @IsIn(EXPORT_FORMATS)
  format: ExportFormat = "markdown";

  @IsOptional()
  @IsString()
  templateId?: string;
}

// ============================================================================
// Controller
// ============================================================================

@Controller("ai-office/export")
@UseGuards(JwtAuthGuard)
export class DocumentExportController {
  constructor(
    private readonly exportService: DocumentExportService,
    private readonly documentService: OfficeDocumentService,
  ) {}

  /**
   * 导出已保存的文档
   * POST /ai-office/export/document
   */
  @Post("document")
  async exportDocument(
    @Request() req: any,
    @Body() dto: ExportDocumentDto,
    @Res() res: Response,
  ) {
    // 获取文档内容
    const document = await this.documentService.getDocument(
      dto.documentId,
      req.user.id,
    );

    const config: ExportConfig = {
      format: dto.format,
      documentType: document.type as OfficeDocumentType,
      title: document.title,
      content: document.markdown || (document.content as any)?.markdown || "",
      templateId: dto.templateId,
      metadata: {
        author: req.user.name || req.user.email,
        slideCount: (document.metadata as any)?.slideCount,
        wordCount: (document.metadata as any)?.wordCount,
      },
    };

    const result = await this.exportService.exportDocument(config);

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    res.setHeader("Content-Length", result.buffer.length);

    res.status(HttpStatus.OK).send(result.buffer);
  }

  /**
   * 直接导出内容（不保存文档）
   * POST /ai-office/export/content
   */
  @Post("content")
  async exportContent(
    @Request() req: any,
    @Body() dto: ExportContentDto,
    @Res() res: Response,
  ) {
    const config: ExportConfig = {
      format: dto.format,
      documentType: dto.documentType,
      title: dto.title,
      content: dto.content,
      templateId: dto.templateId,
      metadata: {
        author: req.user?.name || req.user?.email || "AI Office",
      },
    };

    const result = await this.exportService.exportDocument(config);

    res.setHeader("Content-Type", result.mimeType);
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${encodeURIComponent(result.filename)}"`,
    );
    res.setHeader("Content-Length", result.buffer.length);

    res.status(HttpStatus.OK).send(result.buffer);
  }

  /**
   * 获取支持的导出格式
   * GET /ai-office/export/formats
   */
  @Get("formats")
  getSupportedFormats() {
    return {
      formats: [
        {
          id: "pptx",
          name: "PowerPoint",
          extension: ".pptx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
          supportedTypes: ["PPT", "PROPOSAL"],
        },
        {
          id: "docx",
          name: "Word 文档",
          extension: ".docx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          supportedTypes: ["ARTICLE", "REPORT", "RESEARCH", "PROPOSAL"],
        },
        {
          id: "xlsx",
          name: "Excel 表格",
          extension: ".xlsx",
          mimeType:
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          supportedTypes: ["SPREADSHEET"],
        },
        {
          id: "pdf",
          name: "PDF 文档",
          extension: ".pdf",
          mimeType: "application/pdf",
          supportedTypes: ["ARTICLE", "REPORT", "RESEARCH", "PPT", "PROPOSAL"],
        },
        {
          id: "markdown",
          name: "Markdown",
          extension: ".md",
          mimeType: "text/markdown",
          supportedTypes: [
            "ARTICLE",
            "REPORT",
            "RESEARCH",
            "PPT",
            "PROPOSAL",
            "SPREADSHEET",
          ],
        },
        {
          id: "html",
          name: "HTML 网页",
          extension: ".html",
          mimeType: "text/html",
          supportedTypes: ["ARTICLE", "REPORT", "RESEARCH", "PPT", "PROPOSAL"],
        },
      ],
    };
  }
}
