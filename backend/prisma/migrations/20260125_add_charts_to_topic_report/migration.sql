-- AlterTable: Add charts column to topic_reports
-- This column stores structured chart data (line, bar, pie, radar, area charts)
-- for data visualization in research reports

ALTER TABLE "topic_reports" ADD COLUMN "charts" JSONB NOT NULL DEFAULT '[]';

-- Add comment for documentation
COMMENT ON COLUMN "topic_reports"."charts" IS 'Structured chart data for report visualization (line, bar, pie, radar, area charts)';
