import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { TopicType, TopicRole, Prisma } from "@prisma/client";
import { CreateTopicDto, UpdateTopicDto } from "../../dto";

@Injectable()
export class TopicCrudService {
  private readonly logger = new Logger(TopicCrudService.name);

  constructor(private prisma: PrismaService) {}

  async createTopic(userId: string, dto: CreateTopicDto) {
    const { memberIds, aiMembers, ...topicData } = dto;

    this.logger.log(
      `Creating topic for user ${userId}: ${JSON.stringify(dto)}`,
    );

    try {
      const topicId = await this.prisma.$transaction(async (tx) => {
        const topic = await tx.topic.create({
          data: {
            ...topicData,
            createdById: userId,
            members: {
              create: {
                userId,
                role: TopicRole.OWNER,
              },
            },
          },
        });

        this.logger.log(`Topic created with id: ${topic.id}`);

        if (memberIds && memberIds.length > 0) {
          await tx.topicMember.createMany({
            data: memberIds
              .filter((id) => id !== userId)
              .map((id) => ({
                topicId: topic.id,
                userId: id,
                role: TopicRole.MEMBER,
              })),
            skipDuplicates: true,
          });
        }

        if (aiMembers && aiMembers.length > 0) {
          await tx.topicAIMember.createMany({
            data: aiMembers.map((ai) => ({
              topicId: topic.id,
              aiModel: ai.aiModel,
              displayName: ai.displayName,
              roleDescription: ai.roleDescription,
              systemPrompt: ai.systemPrompt,
              addedById: userId,
            })),
          });
        }

        return topic.id;
      });

      this.logger.log(`Transaction committed, fetching topic ${topicId}`);
      return this.getTopicById(topicId, userId);
    } catch (error) {
      this.logger.error(`Failed to create topic: ${error}`);
      throw error;
    }
  }

  async getTopics(
    userId: string,
    options?: { type?: TopicType; search?: string },
  ) {
    const where: Prisma.TopicWhereInput = {
      members: {
        some: { userId },
      },
      archivedAt: null,
    };

    if (options?.type) {
      where.type = options.type;
    }

    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const topics = await this.prisma.topic.findMany({
      where,
      include: {
        createdBy: {
          select: { id: true, username: true, fullName: true, avatarUrl: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
              },
            },
          },
        },
        aiMembers: {
          select: {
            id: true,
            aiModel: true,
            displayName: true,
            avatar: true,
            roleDescription: true,
          },
        },
        _count: {
          select: {
            messages: true,
            resources: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const topicIds = topics.map((t) => t.id);
    const unreadCounts = await this.prisma.$queryRaw<
      Array<{ topic_id: string; unread_count: bigint }>
    >`
      SELECT
        tm.topic_id,
        COUNT(*) as unread_count
      FROM topic_messages tm
      LEFT JOIN topic_members tmem ON tm.topic_id = tmem.topic_id AND tmem.user_id = ${userId}::text
      WHERE tm.topic_id = ANY(${topicIds}::text[])
        AND tm.deleted_at IS NULL
        AND (
          tmem.last_read_at IS NULL
          OR tm.created_at > tmem.last_read_at
        )
      GROUP BY tm.topic_id
    `;

    const unreadMap = new Map<string, number>();
    unreadCounts.forEach((row) => {
      unreadMap.set(row.topic_id, Number(row.unread_count));
    });

    const topicsWithUnread = topics.map((topic) => {
      const membership = topic.members.find((m) => m.userId === userId);
      let unreadCount = 0;

      if (membership?.lastReadAt) {
        unreadCount = unreadMap.get(topic.id) || 0;
      } else {
        unreadCount = topic._count.messages;
      }

      return {
        ...topic,
        unreadCount,
        memberCount: topic.members.length,
        aiMemberCount: topic.aiMembers.length,
      };
    });

    return topicsWithUnread;
  }

  async getTopicById(topicId: string, userId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        createdBy: {
          select: { id: true, username: true, fullName: true, avatarUrl: true },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                fullName: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
          orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
        },
        aiMembers: {
          orderBy: { createdAt: "asc" },
        },
        _count: {
          select: {
            messages: true,
            resources: true,
          },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException("Topic not found");
    }

    const membership = topic.members.find((m) => m.userId === userId);
    if (!membership && topic.type === TopicType.PRIVATE) {
      throw new ForbiddenException("You are not a member of this topic");
    }

    return {
      ...topic,
      currentUserRole: membership?.role,
      memberCount: topic.members.length,
      aiMemberCount: topic.aiMembers.length,
    };
  }

  async updateTopic(topicId: string, userId: string, dto: UpdateTopicDto) {
    await this.checkTopicPermission(topicId, userId, [
      TopicRole.OWNER,
      TopicRole.ADMIN,
    ]);

    return this.prisma.topic.update({
      where: { id: topicId },
      data: dto,
      include: {
        createdBy: {
          select: { id: true, username: true, fullName: true, avatarUrl: true },
        },
      },
    });
  }

  async archiveTopic(topicId: string, userId: string) {
    await this.checkTopicPermission(topicId, userId, [TopicRole.OWNER]);

    return this.prisma.topic.update({
      where: { id: topicId },
      data: {
        type: TopicType.ARCHIVED,
        archivedAt: new Date(),
      },
    });
  }

  async deleteTopic(topicId: string, userId: string) {
    await this.checkTopicPermission(topicId, userId, [TopicRole.OWNER]);

    return this.prisma.$transaction(async (tx) => {
      await tx.missionLog.deleteMany({
        where: { mission: { topicId } },
      });

      await tx.agentTask.deleteMany({
        where: { mission: { topicId } },
      });

      await tx.teamMission.deleteMany({
        where: { topicId },
      });

      await tx.topicMessageReaction.deleteMany({
        where: { message: { topicId } },
      });

      await tx.topicMessageMention.deleteMany({
        where: { message: { topicId } },
      });

      await tx.topicMessageAttachment.deleteMany({
        where: { message: { topicId } },
      });

      const messageIds = await tx.topicMessage.findMany({
        where: { topicId },
        select: { id: true },
      });
      if (messageIds.length > 0) {
        await tx.topicMessageBookmark.deleteMany({
          where: { messageId: { in: messageIds.map((m) => m.id) } },
        });
      }

      await tx.topicMessageForward.deleteMany({
        where: {
          OR: [{ sourceTopicId: topicId }, { targetTopicId: topicId }],
        },
      });

      await tx.topicSummary.deleteMany({
        where: { topicId },
      });

      await tx.topicResource.deleteMany({
        where: { topicId },
      });

      await tx.topicMessage.deleteMany({
        where: { topicId },
      });

      await tx.topicAIMember.deleteMany({
        where: { topicId },
      });

      await tx.topicMember.deleteMany({
        where: { topicId },
      });

      return tx.topic.delete({
        where: { id: topicId },
      });
    });
  }

  async checkTopicPermission(
    topicId: string,
    userId: string,
    allowedRoles: TopicRole[],
  ) {
    const membership = await this.prisma.topicMember.findUnique({
      where: {
        topicId_userId: { topicId, userId },
      },
    });

    if (!membership) {
      throw new ForbiddenException("You are not a member of this topic");
    }

    if (!allowedRoles.includes(membership.role)) {
      throw new ForbiddenException(
        "You do not have permission to perform this action",
      );
    }

    return membership;
  }

  async checkTopicMembership(topicId: string, userId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
      include: {
        members: {
          where: { userId },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException("Topic not found");
    }

    if (topic.members.length === 0 && topic.type === TopicType.PRIVATE) {
      throw new ForbiddenException("You are not a member of this topic");
    }

    return topic.members[0];
  }
}
