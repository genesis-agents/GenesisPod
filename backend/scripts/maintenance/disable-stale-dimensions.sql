-- 应急清理：失败/取消 mission 残留的脏 topicDimension 行
--
-- 背景：
-- topic-team-orchestrator 每次 executeRefresh 在 dimensions 为空时才走 LLM
-- 重新规划，否则复用 topicDimension 表的现有行。失败/取消 mission 不会清理
-- 这些 dim，加上 dimension-research.executor 的兜底 create 路径，会让 dim
-- 表逐次累积脏行。下次"开始"时这些脏行被一并拉出 → ResearchTask 翻倍。
--
-- 修复方案 A 已内置到 executeRefresh 入口（上次 mission FAILED/CANCELLED
-- 时自动软删 dim），但需要先把当前数据库里已经累积的脏 dim 清掉。
--
-- 用法（Railway prod）：
--   prisma db execute --schema prisma/schema --file scripts/maintenance/disable-stale-dimensions.sql --url "$DATABASE_URL"
--
-- 影响：
--   - 凡是最近一次 mission 为 FAILED/CANCELLED 的 topic：把它的 isEnabled=true
--     的 dim 全部置 isEnabled=false，下次"开始"会走 Leader 重新规划
--   - 最近一次 mission 为 COMPLETED/EXECUTING 的 topic：不动

WITH last_mission AS (
  SELECT DISTINCT ON ("topicId")
    "topicId",
    "status"
  FROM "research_missions"
  ORDER BY "topicId", "createdAt" DESC
),
topics_to_clean AS (
  SELECT "topicId"
  FROM last_mission
  WHERE "status" IN ('FAILED', 'CANCELLED')
)
UPDATE "topic_dimensions"
SET "isEnabled" = false,
    "updatedAt" = NOW()
WHERE "topicId" IN (SELECT "topicId" FROM topics_to_clean)
  AND "isEnabled" = true;
