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
import { KeyAssignmentStatus } from "@prisma/client";
import { JwtAuthGuard } from "../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../common/guards/admin.guard";
import {
  KeyAssignmentsService,
  type RecurrenceUnit,
  type ValidityType,
} from "../../ai-infra/credentials/key-assignments/key-assignments.service";
import {
  RevokeAssignmentDto,
  UpdateAssignmentDto,
} from "../../ai-infra/credentials/distributable-keys/dto";

// PR-B 2026-05-08: 模型粒度批量授权 DTO
interface GrantBatchModelDto {
  modelId: string;
  userQuotaCents?: number | null;
}

interface GrantBatchDto {
  userId: string;
  models: GrantBatchModelDto[];
  validityType: ValidityType; // 'ONE_TIME' | 'RECURRING'
  expiresAt?: string | null; // ISO date string for ONE_TIME
  recurrenceUnit?: RecurrenceUnit;
  recurrenceInterval?: number;
  note?: string;
}

interface AuthenticatedRequest {
  user: { id: string; email: string };
}

@ApiTags("Admin - Key Assignments")
@Controller("admin/key-assignments")
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminKeyAssignmentsController {
  constructor(private readonly service: KeyAssignmentsService) {}

  @Get()
  async list(
    @Query("status") status?: string,
    @Query("provider") provider?: string,
    @Query("take") take?: string,
    @Query("skip") skip?: string,
  ) {
    const parsedStatus =
      status &&
      Object.values(KeyAssignmentStatus).includes(status as KeyAssignmentStatus)
        ? (status as KeyAssignmentStatus)
        : undefined;
    const items = await this.service.listAll({
      status: parsedStatus,
      provider,
      take: take ? Number(take) : undefined,
      skip: skip ? Number(skip) : undefined,
    });
    return { items };
  }

  @Patch(":id")
  async update(@Param("id") id: string, @Body() dto: UpdateAssignmentDto) {
    const status: KeyAssignmentStatus | undefined =
      dto.status === "ACTIVE" || dto.status === "SUSPENDED"
        ? (dto.status as KeyAssignmentStatus)
        : undefined;
    return this.service.update(id, {
      userQuotaCents:
        dto.userQuotaCents === undefined ? undefined : dto.userQuotaCents,
      expiresAt:
        dto.expiresAt === undefined
          ? undefined
          : dto.expiresAt === null
            ? null
            : new Date(dto.expiresAt),
      note: dto.note === undefined ? undefined : dto.note,
      status,
    });
  }

  @Delete(":id")
  async revoke(
    @Req() req: AuthenticatedRequest,
    @Param("id") id: string,
    @Body() dto: RevokeAssignmentDto,
  ) {
    return this.service.revoke(id, req.user.email, dto.reason);
  }

  /**
   * PR-B 2026-05-08: 模型粒度批量授权
   *
   * Admin 在用户列表行内点 🔑 → 选 N 个模型 → 一次提交。
   * 后端按 model 找 provider → 选最低利用率 active pool → 创建 KeyAssignment。
   *
   * 单 model 失败不阻塞其他，返回 succeeded[] + failed[]。
   *
   * Body 示例：
   * {
   *   "userId": "alice-uuid",
   *   "models": [
   *     { "modelId": "gpt-4o", "userQuotaCents": 2000 },
   *     { "modelId": "claude-opus-4", "userQuotaCents": 3000 }
   *   ],
   *   "validityType": "RECURRING",
   *   "recurrenceUnit": "MONTH",
   *   "recurrenceInterval": 1,
   *   "note": "VIP 季度套餐"
   * }
   */
  @Post("grant")
  async grant(@Req() req: AuthenticatedRequest, @Body() dto: GrantBatchDto) {
    return this.service.grantBatch({
      userId: dto.userId,
      models: dto.models,
      validityType: dto.validityType,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      recurrenceUnit: dto.recurrenceUnit,
      recurrenceInterval: dto.recurrenceInterval,
      assignedBy: req.user.email,
      note: dto.note,
    });
  }
}
