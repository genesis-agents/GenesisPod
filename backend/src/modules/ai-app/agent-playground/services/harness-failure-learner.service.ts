/**
 * HarnessFailureLearner — 跨 mission 失败模式记忆
 *
 * 不引入新模块、不创建新架构层。挂在 agent-playground 现有 services 下，
 * orchestrator 直接注入使用。功能：
 *
 *   1. recordFailure：每次单维度/单 agent 失败后记一条；同 (agent, model,
 *      prompt 前缀, failureCode) 已存在则 count++，更新 lastDiagnostic
 *   2. lookupFallback：mission 启动前/降级路径中检索 —— 已知会撞墙的组合直接
 *      返回 lastFallbackModel，跳过浪费 token 的重蹈覆辙
 *   3. recordSuccess：fallback 成功跑通时把 lastFallbackModel 标稳，下次直接用
 *
 * 表 harness_failure_patterns 已建好（migration 20260426e）。
 */
import { Injectable, Logger } from "@nestjs/common";
import { createHash } from "crypto";
import { PrismaService } from "../../../../common/prisma/prisma.service";

export interface FailurePatternKey {
  agentSpecId: string;
  modelId: string;
  /** systemPrompt 原文（service 自己 hash） */
  systemPrompt: string;
  failureCode: string;
}

export interface FailurePatternHit {
  count: number;
  lastFallbackModel?: string;
  lastDiagnostic?: Record<string, unknown>;
  resolved: boolean;
  firstSeenAt: Date;
  lastSeenAt: Date;
}

@Injectable()
export class HarnessFailureLearner {
  private readonly log = new Logger(HarnessFailureLearner.name);

  constructor(private readonly prisma: PrismaService) {}

  private hashPrompt(systemPrompt: string): string {
    return createHash("sha256").update(systemPrompt).digest("hex").slice(0, 16);
  }

  /** 记录一次失败（同 key 计数+1，更新 lastDiagnostic） */
  async recordFailure(input: {
    key: FailurePatternKey;
    missionId: string;
    userId: string;
    diagnostic?: Record<string, unknown>;
  }): Promise<void> {
    const promptHashPrefix = this.hashPrompt(input.key.systemPrompt);
    try {
      await this.prisma.harnessFailurePattern.upsert({
        where: {
          agentSpecId_modelId_promptHashPrefix_failureCode: {
            agentSpecId: input.key.agentSpecId,
            modelId: input.key.modelId,
            promptHashPrefix,
            failureCode: input.key.failureCode,
          },
        },
        create: {
          agentSpecId: input.key.agentSpecId,
          modelId: input.key.modelId,
          promptHashPrefix,
          failureCode: input.key.failureCode,
          count: 1,
          lastMissionId: input.missionId,
          lastUserId: input.userId,
          lastDiagnostic: input.diagnostic
            ? (input.diagnostic as object)
            : undefined,
        },
        update: {
          count: { increment: 1 },
          lastMissionId: input.missionId,
          lastUserId: input.userId,
          lastDiagnostic: input.diagnostic
            ? (input.diagnostic as object)
            : undefined,
        },
      });
    } catch (err) {
      // 学习失败不能阻断 mission；只记日志
      this.log.warn(
        `recordFailure upsert failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  /**
   * 查询某 (agent, model, prompt 前缀) 是否已有失败记录。
   * 调用方在调 LLM 前用 systemPrompt + 选定 model 查一次：
   *   - 命中且 count >= threshold → 直接走 lastFallbackModel（如有）
   *   - 没命中 → 正常调用
   */
  async lookup(input: {
    agentSpecId: string;
    modelId: string;
    systemPrompt: string;
  }): Promise<FailurePatternHit[]> {
    const promptHashPrefix = this.hashPrompt(input.systemPrompt);
    try {
      const records = await this.prisma.harnessFailurePattern.findMany({
        where: {
          agentSpecId: input.agentSpecId,
          modelId: input.modelId,
          promptHashPrefix,
        },
        orderBy: { lastSeenAt: "desc" },
        take: 5,
      });
      return records.map((r) => ({
        count: r.count,
        lastFallbackModel: r.lastFallbackModel ?? undefined,
        lastDiagnostic:
          (r.lastDiagnostic as Record<string, unknown>) ?? undefined,
        resolved: r.resolved,
        firstSeenAt: r.firstSeenAt,
        lastSeenAt: r.lastSeenAt,
      }));
    } catch (err) {
      this.log.warn(
        `lookup failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }

  /**
   * 记录一次"原 model 失败 → 切到 fallback model 后跑通"的成功 workaround。
   * 让下次同 key 命中时直接走这个 fallback。
   */
  async recordSuccessfulFallback(input: {
    key: FailurePatternKey;
    fallbackModelId: string;
  }): Promise<void> {
    const promptHashPrefix = this.hashPrompt(input.key.systemPrompt);
    try {
      await this.prisma.harnessFailurePattern.updateMany({
        where: {
          agentSpecId: input.key.agentSpecId,
          modelId: input.key.modelId,
          promptHashPrefix,
          failureCode: input.key.failureCode,
        },
        data: {
          lastFallbackModel: input.fallbackModelId,
          resolved: true,
        },
      });
    } catch (err) {
      this.log.warn(
        `recordSuccessfulFallback failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
