import { Injectable, Logger } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

/**
 * PostgreSQL 知识图谱服务
 * 使用 Recursive CTEs + JSONB 替代 Neo4j
 */
@Injectable()
export class GraphService {
  private readonly logger = new Logger(GraphService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * 查找相似资源（基于共享的主题和标签）
   * 替代 Neo4j 的图遍历查询
   */
  async findSimilarResources(
    resourceId: string,
    limit: number = 10,
  ): Promise<
    Array<{
      resource: any;
      commonCount: number;
    }>
  > {
    // 1. 获取目标资源的分类和标签
    const targetResource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: {
        categories: true,
        tags: true,
        primaryCategory: true,
      },
    });

    if (!targetResource) {
      return [];
    }

    // PostgreSQL 自动通过 JSON 字段处理分类和标签
    // const categories = (targetResource.categories as string[]) || [];
    // const tags = (targetResource.tags as string[]) || [];
    // const primaryCategory = targetResource.primaryCategory;

    // 2. 使用 PostgreSQL 数组操作找相似资源
    // 使用 raw SQL 提高性能
    const results = await this.prisma.$queryRaw<
      Array<{
        id: string;
        type: string;
        title: string;
        abstract: string | null;
        publishedAt: Date | null;
        qualityScore: number | null;
        trendingScore: number | null;
        categories: any;
        tags: any;
        primaryCategory: string | null;
        authors: any;
        sourceUrl: string;
        thumbnailUrl: string | null;
        commonCount: number;
      }>
    >`
      WITH target AS (
        SELECT
          COALESCE(categories::jsonb, '[]'::jsonb) AS categories,
          COALESCE(tags::jsonb, '[]'::jsonb) AS tags,
          primary_category
        FROM resources
        WHERE id = ${resourceId}
      )
      SELECT
        r.*,
        (
          -- 计算共同分类数量
          (
            SELECT COUNT(*)
            FROM jsonb_array_elements_text(COALESCE(r.categories::jsonb, '[]'::jsonb)) AS cat
            WHERE cat IN (
              SELECT jsonb_array_elements_text(target.categories)
              FROM target
            )
          )
          +
          -- 计算共同标签数量
          (
            SELECT COUNT(*)
            FROM jsonb_array_elements_text(COALESCE(r.tags::jsonb, '[]'::jsonb)) AS tag
            WHERE tag IN (
              SELECT jsonb_array_elements_text(target.tags)
              FROM target
            )
          )
          +
          -- 主分类匹配加权
          CASE
            WHEN r.primary_category = (SELECT primary_category FROM target) THEN 2
            ELSE 0
          END
        )::integer AS "commonCount"
      FROM resources r, target
      WHERE r.id != ${resourceId}
        AND (
          -- 至少有一个共同分类或标签
          EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(r.categories::jsonb, '[]'::jsonb)) AS cat
            WHERE cat IN (
              SELECT jsonb_array_elements_text(target.categories)
            )
          )
          OR EXISTS (
            SELECT 1
            FROM jsonb_array_elements_text(COALESCE(r.tags::jsonb, '[]'::jsonb)) AS tag
            WHERE tag IN (
              SELECT jsonb_array_elements_text(target.tags)
            )
          )
          OR r.primary_category = (SELECT primary_category FROM target)
        )
      ORDER BY "commonCount" DESC, r.quality_score DESC NULLS LAST
      LIMIT ${limit}
    `;

    return results.map((r) => ({
      resource: r,
      commonCount: r.commonCount,
    }));
  }

  /**
   * 获取资源的知识图谱数据
   * 包括：关联的作者、主题、标签
   */
  async getResourceGraph(
    resourceId: string,
    depth: number = 2,
  ): Promise<{
    nodes: Array<{
      id: string;
      label: string;
      properties: any;
    }>;
    edges: Array<{
      source: string;
      target: string;
      type: string;
    }>;
  }> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      return { nodes: [], edges: [] };
    }

    const nodes: Array<{ id: string; label: string; properties: any }> = [];
    const edges: Array<{ source: string; target: string; type: string }> = [];

    // 1. 添加资源节点
    nodes.push({
      id: resource.id,
      label: "Resource",
      properties: {
        id: resource.id,
        type: resource.type,
        title: resource.title,
        abstract: resource.abstract?.substring(0, 500),
        qualityScore: resource.qualityScore?.toString(),
      },
    });

    // 2. 添加作者节点和关系
    const authors = (resource.authors as any[]) || [];
    authors.forEach((author) => {
      const authorId = author.name || author.username;
      if (authorId) {
        nodes.push({
          id: `author:${authorId}`,
          label: "Author",
          properties: {
            username: authorId,
            platform: author.platform || author.affiliation || "Unknown",
          },
        });

        edges.push({
          source: `author:${authorId}`,
          target: resource.id,
          type: "AUTHORED",
        });
      }
    });

    // 3. 添加主题节点和关系
    const categories = (resource.categories as string[]) || [];
    if (resource.primaryCategory) {
      categories.unshift(resource.primaryCategory);
    }

    [...new Set(categories)].forEach((category) => {
      nodes.push({
        id: `topic:${category}`,
        label: "Topic",
        properties: { name: category },
      });

      edges.push({
        source: resource.id,
        target: `topic:${category}`,
        type: "BELONGS_TO",
      });
    });

    // 4. 添加标签节点和关系
    const tags = (resource.tags as string[]) || [];
    tags.forEach((tag) => {
      nodes.push({
        id: `tag:${tag}`,
        label: "Tag",
        properties: { name: tag },
      });

      edges.push({
        source: resource.id,
        target: `tag:${tag}`,
        type: "TAGGED_WITH",
      });
    });

    // 5. 如果 depth > 1，添加相关资源
    if (depth > 1) {
      const similar = await this.findSimilarResources(resourceId, 5);
      similar.forEach(({ resource: r }) => {
        nodes.push({
          id: r.id,
          label: "Resource",
          properties: {
            id: r.id,
            type: r.type,
            title: r.title,
            abstract: r.abstract?.substring(0, 200),
            qualityScore: r.qualityScore?.toString(),
          },
        });

        // 通过共享主题连接
        const sharedCategories = (r.categories as string[]) || [];
        sharedCategories.forEach((cat: string) => {
          if (categories.includes(cat)) {
            edges.push({
              source: r.id,
              target: `topic:${cat}`,
              type: "BELONGS_TO",
            });
          }
        });
      });
    }

    return { nodes, edges };
  }

  /**
   * 获取作者的知识图谱
   */
  async getAuthorGraph(authorUsername: string): Promise<{
    nodes: any[];
    edges: any[];
  }> {
    // 查找该作者的所有资源
    const resources = await this.prisma.$queryRaw<any[]>`
      SELECT *
      FROM resources
      WHERE jsonb_path_exists(
        COALESCE(authors::jsonb, '[]'::jsonb),
        ('$[*] ? (@.name == "' || ${authorUsername} || '" || @.username == "' || ${authorUsername} || '")')::jsonpath
      )
      ORDER BY quality_score DESC NULLS LAST
      LIMIT 100
    `;

    const nodes: any[] = [];
    const edges: any[] = [];

    // 添加作者节点
    nodes.push({
      id: `author:${authorUsername}`,
      label: "Author",
      properties: { username: authorUsername },
    });

    // 添加资源节点和关系
    resources.forEach((resource) => {
      nodes.push({
        id: resource.id,
        label: "Resource",
        properties: {
          id: resource.id,
          type: resource.type,
          title: resource.title,
          abstract: resource.abstract?.substring(0, 200),
        },
      });

      edges.push({
        source: `author:${authorUsername}`,
        target: resource.id,
        type: "AUTHORED",
      });

      // 添加主题节点
      const categories = (resource.categories as string[]) || [];
      categories.forEach((cat: string) => {
        const topicId = `topic:${cat}`;
        if (!nodes.find((n) => n.id === topicId)) {
          nodes.push({
            id: topicId,
            label: "Topic",
            properties: { name: cat },
          });
        }

        edges.push({
          source: resource.id,
          target: topicId,
          type: "BELONGS_TO",
        });
      });
    });

    return { nodes, edges };
  }

  /**
   * 获取主题的知识图谱
   */
  async getTopicGraph(topicName: string): Promise<{
    nodes: any[];
    edges: any[];
  }> {
    // 查找该主题下的所有资源
    const resources = await this.prisma.$queryRaw<any[]>`
      SELECT *
      FROM resources
      WHERE
        primary_category = ${topicName}
        OR jsonb_path_exists(
          COALESCE(categories::jsonb, '[]'::jsonb),
          ('$[*] ? (@ == "' || ${topicName} || '")')::jsonpath
        )
      ORDER BY quality_score DESC NULLS LAST
      LIMIT 100
    `;

    const nodes: any[] = [];
    const edges: any[] = [];

    // 添加主题节点
    nodes.push({
      id: `topic:${topicName}`,
      label: "Topic",
      properties: { name: topicName },
    });

    const authorSet = new Set<string>();

    // 添加资源节点和关系
    resources.forEach((resource) => {
      nodes.push({
        id: resource.id,
        label: "Resource",
        properties: {
          id: resource.id,
          type: resource.type,
          title: resource.title,
          abstract: resource.abstract?.substring(0, 200),
        },
      });

      edges.push({
        source: resource.id,
        target: `topic:${topicName}`,
        type: "BELONGS_TO",
      });

      // 收集作者
      const authors = (resource.authors as any[]) || [];
      authors.forEach((author) => {
        const authorId = author.name || author.username;
        if (authorId) {
          authorSet.add(authorId);
        }
      });
    });

    // 添加作者节点（限制数量）
    Array.from(authorSet)
      .slice(0, 20)
      .forEach((authorId) => {
        nodes.push({
          id: `author:${authorId}`,
          label: "Author",
          properties: { username: authorId },
        });

        // 找该作者的资源并建立关系
        resources.forEach((resource) => {
          const authors = (resource.authors as any[]) || [];
          const hasAuthor = authors.some(
            (a) => a.name === authorId || a.username === authorId,
          );
          if (hasAuthor) {
            edges.push({
              source: `author:${authorId}`,
              target: resource.id,
              type: "AUTHORED",
            });
          }
        });
      });

    return { nodes, edges };
  }

  /**
   * 获取图谱概览统计
   */
  async getGraphOverview(): Promise<{
    nodes: Array<{ label: string; count: number }>;
    relationships: Array<{ type: string; count: number }>;
  }> {
    // 统计资源数量
    const resourceCount = await this.prisma.resource.count();

    // 统计作者数量（去重）
    const authorsResult = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT author_name) as count
      FROM (
        SELECT jsonb_array_elements(COALESCE(authors::jsonb, '[]'::jsonb))->>'name' as author_name
        FROM resources
        WHERE authors IS NOT NULL
        UNION
        SELECT jsonb_array_elements(COALESCE(authors::jsonb, '[]'::jsonb))->>'username' as author_name
        FROM resources
        WHERE authors IS NOT NULL
      ) AS all_authors
      WHERE author_name IS NOT NULL
    `;
    const authorCount = Number(authorsResult[0]?.count || 0);

    // 统计主题数量
    const topicsResult = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT topic) as count
      FROM (
        SELECT primary_category as topic
        FROM resources
        WHERE primary_category IS NOT NULL
        UNION
        SELECT jsonb_array_elements_text(COALESCE(categories::jsonb, '[]'::jsonb)) as topic
        FROM resources
      ) AS all_topics
    `;
    const topicCount = Number(topicsResult[0]?.count || 0);

    // 统计标签数量
    const tagsResult = await this.prisma.$queryRaw<Array<{ count: number }>>`
      SELECT COUNT(DISTINCT tag) as count
      FROM (
        SELECT jsonb_array_elements_text(COALESCE(tags::jsonb, '[]'::jsonb)) as tag
        FROM resources
      ) AS all_tags
    `;
    const tagCount = Number(tagsResult[0]?.count || 0);

    return {
      nodes: [
        { label: "Resource", count: resourceCount },
        { label: "Author", count: authorCount },
        { label: "Topic", count: topicCount },
        { label: "Tag", count: tagCount },
      ],
      relationships: [
        { type: "AUTHORED", count: resourceCount }, // 近似值
        { type: "BELONGS_TO", count: topicCount },
        { type: "TAGGED_WITH", count: tagCount },
      ],
    };
  }

  /**
   * 批量构建知识图谱（兼容接口，PostgreSQL 自动维护）
   */
  async buildGraphFromResource(_resourceId: string): Promise<void> {
    // PostgreSQL 方案不需要显式构建图谱
    // 数据已经在 Resource 表的 JSON 字段中
    this.logger.log(
      `✅ PostgreSQL graph: No explicit build needed, data already indexed`,
    );
  }

  /**
   * 批量构建所有资源的图谱（兼容接口）
   */
  async buildGraphForAllResources(): Promise<{
    success: number;
    failed: number;
  }> {
    const resourceCount = await this.prisma.resource.count();
    this.logger.log(
      `✅ PostgreSQL graph: ${resourceCount} resources already indexed`,
    );
    return { success: resourceCount, failed: 0 };
  }

  /**
   * 从资源移除标签
   */
  async unlinkTag(resourceId: string, tagName: string): Promise<void> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { tags: true },
    });

    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    const tags = (resource.tags as string[]) || [];
    const updatedTags = tags.filter((t) => t !== tagName);

    await this.prisma.resource.update({
      where: { id: resourceId },
      data: { tags: updatedTags },
    });

    this.logger.log(`Unlinked tag "${tagName}" from resource ${resourceId}`);
  }

  /**
   * 从资源移除分类
   */
  async unlinkCategory(
    resourceId: string,
    categoryName: string,
  ): Promise<void> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { categories: true, primaryCategory: true },
    });

    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    const categories = (resource.categories as string[]) || [];
    const updatedCategories = categories.filter((c) => c !== categoryName);

    // If removing primary category, set to first remaining category or null
    const updateData: {
      categories: string[];
      primaryCategory?: string | null;
    } = {
      categories: updatedCategories,
    };

    if (resource.primaryCategory === categoryName) {
      updateData.primaryCategory = updatedCategories[0] || null;
    }

    await this.prisma.resource.update({
      where: { id: resourceId },
      data: updateData,
    });

    this.logger.log(
      `Unlinked category "${categoryName}" from resource ${resourceId}`,
    );
  }

  /**
   * 从资源移除作者
   */
  async unlinkAuthor(resourceId: string, authorName: string): Promise<void> {
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
      select: { authors: true },
    });

    if (!resource) {
      throw new Error(`Resource ${resourceId} not found`);
    }

    const authors =
      (resource.authors as Array<{ name?: string; username?: string }>) || [];
    const updatedAuthors = authors.filter(
      (a) => a.name !== authorName && a.username !== authorName,
    );

    await this.prisma.resource.update({
      where: { id: resourceId },
      data: { authors: updatedAuthors },
    });

    this.logger.log(
      `Unlinked author "${authorName}" from resource ${resourceId}`,
    );
  }

  /**
   * 批量移除关系
   */
  async unlinkNode(
    resourceId: string,
    nodeType: "tag" | "category" | "author",
    nodeName: string,
  ): Promise<void> {
    switch (nodeType) {
      case "tag":
        return this.unlinkTag(resourceId, nodeName);
      case "category":
        return this.unlinkCategory(resourceId, nodeName);
      case "author":
        return this.unlinkAuthor(resourceId, nodeName);
      default:
        throw new Error(`Unknown node type: ${nodeType}`);
    }
  }
}
