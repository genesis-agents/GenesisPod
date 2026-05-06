-- Secret 多 KEY 回填 — SecretVersion 历史全部作为 active SecretKey 行（2026-05-06）
--
-- 背景：上一个 migration `20260506d_secret_keys_multi` 只回填了 secrets 当前
-- active value（'primary' label）。但用户实际通过 rotate 维护了多个版本的
-- KEY，每个版本都是**有效**的 plaintext API key，应作为 fallback chain 候选。
--
-- 决策：每个 SecretVersion 历史也回填为 SecretKey 行（label='v{N}'，
-- isActive=true），priority 按版本倒序（最新版本 priority 数字最小 = 优先）。
-- 跳过 SecretVersion.version === Secret.currentVersion 的行（已由 'primary' 覆盖）。
--
-- 重跑安全：WHERE NOT EXISTS 子查询 + 跳过软删 secret + 跳过当前版本。

INSERT INTO "secret_keys" (
  "id", "secret_id", "label",
  "encrypted_value", "iv", "key_version",
  "is_active", "priority",
  "access_count",
  "created_at", "updated_at",
  "created_by"
)
SELECT
  'sk_' || sv."id" || '_v' || sv."version",
  sv."secret_id",
  'v' || sv."version",
  sv."encrypted_value",
  sv."iv",
  sv."key_version",
  TRUE,
  -- priority: current_version - sv.version
  -- e.g. current=3, version=2 → priority=1（v2 落后于 primary 一个台阶）
  -- e.g. current=3, version=1 → priority=2
  GREATEST(COALESCE(s."current_version", 1) - sv."version", 1),
  0,
  sv."created_at",
  sv."created_at",
  sv."created_by"
FROM "secret_versions" sv
JOIN "secrets" s ON s."id" = sv."secret_id"
WHERE s."deleted_at" IS NULL
  -- 跳过当前版本（已由 'primary' label 行覆盖）
  AND sv."version" != COALESCE(s."current_version", 1)
  -- 重跑幂等：跳过已存在的 v{N} 行
  AND NOT EXISTS (
    SELECT 1 FROM "secret_keys" sk
    WHERE sk."secret_id" = sv."secret_id"
      AND sk."label" = 'v' || sv."version"
  );
