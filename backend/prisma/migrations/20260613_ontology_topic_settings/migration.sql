-- W-E: Ontology topic-level auto-ingest switch
-- Idempotent: uses CREATE TABLE IF NOT EXISTS

CREATE TABLE IF NOT EXISTS "ontology_topic_settings" (
  "topic_id"   TEXT         NOT NULL,
  "auto_ingest" BOOLEAN     NOT NULL DEFAULT false,
  "updated_by" TEXT,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ontology_topic_settings_pkey" PRIMARY KEY ("topic_id")
);
