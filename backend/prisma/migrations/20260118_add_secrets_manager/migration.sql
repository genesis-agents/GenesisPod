-- ============================================================
-- Secret Manager 密钥管理系统 (安全加固版)
-- 集中式 API Key 加密存储，支持审计日志、密钥轮转、软删除
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
        BEGIN ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'AI_MODEL'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'SEARCH'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'EXTRACTION'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'YOUTUBE'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'TTS'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'SKILLSMP'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'OTHER'; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- 2. 创建 SecretAction 枚举类型 (用于审计日志)
DO $$ BEGIN
    CREATE TYPE "SecretAction" AS ENUM (
        'VIEW',
        'CREATE',
        'UPDATE',
        'DELETE',
        'REFERENCE',
        'ACCESS_DENIED'
    );
EXCEPTION
    WHEN duplicate_object THEN
        BEGIN ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'VIEW'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'CREATE'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'UPDATE'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'DELETE'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'REFERENCE'; EXCEPTION WHEN others THEN NULL; END;
        BEGIN ALTER TYPE "SecretAction" ADD VALUE IF NOT EXISTS 'ACCESS_DENIED'; EXCEPTION WHEN others THEN NULL; END;
END $$;

-- 3. 创建 secrets 表 (安全加固版)
CREATE TABLE IF NOT EXISTS "secrets" (
    "id" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "display_name" VARCHAR(200) NOT NULL,
    "category" "SecretCategory" NOT NULL DEFAULT 'OTHER',
    "description" TEXT,

    -- ★ 加密存储 (AES-256-CBC)
    "encrypted_value" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,  -- 初始化向量 (hex, 16 bytes = 32 hex chars)
    "key_version" INTEGER NOT NULL DEFAULT 1,  -- 加密密钥版本号

    -- 元数据
    "provider" VARCHAR(50),
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    -- 过期管理
    "expires_at" TIMESTAMP(3),
    "last_rotated_at" TIMESTAMP(3),

    -- 审计
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" VARCHAR(100),
    "updated_by" VARCHAR(100),

    -- 软删除
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(100),

    -- 访问记录
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- 4. 创建 secret_access_logs 表 (增强版)
CREATE TABLE IF NOT EXISTS "secret_access_logs" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT,  -- 可选，支持记录已删除密钥的日志

    -- ★ 使用枚举确保类型安全
    "action" "SecretAction" NOT NULL,
    "action_status" VARCHAR(20) NOT NULL DEFAULT 'success',  -- success, failed, denied

    -- 删除时备份密钥元数据
    "secret_name" VARCHAR(100),

    -- 变更审计
    "old_value_hash" VARCHAR(64),  -- SHA-256 hash
    "new_value_hash" VARCHAR(64),

    -- 操作者信息
    "user_id" VARCHAR(100),
    "user_email" VARCHAR(200),
    "ip_address" VARCHAR(50),
    "user_agent" TEXT,

    -- 错误信息
    "error_message" TEXT,

    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "secret_access_logs_pkey" PRIMARY KEY ("id")
);

-- 5. 添加唯一约束
DO $$ BEGIN
    ALTER TABLE "secrets" ADD CONSTRAINT "secrets_name_key" UNIQUE ("name");
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 6. 添加外键约束 (★ 使用 SET NULL 而非 CASCADE，保留审计证据)
DO $$ BEGIN
    ALTER TABLE "secret_access_logs"
        ADD CONSTRAINT "secret_access_logs_secret_id_fkey"
        FOREIGN KEY ("secret_id") REFERENCES "secrets"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- 7. 创建 secrets 表索引
CREATE INDEX IF NOT EXISTS "secrets_category_idx" ON "secrets"("category");
CREATE INDEX IF NOT EXISTS "secrets_provider_idx" ON "secrets"("provider");
CREATE INDEX IF NOT EXISTS "secrets_is_active_idx" ON "secrets"("is_active");
CREATE INDEX IF NOT EXISTS "secrets_key_version_idx" ON "secrets"("key_version");
CREATE INDEX IF NOT EXISTS "secrets_expires_at_idx" ON "secrets"("expires_at");
CREATE INDEX IF NOT EXISTS "secrets_deleted_at_idx" ON "secrets"("deleted_at");
-- 复合索引优化常见查询
CREATE INDEX IF NOT EXISTS "secrets_category_is_active_idx" ON "secrets"("category", "is_active");
CREATE INDEX IF NOT EXISTS "secrets_provider_is_active_idx" ON "secrets"("provider", "is_active");
CREATE INDEX IF NOT EXISTS "secrets_is_active_updated_at_idx" ON "secrets"("is_active", "updated_at");

-- 8. 创建 secret_access_logs 表索引
CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_id_idx" ON "secret_access_logs"("secret_id");
CREATE INDEX IF NOT EXISTS "secret_access_logs_timestamp_idx" ON "secret_access_logs"("timestamp");
CREATE INDEX IF NOT EXISTS "secret_access_logs_action_idx" ON "secret_access_logs"("action");
CREATE INDEX IF NOT EXISTS "secret_access_logs_action_status_idx" ON "secret_access_logs"("action_status");
CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_name_idx" ON "secret_access_logs"("secret_name");
-- 复合索引优化审计查询
CREATE INDEX IF NOT EXISTS "secret_access_logs_secret_id_timestamp_idx" ON "secret_access_logs"("secret_id", "timestamp");
CREATE INDEX IF NOT EXISTS "secret_access_logs_user_id_timestamp_idx" ON "secret_access_logs"("user_id", "timestamp");
CREATE INDEX IF NOT EXISTS "secret_access_logs_action_timestamp_idx" ON "secret_access_logs"("action", "timestamp");

-- 9. 添加 updated_at 自动更新触发器
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
