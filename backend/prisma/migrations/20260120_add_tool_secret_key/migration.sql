-- AlterTable: Add secretKey column to tool_configs
-- References Secret Manager for API key storage

ALTER TABLE "tool_configs" ADD COLUMN IF NOT EXISTS "secret_key" VARCHAR(100);

-- Add comment for documentation
COMMENT ON COLUMN "tool_configs"."secret_key" IS 'Reference to Secret Manager secret name for API key';
