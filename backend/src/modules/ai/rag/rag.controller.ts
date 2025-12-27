/**
 * RAG Controller
 * Exposes REST API for knowledge base management and RAG queries
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { KnowledgeBaseService } from "./services/knowledge-base.service";
import { RAGPipelineService } from "./services/rag-pipeline.service";
import { GoogleDriveRAGService } from "./services/google-drive-rag.service";
import { EmbeddingService } from "./services/embedding.service";
import {
  CreateKnowledgeBaseDto,
  UpdateKnowledgeBaseDto,
  AddDocumentDto,
  RAGQueryDto,
  SimpleQueryDto,
  AddResourcesDto,
} from "./dto";

@ApiTags("RAG")
@Controller("rag")
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class RAGController {
  constructor(
    private readonly knowledgeBaseService: KnowledgeBaseService,
    private readonly ragPipelineService: RAGPipelineService,
    private readonly googleDriveRAGService: GoogleDriveRAGService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  // ==================== Embedding Configuration ====================

  @Get("embedding-config")
  @ApiOperation({ summary: "Get current embedding model configuration" })
  @ApiResponse({ status: 200, description: "Embedding configuration" })
  async getEmbeddingConfig() {
    return this.embeddingService.getConfigInfo();
  }

  // ==================== Knowledge Base CRUD ====================

  @Post("knowledge-bases")
  @ApiOperation({ summary: "Create a new knowledge base" })
  @ApiResponse({ status: 201, description: "Knowledge base created" })
  async createKnowledgeBase(
    @Req() req: any,
    @Body() dto: CreateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.create(req.user.id, dto);
  }

  @Get("knowledge-bases")
  @ApiOperation({ summary: "List all knowledge bases for current user" })
  @ApiResponse({ status: 200, description: "List of knowledge bases" })
  async listKnowledgeBases(@Req() req: any) {
    return this.knowledgeBaseService.findByUser(req.user.id);
  }

  @Get("knowledge-bases/:id")
  @ApiOperation({ summary: "Get knowledge base by ID" })
  @ApiResponse({ status: 200, description: "Knowledge base details" })
  async getKnowledgeBase(@Req() req: any, @Param("id") id: string) {
    return this.knowledgeBaseService.findById(id, req.user.id);
  }

  @Get("knowledge-bases/:id/stats")
  @ApiOperation({ summary: "Get knowledge base statistics" })
  @ApiResponse({ status: 200, description: "Knowledge base statistics" })
  async getKnowledgeBaseStats(@Req() req: any, @Param("id") id: string) {
    // Verify ownership
    await this.knowledgeBaseService.findById(id, req.user.id);
    return this.knowledgeBaseService.getStats(id);
  }

  @Patch("knowledge-bases/:id")
  @ApiOperation({ summary: "Update a knowledge base" })
  @ApiResponse({ status: 200, description: "Knowledge base updated" })
  async updateKnowledgeBase(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: UpdateKnowledgeBaseDto,
  ) {
    return this.knowledgeBaseService.update(id, req.user.id, dto);
  }

  @Delete("knowledge-bases/:id")
  @ApiOperation({ summary: "Delete a knowledge base" })
  @ApiResponse({ status: 200, description: "Knowledge base deleted" })
  async deleteKnowledgeBase(@Req() req: any, @Param("id") id: string) {
    await this.knowledgeBaseService.delete(id, req.user.id);
    return { success: true };
  }

  // ==================== Document Management ====================

  @Post("knowledge-bases/:id/documents")
  @ApiOperation({ summary: "Add a document to knowledge base" })
  @ApiResponse({ status: 201, description: "Document added" })
  async addDocument(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: AddDocumentDto,
  ) {
    // Verify ownership
    await this.knowledgeBaseService.findById(id, req.user.id);
    return this.knowledgeBaseService.addDocument(id, {
      title: dto.title,
      content: dto.content,
      sourceType: dto.sourceType || "manual",
      sourceUrl: dto.sourceUrl,
      mimeType: dto.mimeType,
    });
  }

  @Delete("documents/:id")
  @ApiOperation({ summary: "Delete a document" })
  @ApiResponse({ status: 200, description: "Document deleted" })
  async deleteDocument(@Req() req: any, @Param("id") id: string) {
    await this.knowledgeBaseService.deleteDocument(id, req.user.id);
    return { success: true };
  }

  @Post("knowledge-bases/:id/process")
  @ApiOperation({ summary: "Process all pending documents in knowledge base" })
  @ApiResponse({ status: 200, description: "Processing started" })
  async processDocuments(@Req() req: any, @Param("id") id: string) {
    // Verify ownership
    await this.knowledgeBaseService.findById(id, req.user.id);
    return this.knowledgeBaseService.processAllDocuments(id);
  }

  @Post("knowledge-bases/:id/add-resources")
  @ApiOperation({
    summary:
      "Add external resources to knowledge base (Google Drive, Notion, etc.)",
  })
  @ApiResponse({ status: 201, description: "Resources added successfully" })
  async addResources(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: AddResourcesDto,
  ) {
    // Verify ownership
    await this.knowledgeBaseService.findById(id, req.user.id);

    const results = [];
    for (const resource of dto.resources) {
      // For external resources, we need to fetch content based on source type
      // For now, create placeholder documents that will be processed later
      const doc = await this.knowledgeBaseService.addDocument(id, {
        title: resource.title,
        content: `[Pending content fetch from ${resource.sourceType}]`,
        sourceType: resource.sourceType,
        sourceId: resource.sourceId,
        sourceUrl: resource.sourceUrl,
        mimeType: resource.mimeType,
        metadata: {
          pendingFetch: true,
          externalSource: resource.sourceType,
        },
      });
      results.push(doc);
    }

    return {
      success: true,
      count: results.length,
      documents: results,
    };
  }

  // ==================== Google Drive Integration ====================

  @Post("knowledge-bases/:id/sync")
  @ApiOperation({ summary: "Sync knowledge base with Google Drive" })
  @ApiResponse({ status: 200, description: "Sync completed" })
  async syncKnowledgeBase(@Req() req: any, @Param("id") id: string) {
    // Verify ownership
    await this.knowledgeBaseService.findById(id, req.user.id);
    return this.googleDriveRAGService.syncKnowledgeBase(id);
  }

  @Get("google-drive/folders")
  @ApiOperation({ summary: "List Google Drive folders for selection" })
  @ApiResponse({ status: 200, description: "List of folders" })
  async listGoogleDriveFolders(
    @Req() req: any,
    @Query("parentId") parentId?: string,
  ) {
    return this.googleDriveRAGService.listFolders(req.user.id, parentId);
  }

  // ==================== Member Management (Team Knowledge Base) ====================

  @Get("knowledge-bases/:id/members")
  @ApiOperation({ summary: "Get knowledge base members" })
  @ApiResponse({ status: 200, description: "List of members" })
  async getMembers(@Req() req: any, @Param("id") id: string) {
    return this.knowledgeBaseService.getMembers(id, req.user.id);
  }

  @Post("knowledge-bases/:id/members")
  @ApiOperation({ summary: "Add a member to knowledge base" })
  @ApiResponse({ status: 201, description: "Member added" })
  async addMember(
    @Req() req: any,
    @Param("id") id: string,
    @Body() dto: { email: string; role?: "ADMIN" | "EDITOR" | "VIEWER" },
  ) {
    return this.knowledgeBaseService.addMember(
      id,
      req.user.id,
      dto.email,
      dto.role,
    );
  }

  @Patch("knowledge-bases/:id/members/:memberId")
  @ApiOperation({ summary: "Update member role" })
  @ApiResponse({ status: 200, description: "Member role updated" })
  async updateMemberRole(
    @Req() req: any,
    @Param("id") id: string,
    @Param("memberId") memberId: string,
    @Body() dto: { role: "ADMIN" | "EDITOR" | "VIEWER" },
  ) {
    return this.knowledgeBaseService.updateMemberRole(
      id,
      req.user.id,
      memberId,
      dto.role,
    );
  }

  @Delete("knowledge-bases/:id/members/:memberId")
  @ApiOperation({ summary: "Remove a member from knowledge base" })
  @ApiResponse({ status: 200, description: "Member removed" })
  async removeMember(
    @Req() req: any,
    @Param("id") id: string,
    @Param("memberId") memberId: string,
  ) {
    await this.knowledgeBaseService.removeMember(id, req.user.id, memberId);
    return { success: true };
  }

  // ==================== Query Endpoints ====================

  @Post("query")
  @ApiOperation({ summary: "Execute full RAG pipeline query" })
  @ApiResponse({ status: 200, description: "Query results with context" })
  async query(@Req() req: any, @Body() dto: RAGQueryDto) {
    // Verify ownership of all knowledge bases
    for (const kbId of dto.knowledgeBaseIds) {
      await this.knowledgeBaseService.findById(kbId, req.user.id);
    }

    return this.ragPipelineService.query({
      query: dto.query,
      knowledgeBaseIds: dto.knowledgeBaseIds,
      options: {
        topK: dto.topK,
        useHyde: dto.useHyde,
        useRerank: dto.useRerank,
        hybridAlpha: dto.hybridAlpha,
        minScore: dto.minScore,
      },
    });
  }

  @Post("simple-query")
  @ApiOperation({ summary: "Execute simple vector search query" })
  @ApiResponse({ status: 200, description: "Search results" })
  async simpleQuery(@Req() req: any, @Body() dto: SimpleQueryDto) {
    // Verify ownership of all knowledge bases
    for (const kbId of dto.knowledgeBaseIds) {
      await this.knowledgeBaseService.findById(kbId, req.user.id);
    }

    return this.ragPipelineService.simpleQuery(
      dto.query,
      dto.knowledgeBaseIds,
      dto.topK,
    );
  }
}
