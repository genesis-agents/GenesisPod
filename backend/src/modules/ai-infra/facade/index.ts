/**
 * AI Infrastructure Facade (L1)
 *
 * Unified entry point for all ai-infra public exports.
 * All higher-layer modules (L3 AI Engine, L4 AI Apps, L5 Open API)
 * should import ai-infra symbols from this facade, not from internal paths.
 *
 * NOTE: NestJS Module classes are NOT exported here to avoid circular
 * dependency chains. Module imports in `imports: []` arrays should use
 * direct paths (e.g., `import { CreditsModule } from "../ai-infra/credits/credits.module"`).
 */

// ─── Auth ───
export { AuthService } from "../auth/auth.service";

// ─── Credits & Billing ───
export { CreditsService } from "../credits/credits.service";
export { CreditRulesService } from "../credits/policy/credit-rules.service";
export { CheckinService } from "../credits/rewards/checkin.service";
export { BillingContext } from "../credits/billing-context";
export { InsufficientCreditsException } from "../credits/exceptions/insufficient-credits.exception";

// ─── Secrets ───
export { SecretsService } from "../secrets/secrets.service";
export {
  SECRET_NAMES,
  EXTERNAL_TOOL_SECRET_MAPPING,
} from "../secrets/secret-name-mapping";

// ─── Storage ───
export { StorageGovernanceService } from "../storage/governance/storage-governance.service";
export { R2StorageService } from "../storage/runtime/r2-storage.service";

// ─── Email ───
export { EmailService } from "../email/email.service";

// ─── Notifications ───
export { NotificationService } from "../notifications/notification.service";
export { NotificationPresetsService } from "../notifications/presets/notification-presets.service";
export { NotificationTypeDto } from "../notifications/dto/notification.dto";

// ─── Settings ───
export { SettingsService } from "../settings/settings.service";

// ─── Monitoring ───
export { AIMetricsService } from "../monitoring/ai-metrics.service";
export { ErrorTrackingService } from "../monitoring/error-tracking.service";
export { HealthCheckService } from "../monitoring/health-check.service";

// ─── BYOK / Credentials ─── (2026-05-01: 从 ai-engine/credentials 下沉到 ai-infra/credentials)
// API key 凭证管理是基础设施（CRUD / 加解密 / BYOK 调度），不是 engine 核心能力。
// 全部从 ai-infra/facade 暴露。ai-engine/facade 暂保留 re-export 兼容历史引用。
export { KeyAssignmentsService } from "../credentials/key-assignments/key-assignments.service";
export { KeyRequestsService } from "../credentials/key-requests/key-requests.service";
export { UserApiKeysService } from "../credentials/user-api-keys/user-api-keys.service";
export { KeyResolverService } from "../credentials/key-resolver/key-resolver.service";
export { ByokMaintenanceScheduler } from "../credentials/scheduling/byok-maintenance.scheduler";
export { UserModelConfigsService } from "../credentials/user-model-configs/user-model-configs.service";
export { DistributableKeysService } from "../credentials/distributable-keys/distributable-keys.service";
export { CreateKeyRequestDto } from "../credentials/key-requests/dto/create-key-request.dto";
export {
  SaveUserApiKeyDto,
  ApiKeyMode,
} from "../credentials/user-api-keys/dto/save-user-api-key.dto";
export { TestApiKeyDto } from "../credentials/user-api-keys/dto/test-api-key.dto";
export {
  CreateUserModelConfigDto,
  UpdateUserModelConfigDto,
} from "../credentials/user-model-configs/dto/user-model-config.dto";

// ─── Release ───
export { ReleaseService } from "../release/release.service";

// ─── Abstractions (DI tokens for L2 service injection) ───
export type {
  IAiChat,
  IAiObservability,
} from "../abstractions/ai-services.interface";
export {
  AI_CHAT_TOKEN,
  AI_OBSERVABILITY_TOKEN,
} from "../abstractions/ai-services.interface";

// ─── Database Governance ───
export { DbGovernanceService } from "../db-governance/db-governance.service";
export { DataRetentionService } from "../db-governance/data-retention.service";
