-- ★ 2026-05-06: 加 lastErrorCode 字段，让 UI 可以根据错误码出语义化 badge
-- （401 未授权 / 429 限流 / 5xx 上游错误 / network / timeout / decryption_failed）。
-- 之前只有 last_error_message 文本，UI 只能显示通用 "Failed"。

ALTER TABLE "secret_keys"
  ADD COLUMN IF NOT EXISTS "last_error_code" VARCHAR(40);

ALTER TABLE "user_api_keys"
  ADD COLUMN IF NOT EXISTS "last_error_code" VARCHAR(40),
  ADD COLUMN IF NOT EXISTS "last_error_message" TEXT;
