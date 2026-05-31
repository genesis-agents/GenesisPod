import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { Registry, Counter, collectDefaultMetrics } from "prom-client";

/**
 * Prometheus 指标服务
 *
 * 自带 process / nodejs 默认指标（collectDefaultMetrics），并把项目内**真实存在**的
 * EventEmitter2 事件接到自定义计数器上自增（非空转）：
 *
 * - `llm.metrics.record`（ai-chat.service.ts emitMetrics）→ 调用数 / token 数
 * - `llm.cost.record`（ai-chat.service.ts emitCostRecord）→ 成本（USD）/ token 数
 * - `llm.span.end`（ai-chat.service.ts emitSpanEnd，guardrail block 时带固定前缀的
 *   error 字符串）→ guardrail 阻断数（input / output 两侧）
 *
 * 说明：PII 脱敏 / mission 终态当前没有可订阅的 EventEmitter2 事件源（仅 logger.warn），
 * 故按"零空转铁律"不建对应空转指标，宁缺毋滥。
 */
@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);
  private readonly registry: Registry;

  private readonly llmCallsTotal: Counter<"status">;
  private readonly llmTokensTotal: Counter<"type">;
  private readonly llmCostUsdTotal: Counter<string>;
  private readonly guardrailBlocksTotal: Counter<"stage">;

  constructor() {
    this.registry = new Registry();

    // 进程 / Node.js 默认指标（CPU、内存、eventloop、GC 等）
    collectDefaultMetrics({
      register: this.registry,
      prefix: "genesis_",
    });

    this.llmCallsTotal = new Counter({
      name: "genesis_llm_calls_total",
      help: "Total number of LLM calls, partitioned by success/error status",
      labelNames: ["status"] as const,
      registers: [this.registry],
    });

    this.llmTokensTotal = new Counter({
      name: "genesis_llm_tokens_total",
      help: "Total number of LLM tokens, partitioned by prompt/completion",
      labelNames: ["type"] as const,
      registers: [this.registry],
    });

    this.llmCostUsdTotal = new Counter({
      name: "genesis_llm_cost_usd_total",
      help: "Total estimated LLM cost in USD",
      registers: [this.registry],
    });

    this.guardrailBlocksTotal = new Counter({
      name: "genesis_guardrail_blocks_total",
      help: "Total number of guardrail blocks, partitioned by input/output stage",
      labelNames: ["stage"] as const,
      registers: [this.registry],
    });
  }

  /**
   * 暴露给 controller 的 registry（用于 GET /metrics 输出）
   */
  getRegistry(): Registry {
    return this.registry;
  }

  /**
   * Prometheus 文本格式输出
   */
  async metrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Prometheus content-type（"text/plain; version=0.0.4; charset=utf-8"）
   */
  contentType(): string {
    return this.registry.contentType;
  }

  // ==================== 真实事件源 → 计数器自增 ====================

  /**
   * ai-chat.service.ts emitMetrics → "llm.metrics.record"
   * 每次 LLM 调用（成功/失败）都会发，承载 token 数与 success 标志。
   */
  @OnEvent("llm.metrics.record")
  onLlmMetricsRecord(payload: {
    success?: boolean;
    inputTokens?: number;
    outputTokens?: number;
  }): void {
    try {
      this.llmCallsTotal.inc({
        status: payload.success === false ? "error" : "success",
      });

      const inputTokens = payload.inputTokens ?? 0;
      const outputTokens = payload.outputTokens ?? 0;
      if (inputTokens > 0) {
        this.llmTokensTotal.inc({ type: "prompt" }, inputTokens);
      }
      if (outputTokens > 0) {
        this.llmTokensTotal.inc({ type: "completion" }, outputTokens);
      }
    } catch (error) {
      this.logger.warn(
        `[metrics] llm.metrics.record handling failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  /**
   * ai-chat.service.ts emitCostRecord → "llm.cost.record"
   * 成功调用带 estimatedCost（USD），单独累计成本。
   */
  @OnEvent("llm.cost.record")
  onLlmCostRecord(payload: { estimatedCost?: number }): void {
    try {
      const cost = payload.estimatedCost ?? 0;
      if (cost > 0) {
        this.llmCostUsdTotal.inc(cost);
      }
    } catch (error) {
      this.logger.warn(
        `[metrics] llm.cost.record handling failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }

  /**
   * ai-chat.service.ts emitSpanEnd → "llm.span.end"
   * guardrail 阻断时 error 带固定前缀（input/output 两套），据此精确归类阻断 stage。
   * 非 guardrail 的 span end（正常结束/其他错误）不计入，避免误增。
   */
  @OnEvent("llm.span.end")
  onLlmSpanEnd(payload: { status?: string; error?: string }): void {
    try {
      const error = payload.error;
      if (typeof error !== "string") return;

      if (error.startsWith("Output blocked by guardrail:")) {
        this.guardrailBlocksTotal.inc({ stage: "output" });
      } else if (error.startsWith("Blocked by guardrail:")) {
        this.guardrailBlocksTotal.inc({ stage: "input" });
      }
    } catch (error) {
      this.logger.warn(
        `[metrics] llm.span.end handling failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
    }
  }
}
