/**
 * API Caller Self-Heal Trigger Service
 *
 * v3.1 阶段 D.1 (2026-05-24)：从 AiApiCallerService god-class 中抽出的
 * self-heal 触发逻辑。每个 provider 的 catch 块原本会内联调用一段
 * `extractErrorSignal → maybeSelfHeal` 流程；现在统一委派给本 service。
 *
 * 职责（单一）：
 *   - 在 LLM API 调用 catch 块中被调用
 *   - 命中能力错误形态（4xx + 已识别 errorCode）→ 异步触发 CapabilitySelfHealService.maybeSelfHeal
 *   - 非命中 / 未注入 / 缺 userModelConfigId → 静默 noop
 *   - fire-and-forget：不阻断 caller 的 throw，self-heal 异步异常仅 warn
 *
 * 决策语义与 v3.1 §B+.3 一致：
 *   - 仅 BYOK 路径触发（userModelConfigId 必填）
 *   - 当前只针对 structuredOutput.nativeMode 自降级（json_schema → none）
 *
 * **不要在本 service 加业务判断**——它只是一个 thin trigger，所有阈值 /
 * cooling-off / advisory lock 决策都在 CapabilitySelfHealService 内。
 */

import { Injectable, Logger, Optional } from "@nestjs/common";
import { CapabilitySelfHealService } from "../capability/capability-self-heal.service";
import { extractErrorSignal } from "../capability/error-signal.types";

export interface SelfHealTriggerOptions {
  /** 模型 id（仅用于日志，不参与决策） */
  modelId: string;
  /**
   * 用户模型配置 id：self-heal 写入面唯一作用对象。
   * 缺失（系统级模型 / 旧调用方）→ 不触发。
   */
  userModelConfigId?: string;
}

@Injectable()
export class ApiCallerSelfHealTriggerService {
  private readonly logger = new Logger(ApiCallerSelfHealTriggerService.name);

  constructor(
    // @Optional 保留 BC：旧单测可不注入 self-heal service（trigger 静默）
    @Optional()
    private readonly capabilitySelfHealService?: CapabilitySelfHealService,
  ) {}

  /**
   * catch 块调用入口（fire-and-forget；调用方仍须自行 throw err）。
   *
   * 命中条件：
   *   1. userModelConfigId 非空（BYOK 路径）
   *   2. self-heal service 已注入
   *   3. extractErrorSignal 能从 err 抽出严格信号（4xx + 已识别 errorCode）
   *
   * 异步 maybeSelfHeal 抛错 → warn 日志，不传播
   */
  triggerSelfHealAsync(err: unknown, opts: SelfHealTriggerOptions): void {
    const { modelId, userModelConfigId } = opts;
    if (!userModelConfigId || !this.capabilitySelfHealService) return;
    const signal = extractErrorSignal(err);
    if (signal === null) return;
    void this.capabilitySelfHealService
      .maybeSelfHeal({
        target: { kind: "user_model_config", id: userModelConfigId },
        field: "structuredOutput.nativeMode",
        fromValue: "json_schema",
        toValue: "none",
        errorSignal: signal,
      })
      .catch((e: unknown) =>
        this.logger.warn(
          `[self-heal-trigger] modelId=${modelId}: ${String(e).slice(0, 200)}`,
        ),
      );
  }
}
