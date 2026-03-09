-- Add ACADEMIC and WEATHER values to SecretCategory enum
-- These support new search tools: Semantic Scholar, PubMed, OpenWeatherMap

DO $$
BEGIN
    ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'ACADEMIC';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'WEATHER';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
