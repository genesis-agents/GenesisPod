-- CreateEnum (if not exists)
DO $$ BEGIN
    CREATE TYPE "DeepResearchStatus" AS ENUM ('PLANNING', 'SEARCHING', 'REFLECTING', 'SYNTHESIZING', 'COMPLETED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "deep_research_sessions" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "status" "DeepResearchStatus" NOT NULL DEFAULT 'PLANNING',
    "plan" JSONB,
    "search_rounds" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "reflections" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "thinking_chain" JSONB[] DEFAULT ARRAY[]::JSONB[],
    "report" JSONB,
    "sources_used" INTEGER NOT NULL DEFAULT 0,
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "deep_research_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deep_research_sessions_project_id_idx" ON "deep_research_sessions"("project_id");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deep_research_sessions_status_idx" ON "deep_research_sessions"("status");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "deep_research_sessions_created_at_idx" ON "deep_research_sessions"("created_at" DESC);

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "deep_research_sessions" ADD CONSTRAINT "deep_research_sessions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
