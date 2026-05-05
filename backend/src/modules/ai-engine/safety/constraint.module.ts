/**
 * AI Engine Constraint Module
 * 约束引擎子模块
 *
 * 提供:
 * - Schema Validator
 * - Content Filter (Guardrail)
 * - Cost Controller (Guardrail)
 * - Rate Limiter (Guardrail)
 * - Guardrails Pipeline (New Framework)
 */

import { Global, Module, OnModuleInit, Logger } from "@nestjs/common";
import { CacheModule } from "@/common/cache/cache.module";

// Validators
import { SchemaValidator } from "./constraint/validators/schema-validator";

// Resilience（PR-X3：通用熔断器从 harness 搬到 engine）
import { CircuitBreakerService } from "./resilience/circuit-breaker.service";
// W1-a-fixup（2026-05-04）：rate-limit 从误分类的 plugin 形态回归 ai-engine 核心 service
import { RateLimitService } from "./resilience/rate-limit.service";

// Security（PR-X3：CapabilityGuard 从 harness 搬到 engine）
import { CapabilityGuardService } from "./security/capability-guard.service";

// Guardrails (Legacy)
import { ContentFilter } from "./constraint/guardrails/content-filter";
// CostController / RateLimiter 由 ai-harness/RuntimeResourceModule (@Global) 提供，
// 任何模块都能直接注入 — engine 不再反向 import。

// Guardrails Pipeline (New Framework)
import { GuardrailsPipelineService } from "./guardrails/guardrails-pipeline.service";

// Input Guardrails
import {
  PromptInjectionDetector,
  ContentSafetyFilter,
  InputComplexityCheck,
} from "./guardrails/input";

// Output Guardrails
import { ContentComplianceCheck } from "./guardrails/output";

/**
 * Content Filter Factory
 */
const contentFilterFactory = {
  provide: ContentFilter,
  useFactory: () => {
    return new ContentFilter();
  },
};

@Global()
@Module({
  imports: [CacheModule],
  providers: [
    // Validators
    SchemaValidator,

    // Resilience
    CircuitBreakerService,
    RateLimitService,

    // Security
    CapabilityGuardService,

    // Guardrails (Legacy)
    contentFilterFactory,

    // Guardrails Pipeline (New Framework)
    GuardrailsPipelineService,

    // Input Guardrails
    PromptInjectionDetector,
    ContentSafetyFilter,
    InputComplexityCheck,

    // Output Guardrails
    ContentComplianceCheck,
  ],
  exports: [
    SchemaValidator,
    ContentFilter,
    CircuitBreakerService,
    RateLimitService,
    CapabilityGuardService,
    GuardrailsPipelineService,
  ],
})
export class AiEngineConstraintModule implements OnModuleInit {
  private readonly logger = new Logger(AiEngineConstraintModule.name);

  constructor(
    private readonly guardrailsPipeline: GuardrailsPipelineService,
    private readonly promptInjectionDetector: PromptInjectionDetector,
    private readonly contentSafetyFilter: ContentSafetyFilter,
    private readonly inputComplexityCheck: InputComplexityCheck,
    private readonly contentComplianceCheck: ContentComplianceCheck,
  ) {}

  onModuleInit() {
    // Register input guardrails
    this.guardrailsPipeline.registerInputGuardrail(
      this.promptInjectionDetector,
    );
    this.guardrailsPipeline.registerInputGuardrail(this.contentSafetyFilter);
    this.guardrailsPipeline.registerInputGuardrail(this.inputComplexityCheck);

    // Register output guardrails
    this.guardrailsPipeline.registerOutputGuardrail(
      this.contentComplianceCheck,
    );

    const count = this.guardrailsPipeline.getCount();
    this.logger.log(
      `Guardrails Pipeline initialized: ${count.input} input guardrails, ${count.output} output guardrails`,
    );
  }
}
