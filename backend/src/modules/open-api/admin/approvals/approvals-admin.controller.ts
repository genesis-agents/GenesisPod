import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiTags, ApiOperation, ApiResponse } from "@nestjs/swagger";
import { JwtAuthGuard } from "../../../../common/guards/jwt-auth.guard";
import { AdminGuard } from "../../../../common/guards/admin.guard";
import { PrismaService } from "../../../../common/prisma/prisma.service";

// ─── Types ────────────────────────────────────────────────

interface ApprovalRequestPayload {
  requestId: string;
  approvalType: "confirm" | "choose" | "input" | "review";
  prompt: string;
  context?: {
    summary?: string;
    details?: unknown;
    preview?: string;
  };
  choices?: { id: string; label: string; description?: string }[];
  defaultAction?: string;
  status: "pending" | "responded";
  createdAt: string;
}

interface RespondDto {
  approved: boolean;
  choice?: string;
  input?: unknown;
  feedback?: string;
}

// ─── Controller ───────────────────────────────────────────

/**
 * 人机协作审批 Admin 控制器
 *
 * 提供两个端点：
 * - GET  /admin/approvals/pending     → 列出所有等待人类审批的请求
 * - POST /admin/approvals/:id/respond → 提交人类审批响应（写入 DB，唤醒轮询器）
 */
@ApiTags("Admin - Human Approvals")
@Controller("admin/approvals")
@UseGuards(JwtAuthGuard, AdminGuard)
export class ApprovalsAdminController implements OnModuleInit {
  private readonly logger = new Logger(ApprovalsAdminController.name);
  private memoryTableReady = false;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    try {
      const result = await this.prisma.$queryRaw<[{ exists: boolean }]>(
        Prisma.sql`SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='long_term_memories') AS "exists"`,
      );
      this.memoryTableReady = result[0]?.exists ?? false;
    } catch {
      this.memoryTableReady = false;
    }
    if (!this.memoryTableReady) {
      this.logger.warn(
        "[ApprovalsAdmin] long_term_memories table not found — approval endpoints will be degraded until migration runs",
      );
    }
  }

  /**
   * 列出所有 pending 审批请求
   * HumanApprovalTool 以 key = "approval:request:{requestId}" 存储到 LongTermMemory
   */
  @Get("pending")
  @ApiOperation({ summary: "List all pending human approval requests" })
  @ApiResponse({
    status: 200,
    description: "Array of pending approval payloads",
  })
  async listPending(): Promise<ApprovalRequestPayload[]> {
    if (!this.memoryTableReady) {
      return [];
    }

    const records = await this.prisma.longTermMemory.findMany({
      where: {
        userId: "system",
        key: { startsWith: "approval:request:" },
      },
      orderBy: { createdAt: "asc" },
    });

    return records
      .map((r) => r.value as unknown as ApprovalRequestPayload)
      .filter((v) => v?.status === "pending");
  }

  /**
   * 响应审批请求
   * 写入 key = "approval:response:{requestId}" → HumanApprovalTool 轮询器检测到后继续执行
   */
  @Post(":requestId/respond")
  @ApiOperation({ summary: "Respond to a pending human approval request" })
  @ApiResponse({ status: 201, description: "Response recorded" })
  async respond(
    @Param("requestId") requestId: string,
    @Body() body: RespondDto,
  ): Promise<{ success: boolean; requestId: string; approved: boolean }> {
    if (!this.memoryTableReady) {
      throw new ServiceUnavailableException(
        "Approval storage is not available — long_term_memories table has not been migrated yet",
      );
    }

    const RESPONSE_KEY = `approval:response:${requestId}`;
    const USER_ID = "system";
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min TTL

    await this.prisma.longTermMemory.upsert({
      where: { userId_key: { userId: USER_ID, key: RESPONSE_KEY } },
      create: {
        userId: USER_ID,
        key: RESPONSE_KEY,
        type: "human_approval_response",
        value: {
          approved: body.approved,
          choice: body.choice ?? null,
          input: body.input ?? null,
          feedback: body.feedback ?? null,
        } as never,
        importance: 10,
        tags: ["human-approval", "response"],
        expiresAt,
      },
      update: {
        value: {
          approved: body.approved,
          choice: body.choice ?? null,
          input: body.input ?? null,
          feedback: body.feedback ?? null,
        } as never,
        expiresAt,
      },
    });

    this.logger.log(
      `[ApprovalsAdmin] Responded to [${requestId}]: approved=${body.approved}`,
    );

    return { success: true, requestId, approved: body.approved };
  }
}
