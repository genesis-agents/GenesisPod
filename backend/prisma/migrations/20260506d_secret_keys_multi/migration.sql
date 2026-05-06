-- Secret 多 KEY 支持（多 KEY 设计 P1，2026-05-06）
--
-- 现状：1 个 secret name = 1 个 active KEY + N 个 SecretVersion 历史轮转。
-- 业务需求：1 个 secret name 下 N 个 KEY 并存（fallback chain + 健康熔断），
-- 与 UserApiKey + KeyChain 形态对齐。
--
-- 决策（详见 docs/architecture/ai-infra/secrets/secrets-multi-key-design.md v0.7）：
--   Q1=B fallback chain  Q2=D 手动+被动  Q3=B 用并存替代 rotation
--   Q4=C drawer          Q5=A 不合并 DistributableKey
--
-- 本次迁移仅创建新表 + 回填 'primary' 行，**不删 secrets.encrypted_value/iv 列**。
-- 业务侧切到 SecretKey（P3）后单独清理旧列。

-- 1) 新表 secret_keys
CREATE TABLE IF NOT EXISTS "secret_keys" (
  "id"                  TEXT PRIMARY KEY,
  "secret_id"           TEXT NOT NULL,
  "label"               VARCHAR(100) NOT NULL,
  "encrypted_value"     TEXT NOT NULL,
  "iv"                  VARCHAR(32) NOT NULL,
  "key_version"         INTEGER NOT NULL DEFAULT 1,
  "key_hint"            VARCHAR(40),
  "is_active"           BOOLEAN NOT NULL DEFAULT TRUE,
  "priority"            INTEGER NOT NULL DEFAULT 0,
  "last_tested_at"      TIMESTAMP(3),
  "test_status"         VARCHAR(20),
  "last_error_message"  TEXT,
  "access_count"        INTEGER NOT NULL DEFAULT 0,
  "created_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by"          VARCHAR(100),
  "updated_by"          VARCHAR(100),
  CONSTRAINT "secret_keys_secret_id_fkey"
    FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 2) 索引 + 唯一约束（与 Prisma schema 对齐）
CREATE UNIQUE INDEX IF NOT EXISTS "secret_keys_secret_id_label_key"
  ON "secret_keys" ("secret_id", "label");
CREATE INDEX IF NOT EXISTS "secret_keys_secret_id_is_active_priority_idx"
  ON "secret_keys" ("secret_id", "is_active", "priority");
CREATE INDEX IF NOT EXISTS "secret_keys_secret_id_test_status_idx"
  ON "secret_keys" ("secret_id", "test_status");

-- 3) 把每个 Secret 的当前 encryptedValue 回填成 secret_keys 的 1 行 'primary'
--    使用 INSERT ... SELECT，跳过软删 (deleted_at IS NULL) + 已存在的（重跑幂等）
INSERT INTO "secret_keys" (
  "id", "secret_id", "label",
  "encrypted_value", "iv", "key_version",
  "is_active", "priority",
  "access_count",
  "created_at", "updated_at",
  "created_by", "updated_by"
)
SELECT
  -- cuid 不能用纯 SQL 生成；用 prefix + secret id 保证唯一可读
  'sk_' || s."id" || '_primary',
  s."id",
  'primary',
  s."encrypted_value",
  s."iv",
  s."key_version",
  s."is_active",
  0,
  s."access_count",
  s."created_at",
  s."updated_at",
  s."created_by",
  s."updated_by"
FROM "secrets" s
WHERE s."deleted_at" IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM "secret_keys" k
    WHERE k."secret_id" = s."id" AND k."label" = 'primary'
  );
