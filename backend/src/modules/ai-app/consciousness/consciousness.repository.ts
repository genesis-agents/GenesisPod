import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  ConsciousnessStatus,
  ConsciousnessDataSourceType,
  ConsciousnessSharePermission,
  Prisma,
} from "@prisma/client";

@Injectable()
export class ConsciousnessRepository {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Profile CRUD ───

  async createProfile(
    userId: string,
    data: { name: string; description?: string; avatarUrl?: string },
  ) {
    return this.prisma.consciousnessProfile.create({
      data: {
        userId,
        name: data.name,
        description: data.description,
        avatarUrl: data.avatarUrl,
      },
    });
  }

  async getProfile(id: string, userId?: string) {
    return this.prisma.consciousnessProfile.findFirst({
      where: { id, ...(userId ? { userId } : {}) },
      include: {
        dataSources: { orderBy: { createdAt: "desc" } },
        _count: {
          select: {
            memories: true,
            conversations: true,
            dataSources: true,
          },
        },
      },
    });
  }

  async getProfiles(userId: string) {
    return this.prisma.consciousnessProfile.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: {
          select: {
            memories: true,
            conversations: true,
            dataSources: true,
          },
        },
      },
    });
  }

  async updateProfile(
    id: string,
    userId: string,
    data: {
      name?: string;
      description?: string;
      avatarUrl?: string;
      sharePermission?: ConsciousnessSharePermission;
      status?: ConsciousnessStatus;
      personalityModel?: Prisma.InputJsonValue;
      writingStyle?: Prisma.InputJsonValue;
      knowledgeDomains?: Prisma.InputJsonValue;
      analyzedAt?: Date;
      totalDataSources?: number;
      totalMemories?: number;
      totalConversations?: number;
    },
  ) {
    return this.prisma.consciousnessProfile.update({
      where: { id, userId },
      data,
    });
  }

  async deleteProfile(id: string, userId: string) {
    return this.prisma.consciousnessProfile.delete({
      where: { id, userId },
    });
  }

  // ─── Data Sources ───

  async addDataSource(
    profileId: string,
    data: {
      type: ConsciousnessDataSourceType;
      name: string;
      content?: string;
      fileUrl?: string;
      fileSize?: number;
      mimeType?: string;
    },
  ) {
    const source = await this.prisma.consciousnessDataSource.create({
      data: { profileId, ...data },
    });

    await this.prisma.consciousnessProfile.update({
      where: { id: profileId },
      data: { totalDataSources: { increment: 1 } },
    });

    return source;
  }

  async getUnprocessedSources(profileId: string) {
    return this.prisma.consciousnessDataSource.findMany({
      where: { profileId, isProcessed: false },
      orderBy: { createdAt: "asc" },
    });
  }

  async markSourceProcessed(
    id: string,
    extractedData: Prisma.InputJsonValue,
  ) {
    return this.prisma.consciousnessDataSource.update({
      where: { id },
      data: {
        isProcessed: true,
        processedAt: new Date(),
        extractedData,
      },
    });
  }

  async deleteDataSource(id: string, profileId: string) {
    await this.prisma.consciousnessDataSource.delete({
      where: { id, profileId },
    });

    await this.prisma.consciousnessProfile.update({
      where: { id: profileId },
      data: { totalDataSources: { decrement: 1 } },
    });
  }

  // ─── Memories ───

  async createMemories(
    profileId: string,
    memories: Array<{
      category: string;
      topic: string;
      content: string;
      importance?: number;
      confidence?: number;
      sourceId?: string;
    }>,
  ) {
    const result = await this.prisma.consciousnessMemory.createMany({
      data: memories.map((m) => ({ profileId, ...m })),
    });

    await this.prisma.consciousnessProfile.update({
      where: { id: profileId },
      data: { totalMemories: { increment: result.count } },
    });

    return result;
  }

  async searchMemories(
    profileId: string,
    options?: { category?: string; limit?: number },
  ) {
    return this.prisma.consciousnessMemory.findMany({
      where: {
        profileId,
        ...(options?.category ? { category: options.category } : {}),
      },
      orderBy: { importance: "desc" },
      take: options?.limit ?? 20,
    });
  }

  // ─── Conversations ───

  async createConversation(
    profileId: string,
    userId: string,
    title: string,
  ) {
    const conversation =
      await this.prisma.consciousnessConversation.create({
        data: { profileId, userId, title },
      });

    await this.prisma.consciousnessProfile.update({
      where: { id: profileId },
      data: { totalConversations: { increment: 1 } },
    });

    return conversation;
  }

  async getConversation(id: string) {
    return this.prisma.consciousnessConversation.findUnique({
      where: { id },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        profile: {
          select: {
            id: true,
            name: true,
            userId: true,
            status: true,
            personalityModel: true,
            writingStyle: true,
            knowledgeDomains: true,
            description: true,
          },
        },
      },
    });
  }

  async getConversations(profileId: string, userId: string) {
    return this.prisma.consciousnessConversation.findMany({
      where: { profileId, userId },
      orderBy: { updatedAt: "desc" },
      include: {
        _count: { select: { messages: true } },
      },
    });
  }

  async addMessage(
    conversationId: string,
    data: {
      role: string;
      content: string;
      memoriesUsed?: Prisma.InputJsonValue;
      tokens?: number;
    },
  ) {
    return this.prisma.consciousnessMessage.create({
      data: { conversationId, ...data },
    });
  }

  // ─── Sharing ───

  async shareProfile(
    profileId: string,
    sharedWithUserId: string,
    options?: { canChat?: boolean; canViewMemories?: boolean },
  ) {
    return this.prisma.consciousnessShare.create({
      data: {
        profileId,
        sharedWithUserId,
        canChat: options?.canChat ?? true,
        canViewMemories: options?.canViewMemories ?? false,
      },
    });
  }

  async getSharesForProfile(profileId: string) {
    return this.prisma.consciousnessShare.findMany({
      where: { profileId },
    });
  }

  async getSharedProfiles(userId: string) {
    return this.prisma.consciousnessShare.findMany({
      where: { sharedWithUserId: userId, canChat: true },
      include: {
        profile: {
          select: {
            id: true,
            name: true,
            description: true,
            avatarUrl: true,
            status: true,
            userId: true,
          },
        },
      },
    });
  }

  async removeShare(profileId: string, sharedWithUserId: string) {
    return this.prisma.consciousnessShare.delete({
      where: {
        profileId_sharedWithUserId: { profileId, sharedWithUserId },
      },
    });
  }

  async getSharePermission(profileId: string, userId: string) {
    return this.prisma.consciousnessShare.findUnique({
      where: {
        profileId_sharedWithUserId: {
          profileId,
          sharedWithUserId: userId,
        },
      },
    });
  }
}
