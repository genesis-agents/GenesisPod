/**
 * AI Engine Constraint Module
 * 约束引擎子模块
 *
 * 提供:
 * - Schema Validator
 * - Content Filter (Guardrail)
 * - Cost Controller (Guardrail)
 * - Rate Limiter (Guardrail)
 */

import { Module } from '@nestjs/common';

// Validators
import { SchemaValidator } from './constraint/validators/schema-validator';

// Guardrails
import { ContentFilter } from './constraint/guardrails/content-filter';
import { CostController } from './constraint/guardrails/cost-controller';
import { RateLimiter } from './constraint/guardrails/rate-limiter';

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

    // Guardrails
    contentFilterFactory,
    CostController,
    RateLimiter,
  ],
  exports: [SchemaValidator, ContentFilter, CostController, RateLimiter],
})
export class AiEngineConstraintModule {}
