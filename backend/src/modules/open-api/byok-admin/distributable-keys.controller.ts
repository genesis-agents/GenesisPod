import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Throttle } from "@nestjs/throttler";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import { DistributableKeysService } from "../../ai-infra/credentials/distributable-keys/distributable-keys.service";
import { KeyAssignmentsService } from "../../ai-infra/credentials/key-assignments/key-assignments.service";
import {
  AssignKeyDto,
  CreateDistributableKeyDto,
  UpdateDistributableKeyDto,
} from "../../ai-infra/credentials/distributable-keys/dto";

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("Admin - Distributable Keys")
@Controller("admin/distributable-keys")
@UseGuards(JwtAuthGuard, AdminGuard)
export class DistributableKeysController {
  constructor(
    private readonly service: DistributableKeysService,
    private readonly assignments: KeyAssignmentsService,
  ) {}

  @Get()
  async list(
    @Query("provider") provider?: string,
    @Query("isActive") isActive?: string,
  ) {
    const activeFilter =
      isActive === "true" ? true : isActive === "false" ? false : undefined;
    const items = await this.service.list({
      provider,
      isActive: activeFilter,
    });
    return { items };
  }

  @Throttle({ default: { ttl: 3600_000, limit: 50 } })
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateDistributableKeyDto,
  ) {
    const created = await this.service.create({
      provider: dto.provider,
      label: dto.label,
      apiKey: dto.apiKey,
      apiEndpoint: dto.apiEndpoint,
      monthlyQuotaCents: dto.monthlyQuotaCents,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      createdBy: req.user.email,
    });
    return this.service.getView(created.id);
  }

  @Get(":id")
  async detail(@Param("id") id: string) {
    const [key, assignments] = await Promise.all([
      this.service.getView(id),
      this.assignments.listByKey(id),
    ]);
    return { key, assignments };
  }

  @Patch(":id")
  async update(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: UpdateDistributableKeyDto,
  ) {
    await this.service.update(id, {
      label: dto.label,
      apiKey: dto.apiKey,
      apiEndpoint: dto.apiEndpoint,
      monthlyQuotaCents: dto.monthlyQuotaCents,
      expiresAt:
        dto.expiresAt === undefined
          ? undefined
          : dto.expiresAt === null
            ? null
            : new Date(dto.expiresAt),
      isActive: dto.isActive,
      updatedBy: req.user.email,
    });
    return this.service.getView(id);
  }

  @Delete(":id")
  async deactivate(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    await this.service.deactivate(id, req.user.email);
    return { success: true };
  }

  @Post(":id/assign")
  async assign(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: AssignKeyDto,
  ) {
    return this.assignments.assign({
      keyId: id,
      userId: dto.userId,
      userQuotaCents: dto.userQuotaCents ?? null,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      assignedBy: req.user.email,
      note: dto.note,
    });
  }

  /**
   * ★ 2026-05-05 [task #27 严格 BYOK 风险 1+4 — admin self-assign 一键]
   *
   * 严格 BYOK 后 admin 自己没 PERSONAL key 时调 LLM 失败（KeyResolver 不再
   * fallback SYSTEM）。提供本入口让 admin 一键把所有 active distributable-keys
   * 全部 assign 给自己（quota=null 无限），保留 admin 的可调用性。
   *
   * 行为：
   *   - 列出所有 isActive=true 的 distributable-keys
   *   - 跳过当前 admin 已有 active assignment 的 key
   *   - 其余创建 assignment(userId=adminId, userQuotaCents=null, expiresAt=null)
   *
   * 返回：{ assigned: 新建数量, skipped: 已有数量, total: distributable-keys 总数 }
   */
  @Post("self-assign-all")
  async selfAssignAll(@Req() req: AuthenticatedRequest): Promise<{
    assigned: number;
    skipped: number;
    total: number;
  }> {
    const adminId = req.user.id;
    const adminEmail = req.user.email;
    const allKeys = await this.service.list({ isActive: true });
    let assigned = 0;
    let skipped = 0;
    for (const key of allKeys) {
      // 检查当前 admin 是否已有该 key 的 active assignment
      const existing = await this.assignments
        .resolveActive(adminId, key.provider)
        .catch(() => null);
      if (existing && existing.keyId === key.id) {
        skipped++;
        continue;
      }
      try {
        await this.assignments.assign({
          keyId: key.id,
          userId: adminId,
          userQuotaCents: null, // 无限配额
          expiresAt: null, // 永不过期
          assignedBy: adminEmail,
          note: "self-assigned via admin one-click",
        });
        assigned++;
      } catch {
        // 可能是 (keyId, userId) 唯一约束冲突（已分配过但状态非 ACTIVE）
        skipped++;
      }
    }
    return { assigned, skipped, total: allKeys.length };
  }
}
