/**
 * E R4 Phase 2 (PR-E1, 2026-05-05): 用户自定义 Agent CRUD service
 *
 * 当前骨架阶段：只做基本 CRUD。后续 PR-E2 增加 publish 校验（确保 5 步配置完整），
 * PR-E3 集成到 agent-playground.runMission 启动路径。
 */
import {
  Injectable,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { Prisma } from "@prisma/client";
import type {
  CreateCustomAgentDto,
  UpdateCustomAgentDto,
} from "./dto/custom-agent.dto";

@Injectable()
export class CustomAgentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string) {
    return this.prisma.customAgentDefinition.findMany({
      where: { userId, isEnabled: true },
      orderBy: { updatedAt: "desc" },
    });
  }

  async getById(userId: string, id: string) {
    const found = await this.prisma.customAgentDefinition.findFirst({
      where: { id, userId },
    });
    if (!found) {
      throw new NotFoundException(
        "Custom agent not found or not owned by current user",
      );
    }
    return found;
  }

  async create(userId: string, dto: CreateCustomAgentDto) {
    return this.prisma.customAgentDefinition.create({
      data: {
        userId,
        workspaceId: dto.workspaceId,
        slug: dto.slug,
        displayName: dto.displayName,
        description: dto.description,
        config: dto.config as unknown as Prisma.InputJsonValue,
        status: "DRAFT",
        version: 1,
      },
    });
  }

  async update(userId: string, id: string, dto: UpdateCustomAgentDto) {
    const existing = await this.getById(userId, id);
    return this.prisma.customAgentDefinition.update({
      where: { id: existing.id },
      data: {
        displayName: dto.displayName ?? existing.displayName,
        description: dto.description ?? existing.description,
        config:
          dto.config === undefined
            ? undefined
            : ({
                ...((existing.config as Record<string, unknown>) ?? {}),
                ...(dto.config as Record<string, unknown>),
              } as unknown as Prisma.InputJsonValue),
        status: dto.status ?? existing.status,
        isEnabled: dto.isEnabled ?? existing.isEnabled,
      },
    });
  }

  async remove(userId: string, id: string) {
    const existing = await this.getById(userId, id);
    await this.prisma.customAgentDefinition.delete({
      where: { id: existing.id },
    });
    return { success: true };
  }

  /**
   * Publish: DRAFT → PUBLISHED + version++
   *
   * PR-E1 骨架：仅做最小校验（basicInfo.name 必填）。PR-E2 增加 5 步完整性校验。
   */
  async publish(userId: string, id: string) {
    const existing = await this.getById(userId, id);
    const config = existing.config as { basicInfo?: { name?: string } } | null;
    if (!config?.basicInfo?.name) {
      throw new ForbiddenException(
        "config.basicInfo.name is required before publish",
      );
    }
    return this.prisma.customAgentDefinition.update({
      where: { id: existing.id },
      data: { status: "PUBLISHED", version: existing.version + 1 },
    });
  }
}
