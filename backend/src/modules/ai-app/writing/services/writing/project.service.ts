import { Injectable, Logger, NotFoundException, ForbiddenException } from "@nestjs/common";
import { PrismaService } from "../../../../../common/prisma/prisma.service";
import { CreateProjectDto, UpdateProjectDto } from "../../dto/project.dto";
import { CreateVolumeDto } from "../../dto/volume.dto";

@Injectable()
export class ProjectService {
  private readonly _logger = new Logger(ProjectService.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateProjectDto) {
    this._logger.log(`Creating writing project for user ${userId}`);

    const project = await this.prisma.writingProject.create({
      data: {
        name: dto.name,
        description: dto.description,
        genre: dto.genre,
        targetWords: dto.targetWords || 100000,
        writingStyle: dto.writingStyle,
        targetAudience: dto.targetAudience,
        pov: dto.pov,
        tense: dto.tense,
        maxParallelWriters: dto.maxParallelWriters || 3,
        ownerId: userId,
        // Auto-create Story Bible
        storyBible: {
          create: {},
        },
      },
      include: {
        storyBible: true,
      },
    });

    return project;
  }

  async findAll(
    userId: string,
    options: { status?: string; limit?: number; cursor?: string },
  ) {
    const { status, limit = 20, cursor } = options;

    const where: any = { ownerId: userId };
    if (status) {
      where.status = status;
    }

    const projects = await this.prisma.writingProject.findMany({
      where,
      take: limit + 1,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { createdAt: "desc" },
      include: {
        volumes: {
          select: { id: true },
        },
        _count: {
          select: {
            volumes: true,
            missions: true,
          },
        },
      },
    });

    const hasMore = projects.length > limit;
    if (hasMore) {
      projects.pop();
    }

    return {
      items: projects,
      hasMore,
      nextCursor: hasMore ? projects[projects.length - 1]?.id : null,
    };
  }

  async findOne(id: string, userId: string) {
    const project = await this.prisma.writingProject.findFirst({
      where: { id, ownerId: userId },
      include: {
        storyBible: {
          include: {
            characters: true,
            worldSettings: true,
            terminologies: true,
            timelineEvents: true,
            factions: true,
          },
        },
        volumes: {
          include: {
            chapters: {
              select: {
                id: true,
                chapterNumber: true,
                title: true,
                status: true,
                wordCount: true,
              },
            },
          },
          orderBy: { volumeNumber: "asc" },
        },
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    return project;
  }

  async update(id: string, userId: string, dto: UpdateProjectDto) {
    await this.verifyOwnership(id, userId);

    return this.prisma.writingProject.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string, userId: string) {
    await this.verifyOwnership(id, userId);

    return this.prisma.writingProject.delete({
      where: { id },
    });
  }

  async createVolume(projectId: string, userId: string, dto: CreateVolumeDto) {
    await this.verifyOwnership(projectId, userId);

    return this.prisma.writingVolume.create({
      data: {
        projectId,
        volumeNumber: dto.volumeNumber,
        title: dto.title,
        synopsis: dto.synopsis,
        targetWords: dto.targetWords,
      },
    });
  }

  async getVolumes(projectId: string, userId: string) {
    await this.verifyOwnership(projectId, userId);

    return this.prisma.writingVolume.findMany({
      where: { projectId },
      include: {
        chapters: {
          select: {
            id: true,
            chapterNumber: true,
            title: true,
            status: true,
            wordCount: true,
          },
          orderBy: { chapterNumber: "asc" },
        },
      },
      orderBy: { volumeNumber: "asc" },
    });
  }

  private async verifyOwnership(projectId: string, userId: string) {
    const project = await this.prisma.writingProject.findFirst({
      where: { id: projectId, ownerId: userId },
    });

    if (!project) {
      throw new ForbiddenException("You do not have access to this project");
    }

    return project;
  }
}
