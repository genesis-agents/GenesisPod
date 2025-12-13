import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import { OfficeDocumentService } from "./office-document.service";
import {
  CreateDocumentDto,
  UpdateDocumentDto,
  ListDocumentsQueryDto,
  CreateVersionDto,
  CompareVersionsDto,
  AddResourceRefDto,
  AddResourceRefsDto,
} from "./office-document.dto";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";

@Controller("ai-office/documents")
@UseGuards(JwtAuthGuard)
export class OfficeDocumentController {
  constructor(private readonly documentService: OfficeDocumentService) {}

  // ==========================================================================
  // Document CRUD
  // ==========================================================================

  /**
   * 创建新文档
   * POST /ai-office/documents
   */
  @Post()
  async createDocument(@Request() req: any, @Body() dto: CreateDocumentDto) {
    return this.documentService.createDocument(req.user.id, dto);
  }

  /**
   * 获取文档详情
   * GET /ai-office/documents/:id
   */
  @Get(":id")
  async getDocument(@Request() req: any, @Param("id") id: string) {
    return this.documentService.getDocument(id, req.user.id);
  }

  /**
   * 获取用户文档列表
   * GET /ai-office/documents
   */
  @Get()
  async listDocuments(
    @Request() req: any,
    @Query() query: ListDocumentsQueryDto,
  ) {
    return this.documentService.listDocuments(req.user.id, {
      type: query.type,
      status: query.status,
      workspaceId: query.workspaceId,
      limit: query.limit,
      offset: query.offset,
    });
  }

  /**
   * 更新文档
   * PUT /ai-office/documents/:id
   */
  @Put(":id")
  async updateDocument(
    @Request() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateDocumentDto,
    @Query("autoSaveVersion") autoSaveVersion?: string,
  ) {
    const shouldAutoSave = autoSaveVersion !== "false";
    return this.documentService.updateDocument(
      id,
      req.user.id,
      dto,
      shouldAutoSave,
    );
  }

  /**
   * 删除文档
   * DELETE /ai-office/documents/:id
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteDocument(@Request() req: any, @Param("id") id: string) {
    await this.documentService.deleteDocument(id, req.user.id);
  }

  // ==========================================================================
  // Version Management (Genspark 风格)
  // ==========================================================================

  /**
   * 创建新版本 (手动保存点)
   * POST /ai-office/documents/:id/versions
   */
  @Post(":id/versions")
  async createVersion(
    @Request() req: any,
    @Param("id") documentId: string,
    @Body() dto: CreateVersionDto,
  ) {
    return this.documentService.createVersion(documentId, req.user.id, dto);
  }

  /**
   * 获取文档所有版本
   * GET /ai-office/documents/:id/versions
   */
  @Get(":id/versions")
  async getVersions(@Request() req: any, @Param("id") documentId: string) {
    return this.documentService.getVersions(documentId, req.user.id);
  }

  /**
   * 获取特定版本详情
   * GET /ai-office/documents/:id/versions/:versionId
   */
  @Get(":id/versions/:versionId")
  async getVersion(
    @Request() req: any,
    @Param("id") documentId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.documentService.getVersion(documentId, versionId, req.user.id);
  }

  /**
   * 恢复到特定版本
   * POST /ai-office/documents/:id/versions/:versionId/restore
   */
  @Post(":id/versions/:versionId/restore")
  async restoreVersion(
    @Request() req: any,
    @Param("id") documentId: string,
    @Param("versionId") versionId: string,
  ) {
    return this.documentService.restoreVersion(
      documentId,
      versionId,
      req.user.id,
    );
  }

  /**
   * 对比两个版本
   * POST /ai-office/documents/:id/versions/compare
   */
  @Post(":id/versions/compare")
  async compareVersions(
    @Request() req: any,
    @Param("id") documentId: string,
    @Body() dto: CompareVersionsDto,
  ) {
    return this.documentService.compareVersions(
      documentId,
      dto.version1Id,
      dto.version2Id,
      req.user.id,
    );
  }

  // ==========================================================================
  // Resource References (@ 引用系统)
  // ==========================================================================

  /**
   * 获取文档的所有资源引用
   * GET /ai-office/documents/:id/resources
   */
  @Get(":id/resources")
  async getResourceRefs(@Request() req: any, @Param("id") documentId: string) {
    return this.documentService.getResourceRefs(documentId, req.user.id);
  }

  /**
   * 添加单个资源引用
   * POST /ai-office/documents/:id/resources
   */
  @Post(":id/resources")
  async addResourceRef(
    @Request() req: any,
    @Param("id") documentId: string,
    @Body() dto: AddResourceRefDto,
  ) {
    return this.documentService.addResourceRef(documentId, req.user.id, dto);
  }

  /**
   * 批量添加资源引用
   * POST /ai-office/documents/:id/resources/batch
   */
  @Post(":id/resources/batch")
  async addResourceRefsBatch(
    @Param("id") documentId: string,
    @Body() dto: AddResourceRefsDto,
  ) {
    return this.documentService.addResourceRefs(
      documentId,
      dto.resourceIds,
      dto.refType,
    );
  }

  /**
   * 移除资源引用
   * DELETE /ai-office/documents/:id/resources/:resourceId
   */
  @Delete(":id/resources/:resourceId")
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeResourceRef(
    @Request() req: any,
    @Param("id") documentId: string,
    @Param("resourceId") resourceId: string,
  ) {
    await this.documentService.removeResourceRef(
      documentId,
      resourceId,
      req.user.id,
    );
  }
}
