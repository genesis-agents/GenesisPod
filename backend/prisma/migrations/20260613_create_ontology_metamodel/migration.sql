-- Knowledge Ontology W-A Meta-Model
-- 新增 ontology_object_types 与 ontology_link_types 两张元模型表
-- 幂等：所有语句均使用 IF NOT EXISTS，可安全重跑

CREATE TABLE IF NOT EXISTS "ontology_object_types" (
  "id"              TEXT          NOT NULL,
  "topic_id"        TEXT,
  "key"             VARCHAR(64)   NOT NULL,
  "label"           VARCHAR(128)  NOT NULL,
  "property_schema" JSONB         NOT NULL DEFAULT '{}',
  "color"           VARCHAR(32),
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ontology_object_types_pkey" PRIMARY KEY ("id")
);

-- 全局或话题内类型键唯一（NULL 作为独立值，每个 NULL topic_id + key 组合唯一）
CREATE UNIQUE INDEX IF NOT EXISTS "ontology_object_types_topic_id_key_key"
  ON "ontology_object_types"("topic_id", "key");

CREATE INDEX IF NOT EXISTS "ontology_object_types_topic_id_idx"
  ON "ontology_object_types"("topic_id");

CREATE TABLE IF NOT EXISTS "ontology_link_types" (
  "id"              TEXT          NOT NULL,
  "topic_id"        TEXT,
  "key"             VARCHAR(64)   NOT NULL,
  "label"           VARCHAR(128)  NOT NULL,
  "from_type_key"   VARCHAR(64)   NOT NULL DEFAULT '',
  "to_type_key"     VARCHAR(64)   NOT NULL DEFAULT '',
  "directed"        BOOLEAN       NOT NULL DEFAULT true,
  "property_schema" JSONB         NOT NULL DEFAULT '{}',
  "created_at"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ontology_link_types_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ontology_link_types_topic_id_key_key"
  ON "ontology_link_types"("topic_id", "key");

CREATE INDEX IF NOT EXISTS "ontology_link_types_topic_id_idx"
  ON "ontology_link_types"("topic_id");
