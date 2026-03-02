/**
 * AI Infrastructure Facade (L1)
 *
 * Unified entry point for all ai-infra public exports.
 * All higher-layer modules (L2 AI Engine, L4 AI Apps, L5 Open API)
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

// ─── Email ───
export { EmailService } from "../email/email.service";

// ─── Notifications ───
export { NotificationService } from "../notifications/notification.service";

// ─── Settings ───
export { SettingsService } from "../settings/settings.service";

// ─── Monitoring ───
export { AIMetricsService } from "../monitoring/ai-metrics.service";
export { ErrorTrackingService } from "../monitoring/error-tracking.service";
// NOTE: HealthCheckService NOT exported — it imports from ai-engine/facade
// which creates L1→L2 circular chains. Import directly if needed.

// ─── User API Keys ───
export { UserApiKeysService } from "../user-api-keys/user-api-keys.service";

// ─── Release ───
// NOTE: ReleaseService NOT exported — it imports from ai-engine/facade
// which creates L1→L2 circular chains. Import directly if needed.

// ─── Table Management ───
export { TableManagementService } from "../table-management/table-management.service";
