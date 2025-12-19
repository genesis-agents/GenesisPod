import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { TopicRole } from "@prisma/client";
import { AddResourceDto } from "../../dto";
import { TopicCrudService } from "./topic-crud.service";

@Injectable()
export class TopicResourcesService {
  constructor(
    private prisma: PrismaService,
    private topicCrudService: TopicCrudService,
  ) {}

  async getResources(topicId: string, userId: string) {
    await this.topicCrudService.checkTopicMembership(topicId, userId);

    return this.prisma.topicResource.findMany({
      where: { topicId },
      include: {
        addedBy: {
          select: { id: true, username: true, fullName: true },
        },
        resource: {
          select: { id: true, title: true, type: true, sourceUrl: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });
  }

  async addResource(topicId: string, userId: string, dto: AddResourceDto) {
    await this.topicCrudService.checkTopicMembership(topicId, userId);

    return this.prisma.topicResource.create({
      data: {
        topicId,
        addedById: userId,
        ...dto,
      },
      include: {
        addedBy: {
          select: { id: true, username: true, fullName: true },
        },
      },
    });
  }

  async removeResource(topicId: string, userId: string, resourceId: string) {
    const resource = await this.prisma.topicResource.findFirst({
      where: { id: resourceId, topicId },
    });

    if (!resource) {
      throw new NotFoundException("Resource not found");
    }

    if (resource.addedById !== userId) {
      await this.topicCrudService.checkTopicPermission(topicId, userId, [
        TopicRole.OWNER,
        TopicRole.ADMIN,
      ]);
    }

    return this.prisma.topicResource.delete({
      where: { id: resourceId },
    });
  }
}
