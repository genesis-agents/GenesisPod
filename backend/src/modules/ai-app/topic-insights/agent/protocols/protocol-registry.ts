/**
 * ProtocolRegistry — taskType → TaskExecutionProtocol 路由
 *
 * 归属：L3 ai-app/topic-insights/agent/protocols/
 *
 * 编排层通过 registry.get(taskType) 拿到 protocol，传给 harness ReActRunner.execute。
 */

import { Injectable, Logger } from "@nestjs/common";
import type {
  TaskExecutionProtocol,
  ProtocolRegistry as ProtocolRegistryInterface,
} from "@/modules/ai-engine/harness/runtime";
import type { ResearchTaskMetadata } from "../adapters/research-task-metadata";

import { createDimensionResearchProtocol } from "./dimension-research.protocol";
import { createSectionWriteProtocol } from "./section-write.protocol";
import { createQualityReviewProtocol } from "./quality-review.protocol";
import { createReportSynthesisProtocol } from "./report-synthesis.protocol";
import { createFactCheckProtocol } from "./fact-check.protocol";

/**
 * Registry 持有所有已注册 protocol。默认自动注册 topic-insights 5 个 protocol。
 * Phase 4 verification 就位后，通过 registerJudges(taskType, judges) 注入 judge。
 */
@Injectable()
export class ProtocolRegistry implements ProtocolRegistryInterface<ResearchTaskMetadata> {
  private readonly logger = new Logger(ProtocolRegistry.name);
  private readonly protocols = new Map<
    string,
    TaskExecutionProtocol<unknown, ResearchTaskMetadata>
  >();

  constructor() {
    this.protocols.set(
      "dimension_research",
      createDimensionResearchProtocol() as TaskExecutionProtocol<
        unknown,
        ResearchTaskMetadata
      >,
    );
    this.protocols.set(
      "section_write",
      createSectionWriteProtocol() as TaskExecutionProtocol<
        unknown,
        ResearchTaskMetadata
      >,
    );
    this.protocols.set(
      "quality_review",
      createQualityReviewProtocol() as TaskExecutionProtocol<
        unknown,
        ResearchTaskMetadata
      >,
    );
    this.protocols.set(
      "report_synthesis",
      createReportSynthesisProtocol() as TaskExecutionProtocol<
        unknown,
        ResearchTaskMetadata
      >,
    );
    this.protocols.set(
      "fact_check",
      createFactCheckProtocol() as TaskExecutionProtocol<
        unknown,
        ResearchTaskMetadata
      >,
    );
    this.logger.log(
      `ProtocolRegistry ready — ${this.protocols.size} protocols registered: [${[...this.protocols.keys()].join(", ")}]`,
    );
  }

  get<TResult>(
    taskType: string,
  ): TaskExecutionProtocol<TResult, ResearchTaskMetadata> | undefined {
    return this.protocols.get(taskType) as
      | TaskExecutionProtocol<TResult, ResearchTaskMetadata>
      | undefined;
  }

  mustGet<TResult>(
    taskType: string,
  ): TaskExecutionProtocol<TResult, ResearchTaskMetadata> {
    const p = this.get<TResult>(taskType);
    if (!p)
      throw new Error(
        `[ProtocolRegistry] no protocol for taskType='${taskType}'`,
      );
    return p;
  }

  listTypes(): string[] {
    return Array.from(this.protocols.keys());
  }
}
