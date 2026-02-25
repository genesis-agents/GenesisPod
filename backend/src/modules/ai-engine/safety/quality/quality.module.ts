/**
 * AI Engine - Quality Module
 * 质量控制模块
 */

import { Module, OnModuleInit, Logger } from "@nestjs/common";
import { QualityGateService } from "./services/quality-gate.service";
import { QualityRegistryService } from "./services/quality-registry.service";
import { DiversityChecker } from "./checkers/diversity.checker";
import { ConsistencyChecker } from "./checkers/consistency.checker";
import { FactualChecker } from "./checkers/factual.checker";
import { CoherenceChecker } from "./checkers/coherence.checker";

@Module({
  providers: [
    QualityGateService,
    QualityRegistryService,
    DiversityChecker,
    ConsistencyChecker,
    FactualChecker,
    CoherenceChecker,
  ],
  exports: [
    QualityGateService,
    QualityRegistryService,
    DiversityChecker,
    ConsistencyChecker,
    FactualChecker,
    CoherenceChecker,
  ],
})
export class QualityModule implements OnModuleInit {
  private readonly logger = new Logger(QualityModule.name);

  constructor(
    private readonly qualityGate: QualityGateService,
    private readonly diversityChecker: DiversityChecker,
    private readonly consistencyChecker: ConsistencyChecker,
    private readonly factualChecker: FactualChecker,
    private readonly coherenceChecker: CoherenceChecker,
  ) {}

  /**
   * 模块初始化时自动注册所有检查器
   */
  onModuleInit() {
    // 注册所有检查器到 QualityGateService
    this.qualityGate.registerChecker(this.diversityChecker);
    this.qualityGate.registerChecker(this.consistencyChecker);
    this.qualityGate.registerChecker(this.factualChecker);
    this.qualityGate.registerChecker(this.coherenceChecker);

    this.logger.log(
      `Quality checkers registered: ${this.qualityGate.getAvailableCheckers().join(", ")}`,
    );
  }
}
