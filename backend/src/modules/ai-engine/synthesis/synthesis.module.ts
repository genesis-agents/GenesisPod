/**
 * Synthesis Module
 * AI Engine 核心能力 - 报告合成通用模块
 *
 * 提供跨模块共享的报告合成原子操作。
 * AIEngineFacade 通过 @Global() 自动可用。
 */

import { Module } from "@nestjs/common";
import { ReportSynthesisEngine } from "./report-synthesis.service";

@Module({
  providers: [ReportSynthesisEngine],
  exports: [ReportSynthesisEngine],
})
export class SynthesisModule {}
