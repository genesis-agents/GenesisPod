-- Knowledge Ontology v1 — P0 Data Layer
-- 3 tables: ontology_objects / ontology_links / ontology_edits
-- No meta-model tables; no embedding columns.

-- ============================================================
-- ontology_objects
-- ============================================================
CREATE TABLE IF NOT EXISTS "ontology_objects" (
  "id"         TEXT         NOT NULL,
  "topic_id"   TEXT,
  "type_key"   VARCHAR(64)  NOT NULL,
  "label"      VARCHAR(200) NOT NULL,
  "aliases"    JSONB        NOT NULL DEFAULT '[]',
  "properties" JSONB        NOT NULL DEFAULT '{}',
  "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "created_by" TEXT         NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ontology_objects_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ontology_objects_topic_id_type_key_label_key" ON "ontology_objects"("topic_id", "type_key", "label");
CREATE INDEX IF NOT EXISTS "ontology_objects_topic_id_type_key_idx"            ON "ontology_objects"("topic_id", "type_key");
CREATE INDEX IF NOT EXISTS "ontology_objects_created_by_idx"                   ON "ontology_objects"("created_by");

-- ============================================================
-- ontology_links
-- ============================================================
CREATE TABLE IF NOT EXISTS "ontology_links" (
  "id"            TEXT             NOT NULL,
  "topic_id"      TEXT,
  "link_type_key" VARCHAR(64)      NOT NULL,
  "from_id"       TEXT             NOT NULL,
  "to_id"         TEXT             NOT NULL,
  "properties"    JSONB            NOT NULL DEFAULT '{}',
  "confidence"    DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "created_at"    TIMESTAMP(3)     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ontology_links_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ontology_links_from_id_fkey"
    FOREIGN KEY ("from_id") REFERENCES "ontology_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ontology_links_to_id_fkey"
    FOREIGN KEY ("to_id")   REFERENCES "ontology_objects"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ontology_links_from_id_to_id_link_type_key_key"
  ON "ontology_links"("from_id", "to_id", "link_type_key");

CREATE INDEX IF NOT EXISTS "ontology_links_from_id_idx"       ON "ontology_links"("from_id");
CREATE INDEX IF NOT EXISTS "ontology_links_to_id_idx"         ON "ontology_links"("to_id");
CREATE INDEX IF NOT EXISTS "ontology_links_link_type_key_idx" ON "ontology_links"("link_type_key");

-- ============================================================
-- ontology_edits
-- ============================================================
CREATE TABLE IF NOT EXISTS "ontology_edits" (
  "id"          TEXT         NOT NULL,
  "object_id"   TEXT,
  "link_id"     TEXT,
  "action"      VARCHAR(32)  NOT NULL,
  "actor_type"  VARCHAR(32)  NOT NULL,
  "actor_id"    TEXT         NOT NULL,
  "before"      JSONB,
  "after"       JSONB,
  "reason"      TEXT,
  "evidence_id" TEXT,
  "created_at"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ontology_edits_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ontology_edits_object_id_fkey"
    FOREIGN KEY ("object_id") REFERENCES "ontology_objects"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ontology_edits_link_id_fkey"
    FOREIGN KEY ("link_id")   REFERENCES "ontology_links"("id")   ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ontology_edits_object_id_idx"  ON "ontology_edits"("object_id");
CREATE INDEX IF NOT EXISTS "ontology_edits_link_id_idx"    ON "ontology_edits"("link_id");
CREATE INDEX IF NOT EXISTS "ontology_edits_created_at_idx" ON "ontology_edits"("created_at" DESC);
