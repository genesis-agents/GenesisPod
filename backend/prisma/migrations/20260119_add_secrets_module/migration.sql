-- CreateEnum: 密钥分类
CREATE TYPE "SecretCategory" AS ENUM ('AI_MODEL', 'SEARCH', 'EXTRACTION', 'YOUTUBE', 'TTS', 'SKILLSMP', 'OTHER');

-- CreateEnum: 密钥操作类型
CREATE TYPE "SecretAction" AS ENUM ('VIEW', 'CREATE', 'UPDATE', 'DELETE', 'REFERENCE', 'ACCESS_DENIED');

-- CreateTable: 密钥存储表
CREATE TABLE "secrets" (
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
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by" VARCHAR(100),
    "updated_by" VARCHAR(100),
    "deleted_at" TIMESTAMP(3),
    "deleted_by" VARCHAR(100),
    "last_accessed_at" TIMESTAMP(3),
    "access_count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "secrets_pkey" PRIMARY KEY ("id")
);

-- CreateTable: 密钥访问日志表
CREATE TABLE "secret_access_logs" (
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

-- CreateIndex: 密钥唯一索引
CREATE UNIQUE INDEX "secrets_name_key" ON "secrets"("name");

-- CreateIndex: 密钥普通索引
CREATE INDEX "secrets_category_idx" ON "secrets"("category");
CREATE INDEX "secrets_provider_idx" ON "secrets"("provider");
CREATE INDEX "secrets_is_active_idx" ON "secrets"("is_active");

-- CreateIndex: 访问日志索引
CREATE INDEX "secret_access_logs_secret_id_idx" ON "secret_access_logs"("secret_id");
CREATE INDEX "secret_access_logs_action_idx" ON "secret_access_logs"("action");
CREATE INDEX "secret_access_logs_timestamp_idx" ON "secret_access_logs"("timestamp" DESC);

-- AddForeignKey: 访问日志关联密钥（使用 SetNull 保留审计日志）
ALTER TABLE "secret_access_logs" ADD CONSTRAINT "secret_access_logs_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
