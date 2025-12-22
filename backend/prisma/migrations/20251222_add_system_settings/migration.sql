-- System Settings table for admin-configurable settings
-- 创建时间: 2025-12-22

CREATE TABLE IF NOT EXISTS "system_settings" (
    "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    "key" VARCHAR(100) NOT NULL UNIQUE,
    "value" TEXT,
    "encrypted" BOOLEAN NOT NULL DEFAULT false,
    "description" VARCHAR(500),
    "category" VARCHAR(50) NOT NULL DEFAULT 'general',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "system_settings_category_idx" ON "system_settings"("category");
CREATE INDEX IF NOT EXISTS "system_settings_key_idx" ON "system_settings"("key");

-- Insert default settings
INSERT INTO "system_settings" ("key", "value", "encrypted", "description", "category") VALUES
    -- Email Settings
    ('smtp_host', '', false, 'SMTP server host (e.g., smtp.gmail.com)', 'email'),
    ('smtp_port', '587', false, 'SMTP server port (587 for TLS, 465 for SSL)', 'email'),
    ('smtp_user', '', false, 'SMTP username/email address', 'email'),
    ('smtp_pass', '', true, 'SMTP password (App Password for Gmail)', 'email'),
    ('smtp_from', 'DeepDive <noreply@deepdive.ai>', false, 'Default sender address', 'email'),
    ('smtp_enabled', 'false', false, 'Enable email notifications', 'email'),
    ('admin_email', '', false, 'Admin email for system notifications', 'email'),

    -- Site Settings
    ('site_name', 'DeepDive', false, 'Site display name', 'site'),
    ('site_description', 'AI-Driven Knowledge Discovery Platform', false, 'Site description', 'site'),
    ('maintenance_mode', 'false', false, 'Enable maintenance mode', 'site'),
    ('maintenance_message', 'System is under maintenance. Please try again later.', false, 'Maintenance mode message', 'site'),
    ('allow_registration', 'true', false, 'Allow new user registration', 'site'),
    ('require_email_verification', 'false', false, 'Require email verification for new users', 'site'),

    -- AI Settings
    ('default_ai_model', 'gpt-4o-mini', false, 'Default AI model for chat', 'ai'),
    ('ai_max_tokens', '4096', false, 'Maximum tokens for AI responses', 'ai'),
    ('ai_temperature', '0.7', false, 'Default temperature for AI (0-1)', 'ai'),
    ('ai_rate_limit_per_minute', '20', false, 'AI requests per minute per user', 'ai'),
    ('ai_rate_limit_per_day', '500', false, 'AI requests per day per user', 'ai'),

    -- Security Settings
    ('session_timeout_hours', '24', false, 'Session timeout in hours', 'security'),
    ('max_login_attempts', '5', false, 'Max failed login attempts before lockout', 'security'),
    ('lockout_duration_minutes', '15', false, 'Account lockout duration in minutes', 'security'),

    -- Storage Settings
    ('max_upload_size_mb', '10', false, 'Maximum file upload size in MB', 'storage'),
    ('allowed_file_types', 'image/*,application/pdf,.doc,.docx,.xls,.xlsx', false, 'Allowed file types for upload', 'storage')

ON CONFLICT ("key") DO NOTHING;
