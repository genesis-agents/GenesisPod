-- ============================================================
-- Secret Manager 密钥管理系统 (安全加固版)
-- 集中式 API Key 加密存储，支持审计日志、密钥轮转、软删除
-- 幂等迁移：先清理不完整对象，再重新创建
-- ============================================================

-- 0. 清理不完整的迁移残留（仅当表为空或不完整时）
DO $$
DECLARE
    secrets_row_count INTEGER;
    has_key_version BOOLEAN;
BEGIN
    -- 检查 secrets 表是否存在
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'secrets') THEN
        -- 检查是否有 key_version 列
        SELECT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'secrets' AND column_name = 'key_version'
        ) INTO has_key_version;
        
        -- 如果缺少 key_version 列，说明表不完整
        IF NOT has_key_version THEN
            -- 检查表是否为空
            EXECUTE 'SELECT COUNT(*) FROM secrets' INTO secrets_row_count;
            IF secrets_row_count = 0 THEN
                -- 表为空且不完整，删除重建
                DROP TABLE IF EXISTS "secret_access_logs";
                DROP TABLE IF EXISTS "secrets";
                RAISE NOTICE 'Dropped incomplete empty secrets tables for recreation';
            ELSE
                -- 表有数据但不完整，添加缺失的列
                ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "key_version" INTEGER NOT NULL DEFAULT 1;
                ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "iv" VARCHAR(32);
                ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "encrypted_value" TEXT;
                ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "expires_at" TIMESTAMP(3);
                ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "last_rotated_at" TIMESTAMP(3);
                ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP(3);
                ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "deleted_by" VARCHAR(100);
                RAISE NOTICE 'Added missing columns to existing secrets table';
            END IF;
        END IF;
    END IF;
END $$;

-- 1. 创建 SecretCategory 枚举类型
DO $$ BEGIN
    CREATE TYPE "SecretCategory" AS ENUM (
        'AI_MODEL', 'SEARCH', 'EXTRACTION', 'YOUTUBE', 'TTS', 'SKILLSMP', 'OTHER'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. 创建 SecretAction 枚举类型
DO $$ BEGIN
    CREATE TYPE "SecretAction" AS ENUM (
        'VIEW', 'CREATE', 'UPDATE', 'DELETE', 'REFERENCE', 'ACCESS_DENIED'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. 创建 secrets 表
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
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- 4. 创建 secret_access_logs 表
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

-- 5. 添加唯一约束
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'secrets_name_key') THEN
        CREATE UNIQUE INDEX "secrets_name_key" ON "secrets"("name");
    END IF;
END $$;

-- 6. 添加外键约束
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'secret_access_logs_secret_id_fkey'
    ) THEN
        ALTER TABLE "secret_access_logs"
            ADD CONSTRAINT "secret_access_logs_secret_id_fkey"
            FOREIGN KEY ("secret_id") REFERENCES "secrets"("id")
            ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 7. 创建索引（仅当列存在时）
DO $$
BEGIN
    -- secrets 表索引
    CREATE INDEX IF NOT EXISTS "secrets_category_idx" ON "secrets"("category");
    CREATE INDEX IF NOT EXISTS "secrets_provider_idx" ON "secrets"("provider");
    CREATE INDEX IF NOT EXISTS "secrets_is_active_idx" ON "secrets"("is_active");
    CREATE INDEX IF NOT EXISTS "secrets_deleted_at_idx" ON "secrets"("deleted_at");
    CREATE INDEX IF NOT EXISTS "secrets_category_is_active_idx" ON "secrets"("category", "is_active");
    CREATE INDEX IF NOT EXISTS "secrets_provider_is_active_idx" ON "secrets"("provider", "is_active");
    CREATE INDEX IF NOT EXISTS "secrets_is_active_updated_at_idx" ON "secrets"("is_active", "updated_at");
    
    -- 仅当 key_version 列存在时创建索引
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'secrets' AND column_name = 'key_version') THEN
        CREATE INDEX IF NOT EXISTS "secrets_key_version_idx" ON "secrets"("key_version");
    END IF;
    
    -- 仅当 expires_at 列存在时创建索引
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'secrets' AND column_name = 'expires_at') THEN
        CREATE INDEX IF NOT EXISTS "secrets_expires_at_idx" ON "secrets"("expires_at");
    END IF;
    
    -- secret_access_logs 表索引
    CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_id_idx" ON "secret_access_logs"("secret_id");
    CREATE INDEX IF NOT EXISTS "secret_access_logs_timestamp_idx" ON "secret_access_logs"("timestamp");
    CREATE INDEX IF NOT EXISTS "secret_access_logs_action_idx" ON "secret_access_logs"("action");
    CREATE INDEX IF NOT EXISTS "secret_access_logs_action_status_idx" ON "secret_access_logs"("action_status");
    CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_name_idx" ON "secret_access_logs"("secret_name");
    CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_id_timestamp_idx" ON "secret_access_logs"("secret_id", "timestamp");
    CREATE INDEX IF NOT EXISTS "secret_access_logs_user_id_timestamp_idx" ON "secret_access_logs"("user_id", "timestamp");
    CREATE INDEX IF NOT EXISTS "secret_access_logs_action_timestamp_idx" ON "secret_access_logs"("action", "timestamp");
END $$;

-- 8. 创建触发器
CREATE OR REPLACE FUNCTION update_secrets_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS secrets_updated_at_trigger ON "secrets";
CREATE TRIGGER secrets_updated_at_trigger
    BEFORE UPDATE ON "secrets"
    FOR EACH ROW
    EXECUTE FUNCTION update_secrets_updated_at();
