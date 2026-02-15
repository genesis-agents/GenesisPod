import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from "@nestjs/common";
import { PrismaService } from "../../../../common/prisma/prisma.service";
import { CreateStudioProjectDto, UpdateProjectDto } from "./dto";

@Injectable()
export class ResearchProjectService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new research project
   */
  async createProject(userId: string, dto: CreateStudioProjectDto) {
    return this.prisma.researchProject.create({
      data: {
        userId,
        name: dto.name,
        description: dto.description,
        icon: dto.icon || "📚",
        color: dto.color || "#6366f1",
        researchType: dto.researchType || "DEEP",
        lastAccessAt: new Date(),
      },
      include: {
        _count: {
          select: {
            sources: true,
            notes: true,
            chats: true,
            outputs: true,
          },
        },
      },
    });
  }

  /**
   * Get all projects for a user
   */
  async getProjects(
    userId: string,
    options?: {
      status?: "ACTIVE" | "ARCHIVED";
      search?: string;
      researchType?: "FAST" | "DEEP";
      take?: number;
      skip?: number;
    },
  ) {
    const where: any = {
      userId,
      status: options?.status || "ACTIVE",
    };

    if (options?.researchType) {
      where.researchType = options.researchType;
    }

    if (options?.search) {
      where.OR = [
        { name: { contains: options.search, mode: "insensitive" } },
        { description: { contains: options.search, mode: "insensitive" } },
      ];
    }

    const [projects, total] = await Promise.all([
      this.prisma.researchProject.findMany({
        where,
        orderBy: { lastAccessAt: "desc" },
        take: options?.take || 20,
        skip: options?.skip || 0,
        include: {
          _count: {
            select: {
              sources: true,
              notes: true,
              chats: true,
              outputs: true,
            },
          },
        },
      }),
      this.prisma.researchProject.count({ where }),
    ]);

    return {
      data: projects,
      pagination: {
        total,
        take: options?.take || 20,
        skip: options?.skip || 0,
      },
    };
  }

  /**
   * Get a single project by ID
   */
  async getProject(userId: string, projectId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
      include: {
        sources: {
          orderBy: { createdAt: "desc" },
        },
        notes: {
          orderBy: [{ isPinned: "desc" }, { createdAt: "desc" }],
        },
        chats: {
          orderBy: { createdAt: "desc" },
          take: 1, // Only get the most recent chat
        },
        outputs: {
          orderBy: { createdAt: "desc" },
        },
        _count: {
          select: {
            sources: true,
            notes: true,
            chats: true,
            outputs: true,
          },
        },
      },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    // Update last access time
    await this.prisma.researchProject.update({
      where: { id: projectId },
      data: { lastAccessAt: new Date() },
    });

    return project;
  }

  /**
   * Update a project
   */
  async updateProject(
    userId: string,
    projectId: string,
    dto: UpdateProjectDto,
  ) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.prisma.researchProject.update({
      where: { id: projectId },
      data: {
        ...(dto.name && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.icon && { icon: dto.icon }),
        ...(dto.color && { color: dto.color }),
        ...(dto.status && { status: dto.status }),
      },
      include: {
        _count: {
          select: {
            sources: true,
            notes: true,
            chats: true,
            outputs: true,
          },
        },
      },
    });
  }

  /**
   * Delete a project (soft delete)
   */
  async deleteProject(userId: string, projectId: string) {
    const project = await this.prisma.researchProject.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      throw new NotFoundException("Project not found");
    }

    if (project.userId !== userId) {
      throw new ForbiddenException("Access denied");
    }

    return this.prisma.researchProject.update({
      where: { id: projectId },
      data: { status: "DELETED" },
    });
  }

  /**
   * Archive a project
   */
  async archiveProject(userId: string, projectId: string) {
    return this.updateProject(userId, projectId, { status: "ARCHIVED" });
  }

  /**
   * Restore an archived project
   */
  async restoreProject(userId: string, projectId: string) {
    return this.updateProject(userId, projectId, { status: "ACTIVE" });
  }
}
