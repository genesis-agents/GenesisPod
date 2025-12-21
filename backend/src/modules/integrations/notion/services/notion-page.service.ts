import { Injectable, Logger, BadRequestException, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { NotionAuthService } from "./notion-auth.service";
import { ListPagesDto } from "../dto/notion.dto";

@Injectable()
export class NotionPageService {
  private readonly logger = new Logger(NotionPageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: NotionAuthService
  ) {}

  /**
   * 获取用户的页面列表
   */
  async listPages(userId: string, dto: ListPagesDto) {
    const { connectionId, search, page = 1, limit = 20 } = dto;

    // 获取用户的连接 ID
    const connections = connectionId
      ? [{ id: connectionId }]
      : await this.prisma.notionConnection.findMany({
          where: { userId },
          select: { id: true },
        });

    const connectionIds = connections.map((c) => c.id);

    // 构建查询条件
    const where: any = {
      connectionId: { in: connectionIds },
    };

    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { plainTextContent: { contains: search, mode: "insensitive" } },
      ];
    }

    // 查询页面
    const [pages, total] = await Promise.all([
      this.prisma.notionPage.findMany({
        where,
        select: {
          id: true,
          notionPageId: true,
          title: true,
          icon: true,
          coverUrl: true,
          url: true,
          parentType: true,
          parentId: true,
          notionCreatedAt: true,
          notionUpdatedAt: true,
          syncStatus: true,
          lastSyncedAt: true,
          isLocallyModified: true,
          linkedResourceId: true,
          connection: {
            select: {
              id: true,
              workspaceName: true,
              workspaceIcon: true,
            },
          },
        },
        orderBy: { notionUpdatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.notionPage.count({ where }),
    ]);

    return {
      pages,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * 获取页面详情（包含块内容）
   */
  async getPage(userId: string, pageId: string) {
    const page = await this.prisma.notionPage.findFirst({
      where: {
        id: pageId,
        connection: { userId },
      },
      include: {
        connection: {
          select: {
            id: true,
            workspaceName: true,
            workspaceIcon: true,
          },
        },
        versions: {
          orderBy: { version: "desc" },
          take: 5,
          select: {
            id: true,
            version: true,
            source: true,
            createdAt: true,
          },
        },
      },
    });

    if (!page) {
      throw new NotFoundException("Page not found");
    }

    return page;
  }

  /**
   * 本地更新页面内容
   */
  async updatePageLocally(userId: string, pageId: string, blocks: any[]) {
    const page = await this.prisma.notionPage.findFirst({
      where: {
        id: pageId,
        connection: { userId },
      },
    });

    if (!page) {
      throw new NotFoundException("Page not found");
    }

    // 保存当前版本到历史
    const currentVersion = await this.prisma.notionBlockVersion.findFirst({
      where: { pageId },
      orderBy: { version: "desc" },
    });

    await this.prisma.notionBlockVersion.create({
      data: {
        pageId,
        version: (currentVersion?.version || 0) + 1,
        blocks: page.blocks as any,
        source: "local_edit",
      },
    });

    // 更新页面
    const updated = await this.prisma.notionPage.update({
      where: { id: pageId },
      data: {
        blocks: blocks as any,
        plainTextContent: this.extractPlainText(blocks),
        isLocallyModified: true,
        localModifiedAt: new Date(),
      },
    });

    return updated;
  }

  /**
   * 推送本地修改到 Notion
   */
  async pushToNotion(userId: string, pageId: string) {
    const page = await this.prisma.notionPage.findFirst({
      where: {
        id: pageId,
        connection: { userId },
      },
      include: {
        connection: true,
      },
    });

    if (!page) {
      throw new NotFoundException("Page not found");
    }

    if (!page.isLocallyModified) {
      throw new BadRequestException("No local modifications to push");
    }

    try {
      const client = await this.authService.getNotionClient(page.connectionId);

      // 删除现有的所有块
      const existingBlocks = await client.blocks.children.list({
        block_id: page.notionPageId,
      });

      for (const block of existingBlocks.results) {
        await client.blocks.delete({ block_id: block.id });
      }

      // 添加新的块
      const blocks = page.blocks as any[];
      const notionBlocks = this.convertToNotionBlocks(blocks);

      if (notionBlocks.length > 0) {
        await client.blocks.children.append({
          block_id: page.notionPageId,
          children: notionBlocks,
        });
      }

      // 更新本地状态
      await this.prisma.notionPage.update({
        where: { id: pageId },
        data: {
          isLocallyModified: false,
          localModifiedAt: null,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Pushed local changes to Notion page ${page.notionPageId}`);
    } catch (error) {
      this.logger.error(`Failed to push to Notion: ${error}`);
      throw new BadRequestException(`Failed to push changes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 链接页面到 Library 资源
   */
  async linkToResource(userId: string, pageId: string, resourceId: string) {
    // 验证页面属于用户
    const page = await this.prisma.notionPage.findFirst({
      where: {
        id: pageId,
        connection: { userId },
      },
    });

    if (!page) {
      throw new NotFoundException("Page not found");
    }

    // 验证资源存在
    const resource = await this.prisma.resource.findUnique({
      where: { id: resourceId },
    });

    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    await this.prisma.notionPage.update({
      where: { id: pageId },
      data: { linkedResourceId: resourceId },
    });
  }

  /**
   * 取消链接
   */
  async unlinkFromResource(userId: string, pageId: string) {
    const page = await this.prisma.notionPage.findFirst({
      where: {
        id: pageId,
        connection: { userId },
      },
    });

    if (!page) {
      throw new NotFoundException("Page not found");
    }

    await this.prisma.notionPage.update({
      where: { id: pageId },
      data: { linkedResourceId: null },
    });
  }

  /**
   * 获取数据库列表
   */
  async listDatabases(userId: string, connectionId?: string) {
    const connections = connectionId
      ? [{ id: connectionId }]
      : await this.prisma.notionConnection.findMany({
          where: { userId },
          select: { id: true },
        });

    const connectionIds = connections.map((c) => c.id);

    return this.prisma.notionDatabase.findMany({
      where: {
        connectionId: { in: connectionIds },
      },
      select: {
        id: true,
        notionDbId: true,
        title: true,
        description: true,
        icon: true,
        url: true,
        itemCount: true,
        syncStatus: true,
        lastSyncedAt: true,
        connection: {
          select: {
            id: true,
            workspaceName: true,
          },
        },
      },
      orderBy: { title: "asc" },
    });
  }

  /**
   * 获取数据库详情
   */
  async getDatabase(userId: string, databaseId: string) {
    const database = await this.prisma.notionDatabase.findFirst({
      where: {
        id: databaseId,
        connection: { userId },
      },
      include: {
        connection: {
          select: {
            id: true,
            workspaceName: true,
          },
        },
      },
    });

    if (!database) {
      throw new NotFoundException("Database not found");
    }

    return database;
  }

  /**
   * 从块中提取纯文本
   */
  private extractPlainText(blocks: any[]): string {
    const texts: string[] = [];

    const processBlock = (block: any) => {
      if (block.content) {
        // BlockNote 格式
        for (const inline of block.content) {
          if (inline.type === "text" && inline.text) {
            texts.push(inline.text);
          }
        }
      }

      // 处理子块
      if (block.children) {
        for (const child of block.children) {
          processBlock(child);
        }
      }
    };

    for (const block of blocks) {
      processBlock(block);
    }

    return texts.join("\n");
  }

  /**
   * 将 BlockNote 格式转换为 Notion API 格式
   */
  private convertToNotionBlocks(blocks: any[]): any[] {
    const result: any[] = [];

    for (const block of blocks) {
      const notionBlock = this.convertBlock(block);
      if (notionBlock) {
        result.push(notionBlock);
      }
    }

    return result;
  }

  private convertBlock(block: any): any {
    const richText = this.convertContent(block.content || []);

    switch (block.type) {
      case "paragraph":
        return {
          object: "block",
          type: "paragraph",
          paragraph: { rich_text: richText },
        };

      case "heading":
        const level = block.props?.level || 1;
        const headingType = `heading_${Math.min(level, 3)}`;
        return {
          object: "block",
          type: headingType,
          [headingType]: { rich_text: richText },
        };

      case "bulletListItem":
        return {
          object: "block",
          type: "bulleted_list_item",
          bulleted_list_item: { rich_text: richText },
        };

      case "numberedListItem":
        return {
          object: "block",
          type: "numbered_list_item",
          numbered_list_item: { rich_text: richText },
        };

      case "checkListItem":
        return {
          object: "block",
          type: "to_do",
          to_do: {
            rich_text: richText,
            checked: block.props?.checked || false,
          },
        };

      case "codeBlock":
        return {
          object: "block",
          type: "code",
          code: {
            rich_text: richText,
            language: block.props?.language || "plain text",
          },
        };

      case "image":
        if (block.props?.url) {
          return {
            object: "block",
            type: "image",
            image: {
              type: "external",
              external: { url: block.props.url },
            },
          };
        }
        return null;

      default:
        // 默认转为段落
        if (richText.length > 0) {
          return {
            object: "block",
            type: "paragraph",
            paragraph: { rich_text: richText },
          };
        }
        return null;
    }
  }

  private convertContent(content: any[]): any[] {
    return content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => ({
        type: "text",
        text: { content: item.text },
        annotations: {
          bold: item.styles?.bold || false,
          italic: item.styles?.italic || false,
          strikethrough: item.styles?.strike || false,
          underline: item.styles?.underline || false,
          code: item.styles?.code || false,
        },
      }));
  }
}
