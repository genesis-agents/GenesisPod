/**
 * HarnessDispatcherService — AG-17-LDP 对外入口
 *
 * 把 LeaderDispatcherAgent 包装为一个明确的、可被 L5 intent-gateway 或其它
 * consumer 调用的服务：
 *
 *   dispatch({ userPrompt, hasExistingReport, lastReportSummary })
 *     → { intent: "new_research" | "refine_report" | "answer_followup" | "restart_mission",
 *         confidence: 0-1,
 *         reasoning: string }
 *
 * 不直接改 mission-execution，也不穿透到 intent-gateway 模块。consumers（例如
 * 未来 L5 intent-gateway）通过 HTTP (HarnessHealthController.dispatch) 或直接
 * import 本 service 调用。
 *
 * 失败语义：AG-17-LDP 不可用时回落 deterministic fallback（默认
 * hasExistingReport ? refine_report : new_research），不抛异常。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import {
  HarnessAgentRegistry,
  type LeaderDispatcherInput,
  type LeaderDispatchDecision,
} from "../harness/agents";
import { buildIdentityContext } from "../pipeline";

export interface DispatchRequest {
  readonly userPrompt: string;
  readonly hasExistingReport: boolean;
  readonly lastReportSummary?: string;
  /** 可选：用于 AbortSignal 传播 */
  readonly signal?: AbortSignal;
  /** 可选：AG-17-LDP 使用的 identity 上下文（missionId 占位可不传） */
  readonly identity?: {
    readonly missionId: string;
    readonly userId: string;
  };
}

export interface DispatchResponse {
  readonly intent: LeaderDispatchDecision["intent"];
  readonly confidence: number;
  readonly reasoning: string;
  /** true = 来自 AG-17-LDP；false = deterministic fallback */
  readonly fromAgent: boolean;
}

@Injectable()
export class HarnessDispatcherService {
  private readonly logger = new Logger(HarnessDispatcherService.name);

  constructor(
    @Optional() private readonly agentRegistry?: HarnessAgentRegistry,
  ) {}

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

    // AG-17-LDP 不依赖完整 pipeline identity，但 BaseAgentRunner 会走 budget.charge。
    // 构建一次性 identity（standard budget，充裕不会触顶）。
    const identity = buildIdentityContext({
      missionId: req.identity?.missionId ?? `harness-dispatch-${Date.now()}`,
      topicId: "dispatch",
      reportId: "dispatch",
      userId: req.identity?.userId ?? "anonymous",
      depth: "standard",
      mode: "fresh",
    });
    const signal = req.signal ?? identity.abortController.signal;

    try {
      const res = await agent.run({
        input: {
          userPrompt: req.userPrompt,
          hasExistingReport: req.hasExistingReport,
          lastReportSummary: req.lastReportSummary,
        },
        identity,
        signal,
      });
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
