-- ============================================================
-- Secret Manager 密钥管理系统
-- 集中式 API Key 加密存储，支持审计日志
-- ============================================================

-- 1. 创建 SecretCategory 枚举类型
DO $$ BEGIN
    CREATE TYPE "SecretCategory" AS ENUM (
        'AI_MODEL',
        'SEARCH',
        'EXTRACTION',
        'YOUTUBE',
        'TTS',
        'SKILLSMP',
        'OTHER'
    );
EXCEPTION
    WHEN duplicate_object THEN
        -- 枚举已存在，尝试添加可能缺失的值
        BEGIN
            ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'AI_MODEL';
        EXCEPTION WHEN others THEN NULL; END;
        BEGIN
            ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'SEARCH';
        EXCEPTION WHEN others THEN NULL; END;
        BEGIN
            ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'EXTRACTION';
        EXCEPTION WHEN others THEN NULL; END;
        BEGIN
            ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'YOUTUBE';
        EXCEPTION WHEN others THEN NULL; END;
        BEGIN
            ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'TTS';
        EXCEPTION WHEN others THEN NULL; END;
        BEGIN
            ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'SKILLSMP';
        EXCEPTION WHEN others THEN NULL; END;
        BEGIN
            ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'OTHER';
        EXCEPTION WHEN others THEN NULL; END;
END $$;

-- 2. 创建 secrets 表
CREATE TABLE IF NOT EXISTS "secrets" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "category" "SecretCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,
    "value" TEXT NOT NULL,
    "provider" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(100),
    "updated_by" VARCHAR(100),
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- 3. 创建 secret_access_logs 表
CREATE TABLE IF NOT EXISTS "secret_access_logs" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "action" VARCHAR(20) NOT NULL,
    "user_id" VARCHAR(100),
    "user_email" VARCHAR(200),
    "ip_address" VARCHAR(50),
    "user_agent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_access_logs_pkey" PRIMARY KEY ("id")
);

-- 4. 添加唯一约束
DO $$ BEGIN
    ALTER TABLE "secrets" ADD CONSTRAINT "secrets_name_key" UNIQUE ("name");
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 5. 添加外键约束
DO $$ BEGIN
    ALTER TABLE "secret_access_logs"
        ADD CONSTRAINT "secret_access_logs_secret_id_fkey"
        FOREIGN KEY ("secret_id") REFERENCES "secrets"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 6. 创建索引
CREATE INDEX IF NOT EXISTS "secrets_category_idx" ON "secrets"("category");
CREATE INDEX IF NOT EXISTS "secrets_provider_idx" ON "secrets"("provider");
CREATE INDEX IF NOT EXISTS "secrets_is_active_idx" ON "secrets"("is_active");
CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_id_idx" ON "secret_access_logs"("secret_id");
CREATE INDEX IF NOT EXISTS "secret_access_logs_timestamp_idx" ON "secret_access_logs"("timestamp");
CREATE INDEX IF NOT EXISTS "secret_access_logs_action_idx" ON "secret_access_logs"("action");

-- 7. 添加 updated_at 自动更新触发器
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

-- ============================================================
-- 迁移完成
-- ============================================================
