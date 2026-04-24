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

import { Module, OnModuleInit, Logger } from "@nestjs/common";

// Validators
import { SchemaValidator } from "./safety/constraint/validators/schema-validator";

// Guardrails (Legacy)
import { ContentFilter } from "./safety/constraint/guardrails/content-filter";
// ★ L2 internal — direct relative paths (no facade barrel)
import { CostController } from "./runtime/resource/cost-controller";
import { RateLimiter } from "./runtime/resource/rate-limiter";

// Guardrails Pipeline (New Framework)
import { GuardrailsPipelineService } from "./safety/guardrails/guardrails-pipeline.service";

// Input Guardrails
import {
  PromptInjectionDetector,
  ContentSafetyFilter,
  InputComplexityCheck,
} from "./safety/guardrails/input";

// Output Guardrails
import { ContentComplianceCheck } from "./safety/guardrails/output";

/**
 * Content Filter Factory
 */
const contentFilterFactory = {
  provide: ContentFilter,
  useFactory: () => {
    return new ContentFilter();
  },
};

@Module({
  providers: [
    // Validators
    SchemaValidator,

    // Guardrails (Legacy)
    contentFilterFactory,
    CostController,
    RateLimiter,

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
    CostController,
    RateLimiter,
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
