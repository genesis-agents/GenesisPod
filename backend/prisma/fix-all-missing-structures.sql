-- Comprehensive Database Structure Fix Script
-- This script is idempotent and can be safely re-run
-- It fixes all potentially missing tables, columns, and indexes

-- ============================================================
-- PART 1: ENUMS (create if not exist)
-- ============================================================

-- SocialPlatformType enum
DO $$ BEGIN
    CREATE TYPE "SocialPlatformType" AS ENUM ('WECHAT_MP', 'XIAOHONGSHU');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- SocialContentType enum
DO $$ BEGIN
    CREATE TYPE "SocialContentType" AS ENUM ('WECHAT_ARTICLE', 'XIAOHONGSHU_NOTE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- SocialContentStatus enum
DO $$ BEGIN
    CREATE TYPE "SocialContentStatus" AS ENUM ('DRAFT', 'PENDING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- SocialContentSourceType enum
DO $$ BEGIN
    CREATE TYPE "SocialContentSourceType" AS ENUM ('MANUAL', 'EXTERNAL_URL', 'AI_EXPLORE', 'AI_RESEARCH', 'AI_OFFICE', 'AI_WRITING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- SocialReviewStatus enum
DO $$ BEGIN
    CREATE TYPE "SocialReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- SecretCategory enum
DO $$ BEGIN
    CREATE TYPE "SecretCategory" AS ENUM ('AI_MODEL', 'SEARCH_ENGINE', 'CLOUD_STORAGE', 'SOCIAL_MEDIA', 'DATABASE', 'OTHER');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- SecretAction enum
DO $$ BEGIN
    CREATE TYPE "SecretAction" AS ENUM ('CREATE', 'READ', 'UPDATE', 'DELETE', 'ROTATE', 'ACCESS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- PART 2: TABLES (create if not exist)
-- ============================================================

-- 2.1 login_history table
CREATE TABLE IF NOT EXISTS "login_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "location" TEXT,
    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- 2.2 tool_configs table
CREATE TABLE IF NOT EXISTS "tool_configs" (
    "id" TEXT NOT NULL,
    "tool_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_name" TEXT,
    "description" TEXT,
    "secret_key" VARCHAR(100),
    "config" JSONB,
    "requires_auth" BOOLEAN NOT NULL DEFAULT false,
    "allowed_roles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tool_configs_pkey" PRIMARY KEY ("id")
);

-- 2.3 skill_configs table
CREATE TABLE IF NOT EXISTS "skill_configs" (
    "id" TEXT NOT NULL,
    "skill_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "display_name" TEXT,
    "description" TEXT,
    "config" JSONB,
    "allowed_domains" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "layer" TEXT,
    "domain" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "skill_configs_pkey" PRIMARY KEY ("id")
);

-- 2.4 mcp_server_configs table
CREATE TABLE IF NOT EXISTS "mcp_server_configs" (
    "id" TEXT NOT NULL,
    "server_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "transport" TEXT NOT NULL,
    "command" TEXT,
    "args" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "url" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "auto_connect" BOOLEAN NOT NULL DEFAULT true,
    "api_key" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "mcp_server_configs_pkey" PRIMARY KEY ("id")
);

-- 2.5 capability_usages table
CREATE TABLE IF NOT EXISTS "capability_usages" (
    "id" TEXT NOT NULL,
    "capability_type" TEXT NOT NULL,
    "capability_id" TEXT NOT NULL,
    "user_id" TEXT,
    "team_id" TEXT,
    "agent_id" TEXT,
    "success" BOOLEAN NOT NULL,
    "duration" INTEGER,
    "tokens_used" INTEGER,
    "error_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "capability_usages_pkey" PRIMARY KEY ("id")
);

-- 2.6 secrets table
CREATE TABLE IF NOT EXISTS "secrets" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "category" "SecretCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "encrypted_value" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "provider" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "expires_at" TIMESTAMP(3),
    "last_rotated_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(100),
    "updated_by" VARCHAR(100),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(100),
    -- Access tracking fields
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    "current_version" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- 2.7 secret_versions table
CREATE TABLE IF NOT EXISTS "secret_versions" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "checksum" VARCHAR(64) NOT NULL,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_note" TEXT,
    CONSTRAINT "secret_versions_pkey" PRIMARY KEY ("id")
);

-- 2.8 secret_access_logs table
CREATE TABLE IF NOT EXISTS "secret_access_logs" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT,
    "action" "SecretAction" NOT NULL,
    "action_status" VARCHAR(20) NOT NULL DEFAULT 'success',
    "secret_name" VARCHAR(100),
    "old_value_hash" VARCHAR(64),
    "new_value_hash" VARCHAR(64),
    "user_id" VARCHAR(100),
    "user_email" VARCHAR(200),
    "ip_address" VARCHAR(50),
    "user_agent" TEXT,
    "error_message" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "secret_access_logs_pkey" PRIMARY KEY ("id")
);

-- 2.9 social_platform_connections table
CREATE TABLE IF NOT EXISTS "social_platform_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform_type" "SocialPlatformType" NOT NULL,
    "account_name" TEXT,
    "account_id" TEXT,
    "avatar_url" TEXT,
    "session_data" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_check_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_platform_connections_pkey" PRIMARY KEY ("id")
);

-- 2.10 social_contents table
CREATE TABLE IF NOT EXISTS "social_contents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connection_id" TEXT,
    "content_type" "SocialContentType" NOT NULL,
    "status" "SocialContentStatus" NOT NULL DEFAULT 'DRAFT',
    "source_type" "SocialContentSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT,
    "source_url" TEXT,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "author" VARCHAR(50),
    "digest" VARCHAR(200),
    "cover_image_url" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "tags" JSONB NOT NULL DEFAULT '[]',
    "location" VARCHAR(100),
    "ai_process_log" JSONB,
    "ai_suggestions" JSONB,
    "review_status" "SocialReviewStatus",
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "review_note" TEXT,
    "compliance_check" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "auto_publish" BOOLEAN NOT NULL DEFAULT false,
    "external_url" TEXT,
    "external_id" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_contents_pkey" PRIMARY KEY ("id")
);

-- 2.11 social_publish_logs table
CREATE TABLE IF NOT EXISTS "social_publish_logs" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "status" VARCHAR(20) NOT NULL,
    "details" JSONB,
    "error_message" TEXT,
    "screenshot_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "social_publish_logs_pkey" PRIMARY KEY ("id")
);

-- ============================================================
-- PART 3: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================

-- 3.1 tool_configs.secret_key
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tool_configs' AND column_name = 'secret_key'
    ) THEN
        ALTER TABLE "tool_configs" ADD COLUMN "secret_key" VARCHAR(100);
    END IF;
END $$;

-- 3.2 ai_models.secret_key (if ai_models table exists)
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ai_models'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'secret_key'
    ) THEN
        ALTER TABLE "ai_models" ADD COLUMN "secret_key" VARCHAR(100);
    END IF;
END $$;

-- 3.3 ai_models.is_reasoning
DO $$ BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ai_models'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'is_reasoning'
    ) THEN
        ALTER TABLE "ai_models" ADD COLUMN "is_reasoning" BOOLEAN DEFAULT false;
    END IF;
END $$;

-- 3.4 secrets missing columns (access tracking)
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'secrets' AND column_name = 'last_accessed_at') THEN
        ALTER TABLE "secrets" ADD COLUMN "last_accessed_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'secrets' AND column_name = 'access_count') THEN
        ALTER TABLE "secrets" ADD COLUMN "access_count" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'secrets' AND column_name = 'current_version') THEN
        ALTER TABLE "secrets" ADD COLUMN "current_version" INTEGER NOT NULL DEFAULT 1;
    END IF;
END $$;

-- 3.5 ai_models capability fields (10 new columns)
DO $$ BEGIN
    -- api_format: openai, anthropic, google, xai
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'api_format')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "api_format" VARCHAR(20) NOT NULL DEFAULT 'openai';
    END IF;

    -- supports_temperature
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'supports_temperature')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "supports_temperature" BOOLEAN NOT NULL DEFAULT true;
    END IF;

    -- supports_streaming
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'supports_streaming')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "supports_streaming" BOOLEAN NOT NULL DEFAULT true;
    END IF;

    -- supports_function_calling
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'supports_function_calling')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "supports_function_calling" BOOLEAN NOT NULL DEFAULT true;
    END IF;

    -- supports_vision
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'supports_vision')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "supports_vision" BOOLEAN NOT NULL DEFAULT false;
    END IF;

    -- token_param_name
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'token_param_name')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "token_param_name" VARCHAR(30) NOT NULL DEFAULT 'max_tokens';
    END IF;

    -- default_timeout_ms
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'default_timeout_ms')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "default_timeout_ms" INTEGER NOT NULL DEFAULT 120000;
    END IF;

    -- price_input_per_million
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'price_input_per_million')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "price_input_per_million" DECIMAL(10, 4);
    END IF;

    -- price_output_per_million
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'price_output_per_million')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "price_output_per_million" DECIMAL(10, 4);
    END IF;

    -- priority
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_models')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_models' AND column_name = 'priority')
    THEN
        ALTER TABLE "ai_models" ADD COLUMN "priority" INTEGER NOT NULL DEFAULT 50;
    END IF;
END $$;

-- 3.6 social_platform_connections columns
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_platform_connections' AND column_name = 'avatar_url') THEN
        ALTER TABLE "social_platform_connections" ADD COLUMN "avatar_url" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_platform_connections' AND column_name = 'account_name') THEN
        ALTER TABLE "social_platform_connections" ADD COLUMN "account_name" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_platform_connections' AND column_name = 'account_id') THEN
        ALTER TABLE "social_platform_connections" ADD COLUMN "account_id" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_platform_connections' AND column_name = 'session_data') THEN
        ALTER TABLE "social_platform_connections" ADD COLUMN "session_data" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_platform_connections' AND column_name = 'last_check_at') THEN
        ALTER TABLE "social_platform_connections" ADD COLUMN "last_check_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_platform_connections' AND column_name = 'expires_at') THEN
        ALTER TABLE "social_platform_connections" ADD COLUMN "expires_at" TIMESTAMP(3);
    END IF;
END $$;

-- 3.7 social_contents columns
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'author') THEN
        ALTER TABLE "social_contents" ADD COLUMN "author" VARCHAR(50);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'digest') THEN
        ALTER TABLE "social_contents" ADD COLUMN "digest" VARCHAR(200);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'cover_image_url') THEN
        ALTER TABLE "social_contents" ADD COLUMN "cover_image_url" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'images') THEN
        ALTER TABLE "social_contents" ADD COLUMN "images" JSONB NOT NULL DEFAULT '[]';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'tags') THEN
        ALTER TABLE "social_contents" ADD COLUMN "tags" JSONB NOT NULL DEFAULT '[]';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'location') THEN
        ALTER TABLE "social_contents" ADD COLUMN "location" VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'ai_process_log') THEN
        ALTER TABLE "social_contents" ADD COLUMN "ai_process_log" JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'ai_suggestions') THEN
        ALTER TABLE "social_contents" ADD COLUMN "ai_suggestions" JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'review_status') THEN
        ALTER TABLE "social_contents" ADD COLUMN "review_status" "SocialReviewStatus";
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'reviewed_by_id') THEN
        ALTER TABLE "social_contents" ADD COLUMN "reviewed_by_id" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'reviewed_at') THEN
        ALTER TABLE "social_contents" ADD COLUMN "reviewed_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'review_note') THEN
        ALTER TABLE "social_contents" ADD COLUMN "review_note" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'compliance_check') THEN
        ALTER TABLE "social_contents" ADD COLUMN "compliance_check" JSONB;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'scheduled_at') THEN
        ALTER TABLE "social_contents" ADD COLUMN "scheduled_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'published_at') THEN
        ALTER TABLE "social_contents" ADD COLUMN "published_at" TIMESTAMP(3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'auto_publish') THEN
        ALTER TABLE "social_contents" ADD COLUMN "auto_publish" BOOLEAN NOT NULL DEFAULT false;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'external_url') THEN
        ALTER TABLE "social_contents" ADD COLUMN "external_url" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'external_id') THEN
        ALTER TABLE "social_contents" ADD COLUMN "external_id" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'error_message') THEN
        ALTER TABLE "social_contents" ADD COLUMN "error_message" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'retry_count') THEN
        ALTER TABLE "social_contents" ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'source_id') THEN
        ALTER TABLE "social_contents" ADD COLUMN "source_id" TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'social_contents' AND column_name = 'source_url') THEN
        ALTER TABLE "social_contents" ADD COLUMN "source_url" TEXT;
    END IF;
END $$;

-- ============================================================
-- PART 4: INDEXES (create if not exist)
-- ============================================================

-- login_history indexes
CREATE INDEX IF NOT EXISTS "login_history_user_id_idx" ON "login_history"("user_id");
CREATE INDEX IF NOT EXISTS "login_history_login_at_idx" ON "login_history"("login_at");

-- tool_configs indexes
CREATE UNIQUE INDEX IF NOT EXISTS "tool_configs_tool_id_key" ON "tool_configs"("tool_id");
CREATE INDEX IF NOT EXISTS "tool_configs_enabled_idx" ON "tool_configs"("enabled");
CREATE INDEX IF NOT EXISTS "tool_configs_category_idx" ON "tool_configs"("category");

-- skill_configs indexes
CREATE UNIQUE INDEX IF NOT EXISTS "skill_configs_skill_id_key" ON "skill_configs"("skill_id");
CREATE INDEX IF NOT EXISTS "skill_configs_enabled_idx" ON "skill_configs"("enabled");
CREATE INDEX IF NOT EXISTS "skill_configs_domain_idx" ON "skill_configs"("domain");

-- mcp_server_configs indexes
CREATE UNIQUE INDEX IF NOT EXISTS "mcp_server_configs_server_id_key" ON "mcp_server_configs"("server_id");
CREATE INDEX IF NOT EXISTS "mcp_server_configs_enabled_idx" ON "mcp_server_configs"("enabled");

-- capability_usages indexes
CREATE INDEX IF NOT EXISTS "capability_usages_capability_type_capability_id_idx" ON "capability_usages"("capability_type", "capability_id");
CREATE INDEX IF NOT EXISTS "capability_usages_created_at_idx" ON "capability_usages"("created_at");

-- secrets indexes
CREATE UNIQUE INDEX IF NOT EXISTS "secrets_name_key" ON "secrets"("name");
CREATE INDEX IF NOT EXISTS "secrets_category_idx" ON "secrets"("category");
CREATE INDEX IF NOT EXISTS "secrets_is_active_idx" ON "secrets"("is_active");
CREATE INDEX IF NOT EXISTS "secrets_provider_idx" ON "secrets"("provider");
CREATE INDEX IF NOT EXISTS "secrets_key_version_idx" ON "secrets"("key_version");
CREATE INDEX IF NOT EXISTS "secrets_expires_at_idx" ON "secrets"("expires_at");
CREATE INDEX IF NOT EXISTS "secrets_deleted_at_idx" ON "secrets"("deleted_at");
-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS "secrets_category_is_active_idx" ON "secrets"("category", "is_active");
CREATE INDEX IF NOT EXISTS "secrets_provider_is_active_idx" ON "secrets"("provider", "is_active");
CREATE INDEX IF NOT EXISTS "secrets_is_active_updated_at_idx" ON "secrets"("is_active", "updated_at");

-- secret_versions indexes
CREATE UNIQUE INDEX IF NOT EXISTS "secret_versions_secret_id_version_key" ON "secret_versions"("secret_id", "version");
CREATE INDEX IF NOT EXISTS "secret_versions_secret_id_idx" ON "secret_versions"("secret_id");
CREATE INDEX IF NOT EXISTS "secret_versions_created_at_idx" ON "secret_versions"("created_at");

-- secret_access_logs indexes
CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_id_idx" ON "secret_access_logs"("secret_id");
CREATE INDEX IF NOT EXISTS "secret_access_logs_action_idx" ON "secret_access_logs"("action");
CREATE INDEX IF NOT EXISTS "secret_access_logs_timestamp_idx" ON "secret_access_logs"("timestamp");

-- social_platform_connections indexes
CREATE UNIQUE INDEX IF NOT EXISTS "social_platform_connections_user_id_platform_type_key" ON "social_platform_connections"("user_id", "platform_type");
CREATE INDEX IF NOT EXISTS "social_platform_connections_user_id_idx" ON "social_platform_connections"("user_id");

-- social_contents indexes
CREATE INDEX IF NOT EXISTS "social_contents_user_id_status_idx" ON "social_contents"("user_id", "status");
CREATE INDEX IF NOT EXISTS "social_contents_status_scheduled_at_idx" ON "social_contents"("status", "scheduled_at");
CREATE INDEX IF NOT EXISTS "social_contents_content_type_idx" ON "social_contents"("content_type");
CREATE INDEX IF NOT EXISTS "social_contents_review_status_idx" ON "social_contents"("review_status");

-- social_publish_logs indexes
CREATE INDEX IF NOT EXISTS "social_publish_logs_content_id_idx" ON "social_publish_logs"("content_id");
CREATE INDEX IF NOT EXISTS "social_publish_logs_action_idx" ON "social_publish_logs"("action");
CREATE INDEX IF NOT EXISTS "social_publish_logs_status_idx" ON "social_publish_logs"("status");

-- ============================================================
-- PART 5: FOREIGN KEYS (add if not exist)
-- ============================================================

-- login_history foreign key
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'login_history_user_id_fkey'
    ) THEN
        ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK login_history_user_id_fkey: %', SQLERRM;
END $$;

-- secret_versions foreign key
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'secret_versions_secret_id_fkey'
    ) THEN
        ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_secret_id_fkey"
        FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK secret_versions_secret_id_fkey: %', SQLERRM;
END $$;

-- secret_access_logs foreign key
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'secret_access_logs_secret_id_fkey'
    ) THEN
        ALTER TABLE "secret_access_logs" ADD CONSTRAINT "secret_access_logs_secret_id_fkey"
        FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK secret_access_logs_secret_id_fkey: %', SQLERRM;
END $$;

-- social_platform_connections foreign key
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'social_platform_connections_user_id_fkey'
    ) THEN
        ALTER TABLE "social_platform_connections" ADD CONSTRAINT "social_platform_connections_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK social_platform_connections_user_id_fkey: %', SQLERRM;
END $$;

-- social_contents foreign keys
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'social_contents_user_id_fkey'
    ) THEN
        ALTER TABLE "social_contents" ADD CONSTRAINT "social_contents_user_id_fkey"
        FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK social_contents_user_id_fkey: %', SQLERRM;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'social_contents_connection_id_fkey'
    ) THEN
        ALTER TABLE "social_contents" ADD CONSTRAINT "social_contents_connection_id_fkey"
        FOREIGN KEY ("connection_id") REFERENCES "social_platform_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK social_contents_connection_id_fkey: %', SQLERRM;
END $$;

-- social_publish_logs foreign key
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'social_publish_logs_content_id_fkey'
    ) THEN
        ALTER TABLE "social_publish_logs" ADD CONSTRAINT "social_publish_logs_content_id_fkey"
        FOREIGN KEY ("content_id") REFERENCES "social_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'FK social_publish_logs_content_id_fkey: %', SQLERRM;
END $$;

-- ============================================================
-- DONE
-- ============================================================
