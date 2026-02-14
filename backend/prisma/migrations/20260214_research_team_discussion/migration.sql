-- Add IDEATION status to DeepResearchStatus enum
DO $$
BEGIN
    ALTER TYPE "DeepResearchStatus" ADD VALUE IF NOT EXISTS 'IDEATION';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add FINDINGS status to DeepResearchStatus enum
DO $$
BEGIN
    ALTER TYPE "DeepResearchStatus" ADD VALUE IF NOT EXISTS 'FINDINGS';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add discussion and directions columns to deep_research_sessions
ALTER TABLE "deep_research_sessions"
  ADD COLUMN IF NOT EXISTS "discussion" JSONB[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "directions" JSONB;
