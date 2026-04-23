/**
 * ST-00-INIT · 初始化
 *
 * 职责：建立 cache prefix / budget（已在 buildIdentityContext 做）
 *       + 创建 draft report + 记录 started timestamp
 * 当前为骨架：draftReportId 直接沿用 identity.reportId（mission-execution 预先创建）
 */

import { Injectable } from "@nestjs/common";
import type {
  PipelineIdentityContext,
  Stage,
  StageResults,
} from "../pipeline/types";
import type { InitStageOutput } from "./stage-context";

@Injectable()
export class InitStage implements Stage<void, InitStageOutput> {
  readonly id = "ST-00-INIT" as const;
  readonly name = "Initialize pipeline";
  readonly dependsOn = [];
  readonly runsWhen = "always" as const;
  readonly slo = { p95Ms: 500, maxTokens: 0, targetSuccessRate: 0.99 };
  readonly emitsEvents = ["pipeline:init"];

  // eslint-disable-next-line @typescript-eslint/require-await
  async prepare(
    _identity: PipelineIdentityContext,
    _upstream: StageResults,
  ): Promise<void> {
    return undefined;
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async execute(
    identity: PipelineIdentityContext,
    _input: void,
    _signal: AbortSignal,
  ): Promise<InitStageOutput> {
    return {
      draftReportId: identity.reportId,
      cachePrefix: identity.cachePrefix,
      startedAt: new Date().toISOString(),
    };
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async persist(
    _identity: PipelineIdentityContext,
    _output: InitStageOutput,
  ): Promise<void> {
    // Tier Core Group E 接入真实 DB（当前 no-op）
  }
}
