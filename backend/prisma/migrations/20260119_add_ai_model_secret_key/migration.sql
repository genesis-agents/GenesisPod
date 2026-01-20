-- AlterTable: Add secretKey field to AIModel for Secret Manager integration
ALTER TABLE "ai_models" ADD COLUMN IF NOT EXISTS "secret_key" VARCHAR(100);

