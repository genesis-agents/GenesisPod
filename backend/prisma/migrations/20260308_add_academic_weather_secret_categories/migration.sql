-- Add ACADEMIC, WEATHER, and USER_DONATED values to SecretCategory enum
-- These support new search tools: Semantic Scholar, PubMed, OpenWeatherMap
-- USER_DONATED supports user-contributed API keys

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

DO $$
BEGIN
    ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'USER_DONATED';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
