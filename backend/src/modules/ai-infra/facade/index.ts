/**
 * AI Infrastructure Facade (L1)
 *
 * Unified entry point for all ai-infra public exports.
 * All higher-layer modules (L2 AI Engine, L4 AI Apps, L5 Open API)
 * should import ai-infra symbols from this facade, not from internal paths.
 *
 * Pattern: same as ai-engine/facade/index.ts
 */

// ─── Auth ───
export { AuthModule } from "../auth/auth.module";
export { AuthService } from "../auth/auth.service";

// ─── Credits & Billing ───
export { CreditsModule } from "../credits/credits.module";
export { CreditsService } from "../credits/credits.service";
export { CreditRulesService } from "../credits/services/credit-rules.service";
export { CheckinService } from "../credits/services/checkin.service";
export { BillingContext } from "../credits/billing-context";
export { InsufficientCreditsException } from "../credits/exceptions/insufficient-credits.exception";

// ─── Secrets ───
export { SecretsModule } from "../secrets/secrets.module";
export { SecretsService } from "../secrets/secrets.service";
export {
  SECRET_NAMES,
  EXTERNAL_TOOL_SECRET_MAPPING,
} from "../secrets/secret-name-mapping";

// ─── Storage ───
export { StorageModule } from "../storage/storage.module";
export { StorageService } from "../storage/storage.service";
export { R2StorageService } from "../storage/r2-storage.service";

// ─── Email ───
export { EmailModule } from "../email/email.module";
export { EmailService } from "../email/email.service";

// ─── Notifications ───
export { NotificationModule } from "../notifications/notification.module";
export { NotificationService } from "../notifications/notification.service";

// ─── Settings ───
export { SettingsModule } from "../settings/settings.module";
export { SettingsService } from "../settings/settings.service";

// ─── Monitoring ───
export { MonitoringModule } from "../monitoring/monitoring.module";
export { AIMetricsService } from "../monitoring/ai-metrics.service";
export { ErrorTrackingService } from "../monitoring/error-tracking.service";
export { HealthCheckService } from "../monitoring/health-check.service";

// ─── User API Keys ───
export { UserApiKeysModule } from "../user-api-keys/user-api-keys.module";
export { UserApiKeysService } from "../user-api-keys/user-api-keys.service";

// ─── Release ───
export { ReleaseModule } from "../release/release.module";
export { ReleaseService } from "../release/release.service";

// ─── Table Management ───
export { TableManagementModule } from "../table-management/table-management.module";
export { TableManagementService } from "../table-management/table-management.service";
