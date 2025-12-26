-- Add sourceTypes column to knowledge_bases for multi-source support
-- This allows a knowledge base to have multiple data source types

-- Add the new column
ALTER TABLE "knowledge_bases" ADD COLUMN IF NOT EXISTS "source_types" JSONB NOT NULL DEFAULT '["MANUAL"]';

-- Migrate existing data: copy sourceType to sourceTypes array
UPDATE "knowledge_bases"
SET "source_types" = jsonb_build_array("source_type"::text)
WHERE "source_types" = '["MANUAL"]'
  AND "source_type" IS NOT NULL
  AND "source_type"::text != 'MANUAL';

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS "knowledge_bases_source_types_idx" ON "knowledge_bases" USING GIN ("source_types");
