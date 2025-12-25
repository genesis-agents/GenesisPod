-- System Settings table for admin-configurable settings
-- 创建时间: 2025-12-22

-- Add encrypted column if it doesn't exist (table may already exist from earlier migration)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'system_settings' AND column_name = 'encrypted'
    ) THEN
        ALTER TABLE "system_settings" ADD COLUMN "encrypted" BOOLEAN NOT NULL DEFAULT false;
    END IF;
END $$;

-- Make value nullable if it isn't already
DO $$
BEGIN
    ALTER TABLE "system_settings" ALTER COLUMN "value" DROP NOT NULL;
EXCEPTION
    WHEN others THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "system_settings_category_idx" ON "system_settings"("category");
CREATE INDEX IF NOT EXISTS "system_settings_key_idx" ON "system_settings"("key");

-- Insert default settings with explicit UUIDs
INSERT INTO "system_settings" ("id", "key", "value", "encrypted", "description", "category") VALUES
    -- Email Settings
    (gen_random_uuid()::text, 'smtp_host', '', false, 'SMTP server host (e.g., smtp.gmail.com)', 'email'),
    (gen_random_uuid()::text, 'smtp_port', '587', false, 'SMTP server port (587 for TLS, 465 for SSL)', 'email'),
    (gen_random_uuid()::text, 'smtp_user', '', false, 'SMTP username/email address', 'email'),
    (gen_random_uuid()::text, 'smtp_pass', '', true, 'SMTP password (App Password for Gmail)', 'email'),
    (gen_random_uuid()::text, 'smtp_from', 'DeepDive <noreply@deepdive.ai>', false, 'Default sender address', 'email'),
    (gen_random_uuid()::text, 'smtp_enabled', 'false', false, 'Enable email notifications', 'email'),
    (gen_random_uuid()::text, 'admin_email', '', false, 'Admin email for system notifications', 'email'),

    -- Site Settings
    (gen_random_uuid()::text, 'site_name', 'DeepDive', false, 'Site display name', 'site'),
    (gen_random_uuid()::text, 'site_description', 'AI-Driven Knowledge Discovery Platform', false, 'Site description', 'site'),
    (gen_random_uuid()::text, 'maintenance_mode', 'false', false, 'Enable maintenance mode', 'site'),
    (gen_random_uuid()::text, 'maintenance_message', 'System is under maintenance. Please try again later.', false, 'Maintenance mode message', 'site'),
    (gen_random_uuid()::text, 'allow_registration', 'true', false, 'Allow new user registration', 'site'),
    (gen_random_uuid()::text, 'require_email_verification', 'false', false, 'Require email verification for new users', 'site'),

    -- AI Settings
    (gen_random_uuid()::text, 'default_ai_model', 'gpt-4o-mini', false, 'Default AI model for chat', 'ai'),
    (gen_random_uuid()::text, 'ai_max_tokens', '4096', false, 'Maximum tokens for AI responses', 'ai'),
    (gen_random_uuid()::text, 'ai_temperature', '0.7', false, 'Default temperature for AI (0-1)', 'ai'),
    (gen_random_uuid()::text, 'ai_rate_limit_per_minute', '20', false, 'AI requests per minute per user', 'ai'),
    (gen_random_uuid()::text, 'ai_rate_limit_per_day', '500', false, 'AI requests per day per user', 'ai'),

    -- Security Settings
    (gen_random_uuid()::text, 'session_timeout_hours', '24', false, 'Session timeout in hours', 'security'),
    (gen_random_uuid()::text, 'max_login_attempts', '5', false, 'Max failed login attempts before lockout', 'security'),
    (gen_random_uuid()::text, 'lockout_duration_minutes', '15', false, 'Account lockout duration in minutes', 'security'),

    -- Storage Settings
    (gen_random_uuid()::text, 'max_upload_size_mb', '10', false, 'Maximum file upload size in MB', 'storage'),
    (gen_random_uuid()::text, 'allowed_file_types', 'image/*,application/pdf,.doc,.docx,.xls,.xlsx', false, 'Allowed file types for upload', 'storage')

ON CONFLICT ("key") DO NOTHING;
