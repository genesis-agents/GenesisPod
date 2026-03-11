-- Add mode column to deep_research_sessions
-- Distinguishes single vs iterative research sessions
ALTER TABLE "deep_research_sessions" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'single';
