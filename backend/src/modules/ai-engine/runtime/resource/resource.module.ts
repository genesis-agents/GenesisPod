/**
 * Runtime Resource Module
 *
 * 提供 AI Engine runtime 层的资源管理与约束能力：
 * - ResourceManagerService: 资源配额管理
 * - CircuitBreakerService: 断路器
 * - ConstraintEngine / ConstraintEnforcementService: 三轴约束评估 & 强制
 * - CostController: 成本控制
 * - RateLimiter: 速率限制
 * - TokenBudgetService: Token 预算
 * - HealthCheckRunner: 健康检查
 *
 * 本模块是 @Global()。
 */

import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../../../../common/prisma/prisma.module";
import { ResourceManagerService } from "./resource-manager.service";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { ConstraintEngine } from "./constraint-engine";
import { ConstraintEnforcementService } from "./constraint-enforcement.service";
import { CostController } from "./cost-controller";
import { RateLimiter } from "./rate-limiter";
import { TokenBudgetService } from "./token-budget.service";
import { HealthCheckRunner } from "./health-check-runner";

const RUNTIME_RESOURCE_PROVIDERS = [
  ResourceManagerService,
  CircuitBreakerService,
  ConstraintEngine,
  ConstraintEnforcementService,
  CostController,
  RateLimiter,
  TokenBudgetService,
  HealthCheckRunner,
];

@Global()
@Module({
  imports: [PrismaModule],
  providers: RUNTIME_RESOURCE_PROVIDERS,
  exports: RUNTIME_RESOURCE_PROVIDERS,
})
export class RuntimeResourceModule {}
