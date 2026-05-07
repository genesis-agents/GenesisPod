-- 清零被 20260506d 误回填的 SecretKey.access_count（2026-05-07）
--
-- 背景：20260506d migration.sql 第 65 行把 Secret.access_count（secret name
-- 历史生命周期总命中，跨 N 次 rotation）拷贝到了新建的 'primary' SecretKey 行。
-- 但 SecretKey.accessCount 的真实语义是"当前物理 KEY value 被命中的次数"——
-- rotation 历史不属于当前物理值。
--
-- 同时此前 getValueInternal **从不**调用 markSuccess / 也没自动累加 SecretKey
-- count，所以这些 row 的 accessCount 完全没有"业务流量贡献"，纯粹是迁移种值。
-- → 可放心清零，不会丢失任何真实业务计数。
--
-- 配套代码改动：
--   - getValueInternal 增加 SecretKey.accessCount += 1（fire-and-forget，不动 testStatus）
--   - replaceKeyValue 增加 accessCount = 0（替换 value 后从 0 重新计）
--
-- 范围：仅清零 20260506d 命名规则 'sk_<secret_id>_primary' 的迁移种值行。
-- 其他行（20260506e SecretVersion 回填的 v0..vN，以及之后用户手动 Add Key 的）
-- 本来就是 0，不动。

UPDATE "secret_keys"
SET "access_count" = 0,
    "updated_at"   = CURRENT_TIMESTAMP
WHERE "id" LIKE 'sk\_%\_primary' ESCAPE '\'
  AND "access_count" > 0;
