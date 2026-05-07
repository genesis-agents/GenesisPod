-- =====================================================================
-- PR-1: agent-playground overhaul v1.6 — 章节最终态独立表 + version chain
-- =====================================================================
-- 目的：
--   1. 创建 agent_playground_chapters / chapter_figures / chapter_citations 三表
--      （rerun 重建源 — chapter_drafts 后续降级为 attempts 历史）
--   2. 三表全部加 user_id 列 + 索引（CWE-639 cross-user 隔离）
--   3. agent_playground_missions 加 parent_mission_id（D5 fresh-research version chain）
--   4. chapters 表预留 sub_section_count / sub_section_structure（PR-13 章内拼接）
--
-- 不破坏现有数据：
--   - chapter_drafts 表保留不动（PR-3 dual-write 期同时写两表）
--   - 老 mission 数据迁移由独立 SQL 脚本执行，不在本 migration 内
--
-- 回退路径：
--   DROP TABLE agent_playground_chapter_citations;
--   DROP TABLE agent_playground_chapter_figures;
--   DROP TABLE agent_playground_chapters;
--   ALTER TABLE agent_playground_missions DROP COLUMN parent_mission_id;
-- =====================================================================

-- 1. agent_playground_missions: 加 parent_mission_id（D5 fresh-research version chain）
ALTER TABLE "agent_playground_missions"
  ADD COLUMN "parent_mission_id" TEXT;

ALTER TABLE "agent_playground_missions"
  ADD CONSTRAINT "agent_playground_missions_parent_mission_id_fkey"
  FOREIGN KEY ("parent_mission_id")
  REFERENCES "agent_playground_missions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "agent_playground_missions_parent_mission_id_idx"
  ON "agent_playground_missions"("parent_mission_id");

-- 2. agent_playground_chapters: 章节最终态独立表
CREATE TABLE "agent_playground_chapters" (
  "id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "dimension" VARCHAR(200) NOT NULL,
  "chapter_index" INTEGER NOT NULL,
  "heading" VARCHAR(500) NOT NULL,
  "thesis" TEXT,
  "content" TEXT NOT NULL,
  "word_count" INTEGER NOT NULL,
  "status" VARCHAR(30) NOT NULL,
  "score" INTEGER,
  "sub_section_count" INTEGER,
  "sub_section_structure" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "agent_playground_chapters_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_playground_chapters"
  ADD CONSTRAINT "agent_playground_chapters_mission_id_fkey"
  FOREIGN KEY ("mission_id")
  REFERENCES "agent_playground_missions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- D3 unique 约束：同 mission 同 dim 同 chapter_index 唯一
CREATE UNIQUE INDEX "agent_playground_chapters_mission_id_dimension_chapter_index_key"
  ON "agent_playground_chapters"("mission_id", "dimension", "chapter_index");

-- CWE-639 隔离索引
CREATE INDEX "agent_playground_chapters_user_id_idx"
  ON "agent_playground_chapters"("user_id");

CREATE INDEX "agent_playground_chapters_mission_user_idx"
  ON "agent_playground_chapters"("mission_id", "user_id");

-- 3. agent_playground_chapter_figures: 章节图独立表（D6 figure-curator stage 写）
CREATE TABLE "agent_playground_chapter_figures" (
  "id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_url" TEXT,
  "image_url" TEXT NOT NULL,
  "caption" TEXT NOT NULL,
  "alt_text" TEXT,
  "width" INTEGER,
  "height" INTEGER,
  "source_type" VARCHAR(30) NOT NULL,
  "ai_generation_prompt" TEXT,
  "watermark_overlay_required" BOOLEAN NOT NULL DEFAULT FALSE,
  "source_license" VARCHAR(60),
  "position_in_chapter" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_playground_chapter_figures_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "agent_playground_chapter_figures_source_type_check"
    CHECK ("source_type" IN ('scraped', 'ai-generated', 'user-uploaded', 'hotlink'))
);

ALTER TABLE "agent_playground_chapter_figures"
  ADD CONSTRAINT "agent_playground_chapter_figures_chapter_id_fkey"
  FOREIGN KEY ("chapter_id")
  REFERENCES "agent_playground_chapters"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_playground_chapter_figures"
  ADD CONSTRAINT "agent_playground_chapter_figures_mission_id_fkey"
  FOREIGN KEY ("mission_id")
  REFERENCES "agent_playground_missions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agent_playground_chapter_figures_chapter_id_idx"
  ON "agent_playground_chapter_figures"("chapter_id");

CREATE INDEX "agent_playground_chapter_figures_user_id_idx"
  ON "agent_playground_chapter_figures"("user_id");

CREATE INDEX "agent_playground_chapter_figures_mission_user_idx"
  ON "agent_playground_chapter_figures"("mission_id", "user_id");

-- 4. agent_playground_chapter_citations: 引用独立表
CREATE TABLE "agent_playground_chapter_citations" (
  "id" TEXT NOT NULL,
  "chapter_id" TEXT NOT NULL,
  "mission_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "source_url" TEXT NOT NULL,
  "source_title" TEXT,
  "citation_text" TEXT NOT NULL,
  "cited_paragraph_index" INTEGER,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "agent_playground_chapter_citations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "agent_playground_chapter_citations"
  ADD CONSTRAINT "agent_playground_chapter_citations_chapter_id_fkey"
  FOREIGN KEY ("chapter_id")
  REFERENCES "agent_playground_chapters"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "agent_playground_chapter_citations"
  ADD CONSTRAINT "agent_playground_chapter_citations_mission_id_fkey"
  FOREIGN KEY ("mission_id")
  REFERENCES "agent_playground_missions"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "agent_playground_chapter_citations_chapter_id_idx"
  ON "agent_playground_chapter_citations"("chapter_id");

CREATE INDEX "agent_playground_chapter_citations_user_id_idx"
  ON "agent_playground_chapter_citations"("user_id");

CREATE INDEX "agent_playground_chapter_citations_mission_user_idx"
  ON "agent_playground_chapter_citations"("mission_id", "user_id");
