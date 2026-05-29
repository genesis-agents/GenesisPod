-- W4c: 退役 SecretCategory.USER_DONATED（捐赠池 H6 已退役）
-- 数据安全：任何历史 USER_DONATED 行在 cast 时 remap→OTHER（不丢行、不失败），0 行则空操作。
--          Postgres 不支持 DROP enum VALUE，故重建类型。
-- 受影响列：secrets.category、user_credentials.category（均 DEFAULT 'OTHER'）。
-- 日期 20260603：排在 20260602_byok_credential_hardening（创建 user_credentials）之后，确保两表均存在。

-- 1. 删除两列上的默认值与索引（ALTER TYPE 前置）
ALTER TABLE "secrets" ALTER COLUMN "category" DROP DEFAULT;
ALTER TABLE "user_credentials" ALTER COLUMN "category" DROP DEFAULT;

DROP INDEX IF EXISTS "secrets_category_idx";
DROP INDEX IF EXISTS "secrets_category_is_active_idx";
DROP INDEX IF EXISTS "secrets_user_id_category_idx";
DROP INDEX IF EXISTS "user_credentials_user_id_category_idx";

-- 2. 重建枚举去掉 USER_DONATED
ALTER TYPE "SecretCategory" RENAME TO "SecretCategory_old";
CREATE TYPE "SecretCategory" AS ENUM (
  'AI_MODEL', 'SEARCH', 'EXTRACTION', 'YOUTUBE', 'TTS', 'SKILLSMP',
  'POLICY', 'FINANCE', 'ACADEMIC', 'WEATHER', 'IMAGE_SEARCH',
  'DEV_TOOLS', 'MCP', 'OTHER'
);

-- 3. cast 两列，历史 USER_DONATED → OTHER（不失败、不丢行）
ALTER TABLE "secrets"
  ALTER COLUMN "category" TYPE "SecretCategory"
  USING (CASE WHEN "category"::text = 'USER_DONATED' THEN 'OTHER' ELSE "category"::text END::"SecretCategory");
ALTER TABLE "user_credentials"
  ALTER COLUMN "category" TYPE "SecretCategory"
  USING (CASE WHEN "category"::text = 'USER_DONATED' THEN 'OTHER' ELSE "category"::text END::"SecretCategory");

-- 4. 恢复默认值
ALTER TABLE "secrets" ALTER COLUMN "category" SET DEFAULT 'OTHER';
ALTER TABLE "user_credentials" ALTER COLUMN "category" SET DEFAULT 'OTHER';

DROP TYPE "SecretCategory_old";

-- 5. 重建索引（与原定义一致）
CREATE INDEX IF NOT EXISTS "secrets_category_idx" ON "secrets" ("category");
CREATE INDEX IF NOT EXISTS "secrets_category_is_active_idx" ON "secrets" ("category", "is_active");
CREATE INDEX IF NOT EXISTS "secrets_user_id_category_idx" ON "secrets" ("user_id", "category");
CREATE INDEX IF NOT EXISTS "user_credentials_user_id_category_idx" ON "user_credentials" ("user_id", "category");
