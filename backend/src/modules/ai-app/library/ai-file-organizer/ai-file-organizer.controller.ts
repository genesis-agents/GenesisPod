import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  UseGuards,
  Req,
  Logger,
  BadRequestException,
} from "@nestjs/common";
import { Request } from "express";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import {
  AiFileOrganizerService,
  FileInfo,
  OrganizationSuggestion,
} from "./ai-file-organizer.service";

interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

interface AnalyzeFilesDto {
  files: FileInfo[];
}

interface ApplySuggestionDto {
  resourceId: string;
  suggestion: Partial<OrganizationSuggestion>;
}

@ApiTags("AI File Organizer")
@Controller("ai-organizer")
@ApiBearerAuth()
export class AiFileOrganizerController {
  private readonly logger = new Logger(AiFileOrganizerController.name);

  constructor(private readonly organizerService: AiFileOrganizerService) {}

  @Post("analyze")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "分析文件并生成整理建议" })
  @ApiResponse({ status: 200, description: "返回整理建议" })
  async analyzeFiles(
    @Req() _req: AuthenticatedRequest,
    @Body() dto: AnalyzeFilesDto,
  ) {
    this.logger.log(`Analyzing ${dto.files.length} files`);

    const result = await this.organizerService.batchAnalyze(dto.files);

    if (!result.success) {
      throw new BadRequestException(
        result.errors?.join("; ") || "Failed to analyze files",
      );
    }

    return {
      suggestions: result.suggestions,
      totalFiles: result.totalFiles,
      processedFiles: result.processedFiles,
      errors: result.errors,
    };
  }

  @Post("analyze-single")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "分析单个文件" })
  @ApiResponse({ status: 200, description: "返回单个文件的整理建议" })
  async analyzeSingleFile(
    @Req() _req: AuthenticatedRequest,
    @Body() file: FileInfo,
  ) {
    this.logger.log(`Analyzing single file: ${file.name}`);

    const suggestion = await this.organizerService.analyzeFile(file);

    return { suggestion };
  }

  @Post("apply")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "应用整理建议到资源" })
  @ApiResponse({ status: 200, description: "应用成功" })
  async applySuggestion(
    @Req() _req: AuthenticatedRequest,
    @Body() dto: ApplySuggestionDto,
  ) {
    await this.organizerService.applySuggestion(dto.resourceId, dto.suggestion);

    return { message: "Suggestion applied successfully" };
  }

  @Get("categories")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取现有分类列表" })
  @ApiResponse({ status: 200, description: "返回分类列表" })
  async getCategories() {
    const categories = await this.organizerService.getExistingCategories();
    return { categories };
  }

  @Get("tags")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "获取现有标签列表" })
  @ApiResponse({ status: 200, description: "返回标签列表" })
  async getTags() {
    const tags = await this.organizerService.getExistingTags();
    return { tags };
  }

  @Get("related/:fileId")
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: "查找相关文件" })
  @ApiResponse({ status: 200, description: "返回相关文件列表" })
  async findRelatedFiles(
    @Req() _req: AuthenticatedRequest,
    @Param("fileId") _fileId: string,
    @Body() file: FileInfo,
  ) {
    const relatedFiles = await this.organizerService.findRelatedFiles(file);
    return { relatedFiles };
  }
}
