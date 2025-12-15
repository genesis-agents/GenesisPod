import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Body,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
  BadRequestException,
} from "@nestjs/common";
import { KnowledgeGraphService } from "./knowledge-graph.service.postgres";

/**
 * 知识图谱控制器
 */
@Controller("knowledge-graph")
export class KnowledgeGraphController {
  private readonly logger = new Logger(KnowledgeGraphController.name);

  constructor(private kgService: KnowledgeGraphService) {}

  /**
   * 为单个资源构建知识图谱
   * POST /api/v1/knowledge-graph/build/:id
   */
  @Post("build/:id")
  async buildGraphForResource(@Param("id") id: string) {
    this.logger.log(`Building knowledge graph for resource ${id}`);
    await this.kgService.buildGraphFromResource(id);
    return { message: "Knowledge graph built successfully", resourceId: id };
  }

  /**
   * 批量构建所有资源的知识图谱
   * POST /api/v1/knowledge-graph/build-all
   */
  @Post("build-all")
  async buildGraphForAll() {
    this.logger.log("Building knowledge graph for all resources");
    const result = await this.kgService.buildGraphForAllResources();
    return {
      message: "Batch build completed",
      ...result,
    };
  }

  /**
   * 获取资源的知识图谱
   * GET /api/v1/knowledge-graph/resource/:id?depth=2
   */
  @Get("resource/:id")
  async getResourceGraph(
    @Param("id") id: string,
    @Query("depth", new DefaultValuePipe(2), ParseIntPipe) depth: number,
  ) {
    this.logger.log(
      `Fetching knowledge graph for resource ${id} (depth: ${depth})`,
    );
    return this.kgService.getResourceGraph(id, depth);
  }

  /**
   * 获取作者的知识图谱
   * GET /api/v1/knowledge-graph/author/:username
   */
  @Get("author/:username")
  async getAuthorGraph(@Param("username") username: string) {
    this.logger.log(`Fetching knowledge graph for author ${username}`);
    return this.kgService.getAuthorGraph(username);
  }

  /**
   * 获取主题的知识图谱
   * GET /api/v1/knowledge-graph/topic/:name
   */
  @Get("topic/:name")
  async getTopicGraph(@Param("name") name: string) {
    this.logger.log(`Fetching knowledge graph for topic ${name}`);
    return this.kgService.getTopicGraph(name);
  }

  /**
   * 获取知识图谱概览
   * GET /api/v1/knowledge-graph/overview
   */
  @Get("overview")
  async getOverview() {
    this.logger.log("Fetching knowledge graph overview");
    return this.kgService.getGraphOverview();
  }

  /**
   * 查找相似资源
   * GET /api/v1/knowledge-graph/similar/:id?limit=10
   */
  @Get("similar/:id")
  async findSimilar(
    @Param("id") id: string,
    @Query("limit", new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    this.logger.log(`Finding similar resources for ${id}`);
    return this.kgService.findSimilarResources(id, limit);
  }

  /**
   * 从资源移除关联节点
   * DELETE /api/v1/knowledge-graph/resource/:id/unlink
   * Body: { nodeType: "tag" | "category" | "author", nodeName: string }
   */
  @Delete("resource/:id/unlink")
  async unlinkNode(
    @Param("id") id: string,
    @Body() body: { nodeType: "tag" | "category" | "author"; nodeName: string },
  ) {
    const { nodeType, nodeName } = body;

    if (!nodeType || !nodeName) {
      throw new BadRequestException("nodeType and nodeName are required");
    }

    if (!["tag", "category", "author"].includes(nodeType)) {
      throw new BadRequestException(
        "nodeType must be one of: tag, category, author",
      );
    }

    this.logger.log(`Unlinking ${nodeType} "${nodeName}" from resource ${id}`);
    return this.kgService.unlinkNode(id, nodeType, nodeName);
  }

  /**
   * 从资源移除标签
   * DELETE /api/v1/knowledge-graph/resource/:id/tag/:tagName
   */
  @Delete("resource/:id/tag/:tagName")
  async unlinkTag(@Param("id") id: string, @Param("tagName") tagName: string) {
    this.logger.log(`Unlinking tag "${tagName}" from resource ${id}`);
    return this.kgService.unlinkTag(id, tagName);
  }

  /**
   * 从资源移除分类
   * DELETE /api/v1/knowledge-graph/resource/:id/category/:categoryName
   */
  @Delete("resource/:id/category/:categoryName")
  async unlinkCategory(
    @Param("id") id: string,
    @Param("categoryName") categoryName: string,
  ) {
    this.logger.log(`Unlinking category "${categoryName}" from resource ${id}`);
    return this.kgService.unlinkCategory(id, categoryName);
  }

  /**
   * 从资源移除作者
   * DELETE /api/v1/knowledge-graph/resource/:id/author/:authorName
   */
  @Delete("resource/:id/author/:authorName")
  async unlinkAuthor(
    @Param("id") id: string,
    @Param("authorName") authorName: string,
  ) {
    this.logger.log(`Unlinking author "${authorName}" from resource ${id}`);
    return this.kgService.unlinkAuthor(id, authorName);
  }
}
