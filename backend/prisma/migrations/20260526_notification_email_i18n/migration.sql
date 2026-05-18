-- PR-DR1b 迁移：EmailChannel + i18n foundation + 三级退订 + tier3 即时推主开关
-- 关联设计：docs/architecture/ai-app/radar/daily-briefing-redesign-2026-05-18.md §10.1 / §10.2
-- 红线：FK 已在 PR-DR1a 就位，本迁移仅扩字段（feedback_prisma_fk_must_match_db_table_name 保持）

-- ============ 1) User i18n 字段（K6 白名单由 DTO @IsEnum/@IsTimeZone 控）============
-- locale: 'zh-CN' | 'en-US'；null = 前端 Accept-Language 推断
-- timezone: IANA tz (Asia/Shanghai / America/New_York / ...)；null = scheduler 用 UTC fallback

ALTER TABLE "users"
  ADD COLUMN IF NOT EXISTS "locale" VARCHAR(10),
  ADD COLUMN IF NOT EXISTS "timezone" VARCHAR(64);

-- ============ 2) NotificationPreference: 三级退订 JWT + tier3 即时推 ============

ALTER TABLE "notification_preferences"
  ADD COLUMN IF NOT EXISTS "unsubscribe_token" TEXT,
  ADD COLUMN IF NOT EXISTS "instant_push_for_tier3" BOOLEAN NOT NULL DEFAULT TRUE;
