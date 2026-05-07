-- =====================================================================
-- PR-8 v1.6 老 mission 数据 backfill — 为 PR-10 切读源做准备
-- =====================================================================
-- 目的：
--   PR-10（计划 2026-05-21）切读源后，rerun 调用 loadPublishedChapters
--   读 agent_playground_chapters 新表。本脚本把 PR-8 v1.6 之前完成的
--   mission（chapter_drafts 终态）补到新表，让老 mission 也能 rerun。
--
-- 执行时机：
--   PR-10 merge 前任意时间（推荐 2026-05-14 = T+7d，给 dual-write 7 天观察期）
--
-- 执行方式（NOT auto-applied by prisma migrate deploy）：
--   1. 备份：pg_dump --table=agent_playground_chapter_drafts → S3
--   2. 在 prod 数据库手工执行本脚本
--   3. 校验：见末尾 verification queries
--
-- 幂等性：
--   ✅ INSERT ... WHERE NOT EXISTS 保护，可重复执行
--
-- 不 backfill：
--   ✗ chapter_figures（旧表无对应数据 — 老 mission rerun 时走 chapter_drafts fallback）
--   ✗ chapter_citations（同上 — 引用元数据在旧 reportArtifact JSONB 内，重跑时重新解析）
--
-- 回退：
--   DELETE FROM agent_playground_chapters WHERE created_at < '2026-05-07';
--   （只删 PR-8 v1.6 上线前的 backfill 行，不影响新写入）
-- =====================================================================

-- ── Pre-flight checks ──────────────────────────────────────────────────

-- 1. 确认目标表存在
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'agent_playground_chapters'
  ) THEN
    RAISE EXCEPTION 'agent_playground_chapters table not found — run 20260507c migration first';
  END IF;
END$$;

-- 2. 报告 backfill 前数据规模（人工核对用）
SELECT
  '前 backfill: chapter_drafts terminal rows' AS metric,
  COUNT(*) AS count
FROM agent_playground_chapter_drafts d
WHERE d.status IN ('done', 'passed', 'final', 'failed-finalized')
UNION ALL
SELECT
  '前 backfill: chapters table rows' AS metric,
  COUNT(*) AS count
FROM agent_playground_chapters
UNION ALL
SELECT
  '前 backfill: 待 backfill mission 数（老 mission，新表无数据）' AS metric,
  COUNT(DISTINCT d.mission_id) AS count
FROM agent_playground_chapter_drafts d
JOIN agent_playground_missions m ON m.id = d.mission_id
WHERE m.completed_at < '2026-05-07'
  AND d.status IN ('done', 'passed', 'final', 'failed-finalized')
  AND NOT EXISTS (
    SELECT 1 FROM agent_playground_chapters c WHERE c.mission_id = d.mission_id
  );

-- ── Backfill main ──────────────────────────────────────────────────────
-- 同 (mission_id, dimension, chapter_index) 取最新 attempts 那行（聚合策略）

INSERT INTO agent_playground_chapters (
  id,
  mission_id,
  user_id,
  dimension,
  chapter_index,
  heading,
  thesis,
  content,
  word_count,
  status,
  score,
  sub_section_count,
  sub_section_structure,
  created_at,
  updated_at
)
SELECT
  -- 用 chapter_drafts.id 作为新行 id（保证幂等 — 重跑相同源行不会产生 duplicate UUID）
  d.id,
  d.mission_id,
  m.user_id,
  d.dimension,
  d.chapter_index,
  d.heading,
  d.thesis,
  d.content,
  -- D2 派生真值：信任旧表 wordCount（backfill 不跑 LLM 重算）
  COALESCE(d.word_count, 0),
  'final',  -- 老 mission 全部按 final 处理
  d.score,
  NULL,     -- 老 mission 无 sub-section 结构
  NULL,
  d.created_at,
  d.updated_at
FROM agent_playground_chapter_drafts d
JOIN agent_playground_missions m ON m.id = d.mission_id
-- 取每 (mission, dim, chapter_index) attempts 最大者（terminal attempt）
JOIN (
  SELECT
    mission_id,
    dimension,
    chapter_index,
    MAX(attempts) AS max_attempts
  FROM agent_playground_chapter_drafts
  GROUP BY mission_id, dimension, chapter_index
) latest ON latest.mission_id = d.mission_id
        AND latest.dimension = d.dimension
        AND latest.chapter_index = d.chapter_index
        AND latest.max_attempts = d.attempts
WHERE m.completed_at < '2026-05-07'
  AND d.status IN ('done', 'passed', 'final', 'failed-finalized')
  -- 幂等：跳过已存在的（mission_id, dimension, chapter_index）行
  AND NOT EXISTS (
    SELECT 1 FROM agent_playground_chapters c
    WHERE c.mission_id = d.mission_id
      AND c.dimension = d.dimension
      AND c.chapter_index = d.chapter_index
  );

-- ── Verification queries ───────────────────────────────────────────────

-- 1. 报告 backfill 后数据规模
SELECT
  '后 backfill: chapters table rows' AS metric,
  COUNT(*) AS count
FROM agent_playground_chapters
UNION ALL
SELECT
  '后 backfill: 老 mission 完整覆盖（chapters 行 / chapter_drafts terminal 行）' AS metric,
  ROUND(
    100.0 * (SELECT COUNT(*) FROM agent_playground_chapters c
             JOIN agent_playground_missions m ON m.id = c.mission_id
             WHERE m.completed_at < '2026-05-07')
    /
    NULLIF((SELECT COUNT(DISTINCT (mission_id, dimension, chapter_index))
            FROM agent_playground_chapter_drafts d
            JOIN agent_playground_missions m ON m.id = d.mission_id
            WHERE m.completed_at < '2026-05-07'
              AND d.status IN ('done', 'passed', 'final', 'failed-finalized')), 0),
    1
  ) AS count;

-- 2. CWE-639: 抽样验证 user_id 来自正确的 mission
SELECT
  c.id,
  c.mission_id,
  c.user_id AS chapter_user,
  m.user_id AS mission_user,
  CASE WHEN c.user_id = m.user_id THEN 'OK' ELSE 'MISMATCH' END AS status
FROM agent_playground_chapters c
JOIN agent_playground_missions m ON m.id = c.mission_id
WHERE m.completed_at < '2026-05-07'
ORDER BY c.created_at DESC
LIMIT 20;

-- 3. 校验：chapters 表无重复（mission_id, dim, chapter_index 唯一）
SELECT
  mission_id,
  dimension,
  chapter_index,
  COUNT(*) AS duplicate_count
FROM agent_playground_chapters
GROUP BY mission_id, dimension, chapter_index
HAVING COUNT(*) > 1
LIMIT 10;
-- 期望：0 行返回（unique 约束守护）

-- ── Rollback (only if needed within 24h of running) ────────────────────
-- DELETE FROM agent_playground_chapters
-- WHERE created_at < '2026-05-07'
--   AND mission_id IN (
--     SELECT id FROM agent_playground_missions WHERE completed_at < '2026-05-07'
--   );
