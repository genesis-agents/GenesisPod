-- Ontology backfill dedup marker table.
-- 记录"导入历史报告"已处理的 (user_id, source_kind, source_id)，使后续回填只处理
-- 新增报告，不再反复重抽已导入的（省 LLM、不覆盖手工编辑）。

CREATE TABLE IF NOT EXISTS "ontology_backfill_records" (
    "id"           TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
    "user_id"      VARCHAR(100) NOT NULL,
    "source_kind"  VARCHAR(32) NOT NULL,
    "source_id"    TEXT NOT NULL,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ontology_backfill_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ontology_backfill_records_uniq"
    ON "ontology_backfill_records" ("user_id", "source_kind", "source_id");
