import { Injectable, NotFoundException, Logger } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { MessageContentType, Prisma, TopicRole } from "@prisma/client";
import { SendMessageDto } from "../../dto";
import { UrlParserService, ParsedUrl } from "../utils/url-parser.service";
import { TopicCrudService } from "./topic-crud.service";

@Injectable()
export class TopicMessagesService {
  private readonly logger = new Logger(TopicMessagesService.name);

  constructor(
    private prisma: PrismaService,
    private urlParserService: UrlParserService,
    private topicCrudService: TopicCrudService,
  ) {}

  async getMessages(
    topicId: string,
    userId: string,
    options?: { cursor?: string; limit?: number; before?: Date },
  ) {
    await this.topicCrudService.checkTopicMembership(topicId, userId);

    const limit = options?.limit || 50;
    const where: Prisma.TopicMessageWhereInput = {
      topicId,
      deletedAt: null,
    };

    if (options?.cursor) {
      where.id = { lt: options.cursor };
    }

    if (options?.before) {
      where.createdAt = { lt: options.before };
    }

    const messages = await this.prisma.topicMessage.findMany({
      where,
      include: {
        sender: {
          select: { id: true, username: true, fullName: true, avatarUrl: true },
        },
        aiMember: {
          select: {
            id: true,
            aiModel: true,
            displayName: true,
            avatar: true,
            roleDescription: true,
          },
        },
        mentions: {
          include: {
            user: {
              select: { id: true, username: true, fullName: true },
            },
            aiMember: {
              select: { id: true, displayName: true },
            },
          },
        },
        attachments: true,
        reactions: {
          include: {
            user: {
              select: { id: true, username: true },
            },
          },
        },
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: {
              select: { id: true, username: true, fullName: true },
            },
            aiMember: {
              select: { id: true, displayName: true },
            },
          },
        },
        _count: {
          select: { replies: true },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
    });

    const hasMore = messages.length > limit;
    if (hasMore) {
      messages.pop();
    }

    return {
      messages: messages.reverse(),
      hasMore,
      nextCursor: hasMore ? messages[0]?.id : null,
    };
  }

  async sendMessage(topicId: string, userId: string, dto: SendMessageDto) {
    await this.topicCrudService.checkTopicMembership(topicId, userId);

    let parsedUrls: ParsedUrl[] = [];
    try {
      const { parsedUrls: urls } =
        await this.urlParserService.detectAndParseUrls(dto.content);
      parsedUrls = urls;
      if (urls.length > 0) {
        this.logger.log(
          `Detected and parsed ${urls.length} URLs in message for topic ${topicId}`,
        );
      }
    } catch (error) {
      this.logger.warn(`Failed to parse URLs in message: ${error}`);
    }

    const message = await this.prisma.$transaction(async (tx) => {
      const msg = await tx.topicMessage.create({
        data: {
          topicId,
          senderId: userId,
          content: dto.content,
          contentType: dto.contentType || MessageContentType.TEXT,
          replyToId: dto.replyToId,
          parsedUrls: parsedUrls.length > 0 ? (parsedUrls as any) : undefined,
        },
        include: {
          sender: {
            select: {
              id: true,
              username: true,
              fullName: true,
              avatarUrl: true,
            },
          },
        },
      });

      if (dto.mentions && dto.mentions.length > 0) {
        await tx.topicMessageMention.createMany({
          data: dto.mentions.map((m) => ({
            messageId: msg.id,
            userId: m.userId,
            aiMemberId: m.aiMemberId,
            mentionType: m.mentionType,
          })),
        });
      }

      if (dto.attachments && dto.attachments.length > 0) {
        await tx.topicMessageAttachment.createMany({
          data: dto.attachments.map((a) => ({
            messageId: msg.id,
            type: a.type,
            name: a.name,
            url: a.url,
            size: a.size,
            mimeType: a.mimeType,
            resourceId: a.resourceId,
            linkPreview: a.linkPreview as any,
          })),
        });
      }

      await tx.topic.update({
        where: { id: topicId },
        data: { updatedAt: new Date() },
      });

      return msg;
    });

    return this.prisma.topicMessage.findUnique({
      where: { id: message.id },
      include: {
        sender: {
          select: { id: true, username: true, fullName: true, avatarUrl: true },
        },
        aiMember: {
          select: {
            id: true,
            aiModel: true,
            displayName: true,
            avatar: true,
            roleDescription: true,
          },
        },
        mentions: {
          include: {
            user: { select: { id: true, username: true, fullName: true } },
            aiMember: { select: { id: true, displayName: true } },
          },
        },
        attachments: true,
        reactions: true,
        replyTo: {
          select: {
            id: true,
            content: true,
            sender: { select: { id: true, username: true, fullName: true } },
            aiMember: { select: { id: true, displayName: true } },
          },
        },
      },
    });
  }

  async deleteMessage(topicId: string, userId: string, messageId: string) {
    const message = await this.prisma.topicMessage.findFirst({
      where: { id: messageId, topicId },
    });

    if (!message) {
      throw new NotFoundException("Message not found");
    }

    if (message.senderId !== userId) {
      await this.topicCrudService.checkTopicPermission(topicId, userId, [
        TopicRole.OWNER,
        TopicRole.ADMIN,
      ]);
    }

    return this.prisma.topicMessage.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  async addReaction(
    topicId: string,
    userId: string,
    messageId: string,
    emoji: string,
  ) {
    await this.topicCrudService.checkTopicMembership(topicId, userId);

    const message = await this.prisma.topicMessage.findFirst({
      where: { id: messageId, topicId, deletedAt: null },
    });

    if (!message) {
      throw new NotFoundException("Message not found");
    }

    return this.prisma.topicMessageReaction.upsert({
      where: {
        messageId_userId_emoji: { messageId, userId, emoji },
      },
      update: {},
      create: {
        messageId,
        userId,
        emoji,
      },
    });
  }

  async removeReaction(
    topicId: string,
    userId: string,
    messageId: string,
    emoji: string,
  ) {
    await this.topicCrudService.checkTopicMembership(topicId, userId);

    return this.prisma.topicMessageReaction.deleteMany({
      where: { messageId, userId, emoji },
    });
  }

  async markAsRead(topicId: string, userId: string, messageId?: string) {
    const membership = await this.prisma.topicMember.findUnique({
      where: {
        topicId_userId: { topicId, userId },
      },
    });

    if (!membership) {
      throw new NotFoundException("Not a member");
    }

    let lastReadAt = new Date();

    if (messageId) {
      const message = await this.prisma.topicMessage.findUnique({
        where: { id: messageId },
        select: { createdAt: true },
      });
      if (message) {
        lastReadAt = message.createdAt;
      }
    }

    return this.prisma.topicMember.update({
      where: { id: membership.id },
      data: { lastReadAt },
    });
  }
}
