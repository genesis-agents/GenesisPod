/**
 * PrismaVerificationStore — multi-judge 审核结果持久化（topic-insights 专属）
 *
 * 归属：L3 ai-app/topic-insights/agent/adapters/
 */

import { Injectable } from "@nestjs/common";
import { PrismaService } from "@/common/prisma/prisma.service";
import { toPrismaJson } from "@/common/utils/prisma-json.utils";
import type {
  VerificationStore,
  VerificationResult,
} from "@/modules/ai-engine/harness/runtime";

@Injectable()
export class PrismaVerificationStore implements VerificationStore {
  constructor(private readonly prisma: PrismaService) {}

  async write(
    result: VerificationResult,
    _metadata: Record<string, unknown>,
  ): Promise<string> {
    const row = await this.prisma.verificationRecord.create({
      data: {
        taskId: result.taskId,
        iteration: result.iteration,
        judgeVerdicts: toPrismaJson(result.verdicts),
        consensus: result.decision.verdict,
        decidedScore: result.decision.score,
        metaJudgeNote: result.decision.note,
      },
      select: { id: true },
    });
    return row.id;
  }
}
