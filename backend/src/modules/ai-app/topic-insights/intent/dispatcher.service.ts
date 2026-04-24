/**
 * DispatcherService — AG-17-LDP 对外入口
 *
 * 把 LeaderDispatcher spec agent 包装为一个明确的、可被 L5 intent-gateway 或其它
 * consumer 调用的服务：
 *
 *   dispatch({ userPrompt, hasExistingReport, lastReportSummary })
 *     → { intent: "new_research" | "refine_report" | "answer_followup" | "restart_mission",
 *         confidence: 0-1,
 *         reasoning: string }
 *
 * 失败语义：AG-17-LDP 不可用时回落 deterministic fallback（默认
 * hasExistingReport ? refine_report : new_research），不抛异常。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { SpecAgentRegistry } from "@/modules/ai-engine/harness";
import type { LeaderDispatcherInput } from "@/modules/ai-app/topic-insights/agents/specs";
import type { LeaderDispatchDecision } from "@/modules/ai-app/topic-insights/agents/specs/schemas";

export interface DispatchRequest {
  readonly userPrompt: string;
  readonly hasExistingReport: boolean;
  readonly lastReportSummary?: string;
  /** 可选：用于 AbortSignal 传播 */
  readonly signal?: AbortSignal;
}

export interface DispatchResponse {
  readonly intent: LeaderDispatchDecision["intent"];
  readonly confidence: number;
  readonly reasoning: string;
  /** true = 来自 AG-17-LDP；false = deterministic fallback */
  readonly fromAgent: boolean;
}

@Injectable()
export class DispatcherService {
  private readonly logger = new Logger(DispatcherService.name);

  constructor(@Optional() private readonly agentRegistry?: SpecAgentRegistry) {}

  async dispatch(req: DispatchRequest): Promise<DispatchResponse> {
    const fallback = (): DispatchResponse => ({
      intent: req.hasExistingReport ? "refine_report" : "new_research",
      confidence: 0.5,
      reasoning: "deterministic fallback (agent unavailable)",
      fromAgent: false,
    });

    if (!this.agentRegistry) return fallback();

    const agent = this.agentRegistry.get<
      LeaderDispatcherInput,
      LeaderDispatchDecision
    >("AG-17-LDP");
    if (!agent) return fallback();

    try {
      const res = await agent.executeSpec({
        userPrompt: req.userPrompt,
        hasExistingReport: req.hasExistingReport,
        lastReportSummary: req.lastReportSummary,
      });
      if (res.state !== "completed") {
        this.logger.warn(
          `AG-17-LDP failed: ${res.errors?.join("; ") ?? "unknown"} — using fallback`,
        );
        return fallback();
      }
      return {
        intent: res.output.intent,
        confidence: res.output.confidence,
        reasoning: res.output.reasoning,
        fromAgent: true,
      };
    } catch (err) {
      this.logger.warn(
        `AG-17-LDP failed: ${err instanceof Error ? err.message : String(err)} — using fallback`,
      );
      return fallback();
    }
  }
}
