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
export { CreditRulesService } from "../credits/services/credit-rules.service";
export { CheckinService } from "../credits/services/checkin.service";
export { BillingContext } from "../credits/billing-context";
export { InsufficientCreditsException } from "../credits/exceptions/insufficient-credits.exception";

// ─── Secrets ───
export { SecretsService } from "../secrets/secrets.service";
export {
  SECRET_NAMES,
  EXTERNAL_TOOL_SECRET_MAPPING,
} from "../secrets/secret-name-mapping";

// ─── Storage ───
export { StorageService } from "../storage/storage.service";
export { R2StorageService } from "../storage/r2-storage.service";
export { TopicReportStorageService } from "../storage/topic-report-storage.service";

// ─── Email ───
export { EmailService } from "../email/email.service";

// ─── Notifications ───
export { NotificationService } from "../notifications/notification.service";
export { NotificationTypeDto } from "../notifications/dto/notification.dto";

// ─── Settings ───
export { SettingsService } from "../settings/settings.service";

// ─── Monitoring ───
export { AIMetricsService } from "../monitoring/ai-metrics.service";
export { ErrorTrackingService } from "../monitoring/error-tracking.service";
export { HealthCheckService } from "../monitoring/health-check.service";

// ─── User API Keys ───
export { UserApiKeysService } from "../../ai-engine/credentials/user-api-keys/user-api-keys.service";

// ─── BYOK v3：用户多模型配置 ───
export { UserModelConfigsService } from "../../ai-engine/credentials/user-model-configs/user-model-configs.service";
export type {
  CreateUserModelConfigInput,
  UpdateUserModelConfigInput,
} from "../../ai-engine/credentials/user-model-configs/user-model-configs.service";

// ─── BYOK v2：分发池 / 分配 / 申请 / 统一解析 ───
export { DistributableKeysService } from "../../ai-engine/credentials/distributable-keys/distributable-keys.service";
export { KeyAssignmentsService } from "../../ai-engine/credentials/key-assignments/key-assignments.service";
export { KeyRequestsService } from "../../ai-engine/credentials/key-requests/key-requests.service";
export { KeyResolverService } from "../../ai-engine/credentials/key-resolver/key-resolver.service";
export type {
  KeySource,
  ResolvedKey,
} from "../../ai-engine/credentials/key-resolver/key-resolver.service";
export {
  BYOK_ERROR_CODES,
  BYOKError,
  NoAvailableKeyError,
  NoSystemKeyError,
  InvalidApiKeyError,
  QuotaExceededError,
} from "../../ai-engine/credentials/key-resolver/key-resolver.errors";
export type {
  BYOKErrorCode,
  BYOKErrorMeta,
} from "../../ai-engine/credentials/key-resolver/key-resolver.errors";

// ─── Release ───
export { ReleaseService } from "../release/release.service";

// ─── Abstractions (DI tokens for L2 service injection) ───
export type {
  IAiChat,
  IAiObservability,
} from "../abstractions/ai-services.interfaces";
export {
  AI_CHAT_TOKEN,
  AI_OBSERVABILITY_TOKEN,
} from "../abstractions/ai-services.interfaces";

// ─── Table Management ───
export { TableManagementService } from "../table-management/table-management.service";
