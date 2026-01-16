import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { TopicCollaboratorRole } from "@prisma/client";
import {
  CollaboratorRole,
  CollaboratorResponseDto,
  TopicCollaboratorsResponseDto,
} from "../dto/collaborator.dto";

@Injectable()
export class TopicCollaboratorService {
  private readonly logger = new Logger(TopicCollaboratorService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * 获取专题的所有协作者
   */
  async getCollaborators(
    topicId: string,
    userId: string,
  ): Promise<TopicCollaboratorsResponseDto> {
    // 验证用户有权访问该专题
    const topic = await this.prisma.researchTopic.findFirst({
      where: {
        id: topicId,
        OR: [
          { userId },
          {
            collaborators: {
              some: { userId, isActive: true },
            },
          },
        ],
      },
      include: {
        user: {
          select: { id: true, email: true, username: true, avatarUrl: true },
        },
        collaborators: {
          where: { isActive: true },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                username: true,
                avatarUrl: true,
              },
            },
          },
          orderBy: { invitedAt: "desc" },
        },
      },
    });

    if (!topic) {
      throw new NotFoundException("专题不存在或无权访问");
    }

    const collaborators: CollaboratorResponseDto[] = topic.collaborators.map(
      (c) => ({
        id: c.id,
        userId: c.userId,
        email: c.user.email,
        username: c.user.username || undefined,
        avatarUrl: c.user.avatarUrl || undefined,
        role: c.role as CollaboratorRole,
        invitedAt: c.invitedAt,
        acceptedAt: c.acceptedAt || undefined,
        isActive: c.isActive,
      }),
    );

    return {
      topicId: topic.id,
      owner: {
        id: topic.user.id,
        email: topic.user.email,
        username: topic.user.username || undefined,
        avatarUrl: topic.user.avatarUrl || undefined,
      },
      collaborators,
      totalCount: collaborators.length,
    };
  }

  /**
   * 添加协作者
   */
  async addCollaborator(
    topicId: string,
    inviterId: string,
    email: string,
    role: CollaboratorRole = CollaboratorRole.VIEWER,
  ): Promise<CollaboratorResponseDto> {
    // 验证邀请者是所有者或管理员
    const topic = await this.prisma.researchTopic.findFirst({
      where: {
        id: topicId,
        OR: [
          { userId: inviterId },
          {
            collaborators: {
              some: { userId: inviterId, role: "ADMIN", isActive: true },
            },
          },
        ],
      },
    });

    if (!topic) {
      throw new ForbiddenException("无权添加协作者");
    }

    // 查找用户
    const userToAdd = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, email: true, username: true, avatarUrl: true },
    });

    if (!userToAdd) {
      throw new NotFoundException(`用户 ${email} 不存在`);
    }

    // 检查是否是所有者
    if (userToAdd.id === topic.userId) {
      throw new BadRequestException("不能将所有者添加为协作者");
    }

    // 检查是否已经是协作者
    const existing = await this.prisma.topicCollaborator.findUnique({
      where: {
        topicId_userId: { topicId, userId: userToAdd.id },
      },
    });

    if (existing) {
      if (existing.isActive) {
        throw new BadRequestException("该用户已是协作者");
      }
      // 重新激活
      const updated = await this.prisma.topicCollaborator.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          role: role as TopicCollaboratorRole,
          invitedById: inviterId,
          invitedAt: new Date(),
          acceptedAt: new Date(), // 自动接受
        },
      });

      return {
        id: updated.id,
        userId: userToAdd.id,
        email: userToAdd.email,
        username: userToAdd.username || undefined,
        avatarUrl: userToAdd.avatarUrl || undefined,
        role: updated.role as CollaboratorRole,
        invitedAt: updated.invitedAt,
        acceptedAt: updated.acceptedAt || undefined,
        isActive: updated.isActive,
      };
    }

    // 创建新协作者
    const collaborator = await this.prisma.topicCollaborator.create({
      data: {
        topicId,
        userId: userToAdd.id,
        role: role as TopicCollaboratorRole,
        invitedById: inviterId,
        acceptedAt: new Date(), // 自动接受
      },
    });

    this.logger.log(`用户 ${email} 已添加为专题 ${topicId} 的协作者 (${role})`);

    return {
      id: collaborator.id,
      userId: userToAdd.id,
      email: userToAdd.email,
      username: userToAdd.username || undefined,
      avatarUrl: userToAdd.avatarUrl || undefined,
      role: collaborator.role as CollaboratorRole,
      invitedAt: collaborator.invitedAt,
      acceptedAt: collaborator.acceptedAt || undefined,
      isActive: collaborator.isActive,
    };
  }

  /**
   * 更新协作者角色
   */
  async updateCollaboratorRole(
    topicId: string,
    collaboratorId: string,
    userId: string,
    newRole: CollaboratorRole,
  ): Promise<CollaboratorResponseDto> {
    // 验证操作者是所有者或管理员
    const topic = await this.prisma.researchTopic.findFirst({
      where: {
        id: topicId,
        OR: [
          { userId },
          {
            collaborators: {
              some: { userId, role: "ADMIN", isActive: true },
            },
          },
        ],
      },
    });

    if (!topic) {
      throw new ForbiddenException("无权修改协作者角色");
    }

    const collaborator = await this.prisma.topicCollaborator.findFirst({
      where: { id: collaboratorId, topicId },
      include: {
        user: {
          select: { id: true, email: true, username: true, avatarUrl: true },
        },
      },
    });

    if (!collaborator) {
      throw new NotFoundException("协作者不存在");
    }

    const updated = await this.prisma.topicCollaborator.update({
      where: { id: collaboratorId },
      data: { role: newRole as TopicCollaboratorRole },
    });

    return {
      id: updated.id,
      userId: collaborator.user.id,
      email: collaborator.user.email,
      username: collaborator.user.username || undefined,
      avatarUrl: collaborator.user.avatarUrl || undefined,
      role: updated.role as CollaboratorRole,
      invitedAt: updated.invitedAt,
      acceptedAt: updated.acceptedAt || undefined,
      isActive: updated.isActive,
    };
  }

  /**
   * 移除协作者
   */
  async removeCollaborator(
    topicId: string,
    collaboratorId: string,
    userId: string,
  ): Promise<void> {
    // 验证操作者是所有者或管理员
    const topic = await this.prisma.researchTopic.findFirst({
      where: {
        id: topicId,
        OR: [
          { userId },
          {
            collaborators: {
              some: { userId, role: "ADMIN", isActive: true },
            },
          },
        ],
      },
    });

    if (!topic) {
      throw new ForbiddenException("无权移除协作者");
    }

    const collaborator = await this.prisma.topicCollaborator.findFirst({
      where: { id: collaboratorId, topicId },
    });

    if (!collaborator) {
      throw new NotFoundException("协作者不存在");
    }

    // 软删除 - 设置为不活跃
    await this.prisma.topicCollaborator.update({
      where: { id: collaboratorId },
      data: { isActive: false },
    });

    this.logger.log(`协作者 ${collaboratorId} 已从专题 ${topicId} 移除`);
  }

  /**
   * 离开专题（协作者主动退出）
   */
  async leaveProject(topicId: string, userId: string): Promise<void> {
    const collaborator = await this.prisma.topicCollaborator.findUnique({
      where: {
        topicId_userId: { topicId, userId },
      },
    });

    if (!collaborator) {
      throw new NotFoundException("您不是该专题的协作者");
    }

    await this.prisma.topicCollaborator.update({
      where: { id: collaborator.id },
      data: { isActive: false },
    });

    this.logger.log(`用户 ${userId} 已退出专题 ${topicId}`);
  }

  /**
   * 检查用户是否有权访问专题
   *
   * 权限逻辑：
   * - PUBLIC 专题：任何登录用户都有完全访问权限
   * - SHARED 专题：所有者和协作者有访问权限
   * - PRIVATE 专题：仅所有者有访问权限
   */
  async hasAccess(
    topicId: string,
    userId: string,
    requiredRole?: CollaboratorRole,
  ): Promise<boolean> {
    const topic = await this.prisma.researchTopic.findFirst({
      where: { id: topicId },
      include: {
        collaborators: {
          where: { userId, isActive: true },
        },
      },
    });

    if (!topic) return false;

    // 所有者有全部权限
    if (topic.userId === userId) return true;

    // PUBLIC 专题：
    // - 读取操作（无 requiredRole 或 VIEWER）：所有登录用户可访问
    // - 写入操作（EDITOR/ADMIN）：仅所有者可操作（已在上面检查过）
    if (topic.visibility === "PUBLIC") {
      // 如果需要写入权限，只有所有者可以（已在上面返回了）
      if (requiredRole && requiredRole !== CollaboratorRole.VIEWER) {
        return false;
      }
      return true;
    }

    // PRIVATE 专题：只有所有者有权限（已在上面检查过）
    if (topic.visibility === "PRIVATE") return false;

    // SHARED 专题：检查协作者权限
    const collaborator = topic.collaborators[0];
    if (!collaborator) return false;

    if (!requiredRole) return true;

    // 检查角色层级
    const roleHierarchy: Record<CollaboratorRole, number> = {
      [CollaboratorRole.VIEWER]: 1,
      [CollaboratorRole.EDITOR]: 2,
      [CollaboratorRole.ADMIN]: 3,
    };

    return (
      roleHierarchy[collaborator.role as CollaboratorRole] >=
      roleHierarchy[requiredRole]
    );
  }
}
