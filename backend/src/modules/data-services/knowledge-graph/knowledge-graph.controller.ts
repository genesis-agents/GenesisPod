import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Logger,
  ParseIntPipe,
  DefaultValuePipe,
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
}
