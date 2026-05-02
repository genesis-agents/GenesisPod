import { Controller, Get, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { AIModelType } from "@prisma/client";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { PrismaService } from "../../../common/prisma/prisma.service";
import {
  KeyResolverService,
  UserApiKeysService,
} from "@/modules/ai-harness/facade";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

/**
 * 用户 BYOK 公共接口：可用模型、引导状态。
 *
 * 直接查 AIModel 表（Prisma），不经过 ai-engine/ModelResolver，
 * 避免 ai-infra → ai-engine 的反向层依赖。模型的高级路由选择仍由
 * ai-engine 内部负责，这里只是给 UI 展示可选项。
 */
@ApiTags("User - BYOK")
@Controller("user")
@UseGuards(JwtAuthGuard)
export class UserByokController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly keyResolver: KeyResolverService,
    private readonly userApiKeys: UserApiKeysService,
  ) {}

  @Get("available-models")
  async getAvailableModels(
    @Req() req: AuthenticatedRequest,
    @Query("modelType") modelType?: string,
  ) {
    const providers = await this.keyResolver.getAvailableProviders(req.user.id);
    const effectiveType: AIModelType =
      modelType && Object.values(AIModelType).includes(modelType as AIModelType)
        ? (modelType as AIModelType)
        : AIModelType.CHAT;

    let models: Array<{
      id: string;
      name: string;
      displayName: string;
      modelId: string;
      provider: string;
      modelType: AIModelType;
      isReasoning: boolean;
      maxTokens: number;
      priority: number;
    }> = [];

    if (providers.length > 0) {
      const rows = await this.prisma.aIModel.findMany({
        where: {
          isEnabled: true,
          modelType: effectiveType,
          provider: {
            in: providers.map((p) => p.toLowerCase()),
            mode: "insensitive",
          },
        },
        orderBy: [{ priority: "desc" }, { name: "asc" }],
        select: {
          id: true,
          name: true,
          displayName: true,
          modelId: true,
          provider: true,
          modelType: true,
          isReasoning: true,
          maxTokens: true,
          priority: true,
        },
      });
      models = rows;
    }

    return {
      availableProviders: providers,
      modelType: effectiveType,
      models,
    };
  }

  @Patch("onboarding/complete")
  async completeOnboarding(@Req() req: AuthenticatedRequest) {
    await this.userApiKeys.markOnboardedIfNeeded(req.user.id);
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { byokOnboardedAt: true },
    });
    return { byokOnboardedAt: user?.byokOnboardedAt ?? null };
  }

  @Get("onboarding/status")
  async getOnboardingStatus(@Req() req: AuthenticatedRequest) {
    const user = await this.prisma.user.findUnique({
      where: { id: req.user.id },
      select: { byokOnboardedAt: true, role: true },
    });
    return {
      byokOnboardedAt: user?.byokOnboardedAt ?? null,
      isAdmin: user?.role === "ADMIN",
      requiresOnboarding:
        user?.role !== "ADMIN" && user?.byokOnboardedAt === null,
    };
  }
}
