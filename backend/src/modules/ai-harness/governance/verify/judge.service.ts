/**
 * JudgeService — AI App / ReflexionLoop 的唯一 verifier 入口
 *
 * 设计分层：
 *   - verify/        ← AI App 唯一进入点（轻量，依赖 AiChatService），本文件
 *   - runtime/verification/ ← ReActRunner 内部 JudgeSpec 工厂（签名重 + 纯算法 consensus/MetaJudge）
 *
 * 共享算法（createConsensusResolver / MetaJudge / Verdict 类型）从
 * runtime/verification/ re-export 出去，App 永远只 `import from "@/ai-engine/harness/verify"`。
 *
 * 内置 verifiers：
 *   - self      · 同模型严苛自评（低 temp）
 *   - external  · 独立评审视角（不同模型族）
 *   - critical  · 批判性审查（找逻辑漏洞 / 缺论证 / 过度自信）
 *
 * Consensus：
 *   - 单 verifier 直接返回；多 verifier 走 createConsensusResolver（复用 runtime 算法）
 *   - 分歧严重时由 MetaJudge 仲裁
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiChatService } from "../../../ai-engine/llm/services/ai-chat.service";
import type { IVerifier } from "../../execution/loop/reflexion-loop";
import type { IContextEnvelope } from "../../kernel/abstractions";
import { createConsensusResolver } from "../../runtime/verification/consensus";
import type { Verdict, ConsensusDecision } from "../../runtime/types";
import { AIModelType } from "@prisma/client";
import { KernelContext } from "../../../../common/context/kernel-context";

export type BuiltInVerifierId = "self" | "external" | "critical";

const SELF_PROMPT = `You are a strict self-evaluator. Re-read the draft critically.
Score 0-100 across: accuracy, completeness, coherence, evidence, originality.
Be tough — flag any vague or unsupported claims.

Output JSON only:
{ "score": 0-100, "critique": "<= 400 chars" }`;

const EXTERNAL_PROMPT = `You are an independent senior reviewer from a different model family.
Evaluate the draft impartially across accuracy, completeness, coherence, evidence, originality.
If there is any obvious flaw the score must be < 60.

Output JSON only:
{ "score": 0-100, "critique": "<= 400 chars" }`;

const CRITICAL_PROMPT = `You are a critical-review specialist. Look for:
  - logical fallacies / non-sequiturs
  - missing counter-arguments
  - over-confident claims without evidence
  - unstated assumptions

Score 0-100. Lower scores for any flaw found.

Output JSON only:
{ "score": 0-100, "critique": "<= 400 chars" }`;

const PROMPTS: Record<BuiltInVerifierId, string> = {
  self: SELF_PROMPT,
  external: EXTERNAL_PROMPT,
  critical: CRITICAL_PROMPT,
};

@Injectable()
export class JudgeService {
  private readonly logger = new Logger(JudgeService.name);

  constructor(private readonly chat: AiChatService) {}

  /** 创建一个内置 verifier。可在 spec.verifiers 里直接 by-id 引用。 */
  createVerifier(id: BuiltInVerifierId): IVerifier {
    return {
      id,
      evaluate: async ({ output, signal }) => {
        const draft =
          typeof output === "string" ? output : JSON.stringify(output, null, 2);
        try {
          const res = await this.chat.chat({
            systemPrompt: PROMPTS[id],
            messages: [
              {
                role: "user",
                content: `Evaluate this draft:\n\n${draft.slice(0, 8000)}`,
              },
            ],
            taskProfile: { creativity: "deterministic", outputLength: "short" },
            responseFormat: "json",
            // 系统配置感知 + BYOK：让 chat() 走 user default → DB default 链路
            modelType: AIModelType.CHAT,
            userId: KernelContext.get()?.userId,
            signal,
          });
          const parsed = this.parseVerdict(res.content);
          return parsed ?? { score: 50, critique: "judge LLM parse failed" };
        } catch (err) {
          this.logger.warn(
            `[judge:${id}] evaluation failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          return { score: 50, critique: `judge error: ${String(err)}` };
        }
      },
    };
  }

  /**
   * 用一组 verifier id 直接拼一组 IVerifier 数组（喂给 ReflexionLoop spec.verifiers）。
   */
  createVerifiers(ids: readonly BuiltInVerifierId[]): IVerifier[] {
    return ids.map((id) => this.createVerifier(id));
  }

  /**
   * 直接对 output 跑一组 verifier 并 consensus。返回 ConsensusDecision。
   * 业务方需要"先算分再决定下一步"时用此入口（ReflexionLoop 内部不用此 API）。
   */
  async judgeWithConsensus(input: {
    output: unknown;
    envelope: IContextEnvelope;
    verifierIds: readonly BuiltInVerifierId[];
    signal?: AbortSignal;
    passThreshold?: number;
  }): Promise<{ verdicts: Verdict[]; decision: ConsensusDecision }> {
    const verifiers = this.createVerifiers(input.verifierIds);
    const verdicts: Verdict[] = await Promise.all(
      verifiers.map(async (v) => {
        const r = await v.evaluate({
          output: input.output,
          envelope: input.envelope,
          signal: input.signal,
        });
        return { judgeId: v.id, score: r.score, critique: r.critique };
      }),
    );
    const resolver = createConsensusResolver({
      passThreshold: input.passThreshold ?? 70,
    });
    return { verdicts, decision: resolver(verdicts) };
  }

  private parseVerdict(
    raw: string,
  ): { score: number; critique: string } | null {
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fence) text = fence[1];
    try {
      const obj = JSON.parse(text) as { score?: unknown; critique?: unknown };
      if (typeof obj.score === "number") {
        return {
          score: Math.max(0, Math.min(100, obj.score)),
          critique:
            typeof obj.critique === "string" ? obj.critique.slice(0, 500) : "",
        };
      }
    } catch {
      // fall through
    }
    return null;
  }
}
