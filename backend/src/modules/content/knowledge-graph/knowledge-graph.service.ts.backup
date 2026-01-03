import { Injectable, Logger } from "@nestjs/common";
import { Neo4jService } from "../../common/neo4j/neo4j.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { getErrorMessage } from "../../common/utils/error.utils";

/**
 * 知识图谱服务
 */
@Injectable()
export class KnowledgeGraphService {
  private readonly logger = new Logger(KnowledgeGraphService.name);

  constructor(
    private neo4j: Neo4jService,
    private prisma: PrismaService,
  ) {}

  /**
   * 从资源构建知识图谱节点
   */
  async buildGraphFromResource(resourceId: string): Promise<void> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    // 1. 创建资源节点
    await this.createResourceNode(resource);

    // 2. 创建作者节点和关系
    if (resource.authors && Array.isArray(resource.authors)) {
      for (const author of resource.authors as any[]) {
        await this.createAuthorNode(author);
        // Support both arXiv format (name) and GitHub format (username)
        const authorId = author.name || author.username;
        if (authorId) {
          await this.linkResourceToAuthor(resourceId, authorId);
        }
      }
    }

    // 3. 创建主题/分类节点和关系
    if (resource.primaryCategory) {
      await this.createTopicNode(resource.primaryCategory);
      await this.linkResourceToTopic(resourceId, resource.primaryCategory);
    }

    if (resource.categories && Array.isArray(resource.categories)) {
      for (const category of resource.categories as string[]) {
        await this.createTopicNode(category);
        await this.linkResourceToTopic(resourceId, category);
      }
    }

    // 4. 创建标签节点和关系
    if (resource.tags && Array.isArray(resource.tags)) {
      for (const tag of resource.tags as string[]) {
        await this.createTagNode(tag);
        await this.linkResourceToTag(resourceId, tag);
      }
    }

    this.logger.log(`Built knowledge graph for resource ${resourceId}`);
  }

  /**
   * 创建资源节点
   */
  private async createResourceNode(resource: any): Promise<void> {
    const existingNode = await this.neo4j.findNode("Resource", {
      id: resource.id,
    });
    if (existingNode) {
      return;
    }

    await this.neo4j.createNode("Resource", {
      id: resource.id,
      type: resource.type,
      title: resource.title,
      abstract: resource.abstract?.substring(0, 500),
      publishedAt: resource.publishedAt?.toISOString(),
      qualityScore: resource.qualityScore,
      createdAt: resource.createdAt.toISOString(),
    });
  }

  /**
   * 创建作者节点
   * Support both arXiv format (name, affiliation) and GitHub format (username, platform)
   */
  private async createAuthorNode(author: {
    username?: string;
    platform?: string;
    name?: string;
    affiliation?: string;
  }): Promise<void> {
    // Use name (arXiv) or username (GitHub) as the unique identifier
    const authorId = author.name || author.username;
    if (!authorId) {
      return;
    }

    const existingNode = await this.neo4j.findNode("Author", {
      username: authorId,
    });
    if (existingNode) {
      return;
    }

    await this.neo4j.createNode("Author", {
      username: authorId,
      platform: author.platform || author.affiliation || "Unknown",
    });
  }

  /**
   * 创建主题节点
   */
  private async createTopicNode(topic: string): Promise<void> {
    const existingNode = await this.neo4j.findNode("Topic", { name: topic });
    if (existingNode) {
      return;
    }

    await this.neo4j.createNode("Topic", { name: topic });
  }

  /**
   * 创建标签节点
   */
  private async createTagNode(tag: string): Promise<void> {
    const existingNode = await this.neo4j.findNode("Tag", { name: tag });
    if (existingNode) {
      return;
    }

    await this.neo4j.createNode("Tag", { name: tag });
  }

  /**
   * 链接资源和作者
   */
  private async linkResourceToAuthor(
    resourceId: string,
    authorUsername: string,
  ): Promise<void> {
    try {
      await this.neo4j.run(
        `
        MATCH (r:Resource {id: $resourceId})
        MATCH (a:Author {username: $authorUsername})
        MERGE (a)-[:AUTHORED]->(r)
      `,
        { resourceId, authorUsername },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to link resource to author: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 链接资源和主题
   */
  private async linkResourceToTopic(
    resourceId: string,
    topicName: string,
  ): Promise<void> {
    try {
      await this.neo4j.run(
        `
        MATCH (r:Resource {id: $resourceId})
        MATCH (t:Topic {name: $topicName})
        MERGE (r)-[:BELONGS_TO]->(t)
      `,
        { resourceId, topicName },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to link resource to topic: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 链接资源和标签
   */
  private async linkResourceToTag(
    resourceId: string,
    tagName: string,
  ): Promise<void> {
    try {
      await this.neo4j.run(
        `
        MATCH (r:Resource {id: $resourceId})
        MATCH (t:Tag {name: $tagName})
        MERGE (r)-[:TAGGED_WITH]->(t)
      `,
        { resourceId, tagName },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to link resource to tag: ${getErrorMessage(error)}`,
      );
    }
  }

  /**
   * 获取资源的知识图谱
   */
  async getResourceGraph(resourceId: string, depth: number = 2): Promise<any> {
    const result = await this.neo4j.run(
      `
      MATCH path = (r:Resource {id: $resourceId})-[*1..${depth}]-(n)
      RETURN path
      LIMIT 100
    `,
      { resourceId },
    );

    return this.formatGraphData(result);
  }

  /**
   * 获取作者的知识图谱
   */
  async getAuthorGraph(authorUsername: string): Promise<any> {
    const result = await this.neo4j.run(
      `
      MATCH path = (a:Author {username: $authorUsername})-[:AUTHORED]->(r:Resource)-[*0..1]-(n)
      RETURN path
      LIMIT 100
    `,
      { authorUsername },
    );

    return this.formatGraphData(result);
  }

  /**
   * 获取主题的知识图谱
   */
  async getTopicGraph(topicName: string): Promise<any> {
    const result = await this.neo4j.run(
      `
      MATCH path = (t:Topic {name: $topicName})<-[:BELONGS_TO]-(r:Resource)-[*0..1]-(n)
      RETURN path
      LIMIT 100
    `,
      { topicName },
    );

    return this.formatGraphData(result);
  }

  /**
   * 获取整个知识图谱概览
   */
  async getGraphOverview(): Promise<any> {
    const stats = await this.neo4j.run(`
      MATCH (n)
      RETURN labels(n)[0] as label, count(n) as count
    `);

    const relationships = await this.neo4j.run(`
      MATCH ()-[r]->()
      RETURN type(r) as type, count(r) as count
    `);

    return {
      nodes: stats,
      relationships: relationships,
    };
  }

  /**
   * 查找相似资源（基于共享的主题和标签）
   */
  async findSimilarResources(
    resourceId: string,
    limit: number = 10,
  ): Promise<any[]> {
    const result = await this.neo4j.run(
      `
      MATCH (r1:Resource {id: $resourceId})-[:BELONGS_TO|TAGGED_WITH]->(common)<-[:BELONGS_TO|TAGGED_WITH]-(r2:Resource)
      WHERE r1 <> r2
      WITH r2, count(DISTINCT common) as commonCount
      ORDER BY commonCount DESC
      LIMIT $limit
      RETURN r2, commonCount
    `,
      { resourceId, limit },
    );

    return result.map(
      (record: { r2: { properties: unknown }; commonCount: number }) => ({
        resource: record.r2.properties,
        commonCount: record.commonCount,
      }),
    );
  }

  /**
   * 格式化图数据为可视化格式
   */
  private formatGraphData(records: any[]): any {
    const nodes = new Map();
    const edges = [];

    for (const record of records) {
      if (record.path) {
        const path = record.path;

        // 提取节点
        if (path.segments) {
          for (const segment of path.segments) {
            const start = segment.start;
            const end = segment.end;

            if (!nodes.has(start.identity.toString())) {
              nodes.set(start.identity.toString(), {
                id: start.identity.toString(),
                label: start.labels[0],
                properties: start.properties,
              });
            }

            if (!nodes.has(end.identity.toString())) {
              nodes.set(end.identity.toString(), {
                id: end.identity.toString(),
                label: end.labels[0],
                properties: end.properties,
              });
            }

            // 提取边
            edges.push({
              source: start.identity.toString(),
              target: end.identity.toString(),
              type: segment.relationship.type,
              properties: segment.relationship.properties,
            });
          }
        }
      }
    }

    return {
      nodes: Array.from(nodes.values()),
      edges: edges,
    };
  }

  /**
   * 批量构建知识图谱
   */
  async buildGraphForAllResources(): Promise<{
    success: number;
    failed: number;
  }> {
    const resources = await this.prisma.resource.findMany({
      select: { id: true },
    });

    let success = 0;
    let failed = 0;

    for (const resource of resources) {
      try {
        await this.buildGraphFromResource(resource.id);
        success++;
      } catch (error) {
        this.logger.error(
          `Failed to build graph for ${resource.id}: ${getErrorMessage(error)}`,
        );
        failed++;
      }
    }

    this.logger.log(
      `Built knowledge graph: ${success} success, ${failed} failed`,
    );
    return { success, failed };
  }
}
