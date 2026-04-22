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
 *
 * HealthCheckRunner 是纯类（非 @Injectable），消费者 `new HealthCheckRunner({...})`
 * 自己持有。不要把它放进 providers——Nest 会尝试注入 undefined 导致启动崩溃。
 * 需要使用时从 `@/modules/ai-engine/facade` 导入该 class 即可。
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

const RUNTIME_RESOURCE_PROVIDERS = [
  ResourceManagerService,
  CircuitBreakerService,
  ConstraintEngine,
  ConstraintEnforcementService,
  CostController,
  RateLimiter,
  TokenBudgetService,
];

@Global()
@Module({
  imports: [PrismaModule],
  providers: RUNTIME_RESOURCE_PROVIDERS,
  exports: RUNTIME_RESOURCE_PROVIDERS,
})
export class RuntimeResourceModule {}
