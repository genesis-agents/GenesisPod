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
--   - 凡是最近一次 mission 不是 COMPLETED 的 topic（FAILED / CANCELLED /
--     卡死的 PLANNING / EXECUTING / REVIEWING / PLAN_READY）：把它的
--     isEnabled=true 的 dim 全部置 isEnabled=false，下次"开始"会走
--     Leader 重新规划路径
--   - 最近一次 mission 为 COMPLETED 的 topic：不动
--   - 同时把卡在中间状态的旧 mission mark 为 FAILED 便于追溯

WITH last_mission AS (
  SELECT DISTINCT ON ("topicId")
    "id" AS mission_id,
    "topicId",
    "status"
  FROM "research_missions"
  ORDER BY "topicId", "createdAt" DESC
),
stale AS (
  SELECT mission_id, "topicId", "status"
  FROM last_mission
  WHERE "status" <> 'COMPLETED'
),
fix_stuck AS (
  UPDATE "research_missions"
  SET "status" = 'FAILED',
      "updatedAt" = NOW()
  WHERE "id" IN (
    SELECT mission_id FROM stale
    WHERE "status" IN ('PLANNING', 'PLAN_READY', 'EXECUTING', 'REVIEWING')
  )
  RETURNING "id"
)
UPDATE "topic_dimensions"
SET "isEnabled" = false,
    "updatedAt" = NOW()
WHERE "topicId" IN (SELECT "topicId" FROM stale)
  AND "isEnabled" = true;
