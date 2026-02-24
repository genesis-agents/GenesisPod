/**
 * Database Migration Deployment Script
 *
 * Simplified script for Railway deployment.
 * Uses standard Prisma migrate workflow.
 *
 * Usage:
 * - Railway: Set as Build Command or Start Command
 * - Local: npx tsx prisma/deploy-migrations.ts
 *
 * IMPORTANT:
 * - All schema changes should go through Prisma migrations
 * - Do NOT add emergency/force fixes here
 * - See docs/architecture/migration-workflow.md for guidelines
 */

import { PrismaClient } from "@prisma/client";
import { execSync } from "child_process";

const prisma = new PrismaClient();

// Critical tables that must exist after migration
const CRITICAL_TABLES = [
  "users",
  "resources",
  "knowledge_bases",
  "knowledge_base_documents",
  "parent_chunks",
  "child_chunks",
  "child_embeddings",
];

async function deploy(): Promise<void> {
  console.log("========================================");
  console.log("  Database Migration Deployment");
  console.log("========================================\n");

  try {
    // Step 1: Verify database connection (with retry for Railway private networking)
    console.log("1. Connecting to database...");
    const MAX_RETRIES = 10;
    const RETRY_DELAY_MS = 3000;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        await prisma.$connect();
        console.log(`   Connected successfully (attempt ${attempt})\n`);
        break;
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          throw err;
        }
        console.log(
          `   Connection attempt ${attempt}/${MAX_RETRIES} failed, retrying in ${RETRY_DELAY_MS / 1000}s...`,
        );
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }

    // Step 2: Resolve any failed migrations
    console.log("2. Checking for failed migrations...");
    const failedMigrations = await prisma.$queryRaw<
      Array<{ migration_name: string }>
    >`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE finished_at IS NULL AND rolled_back_at IS NULL
    `;

    if (failedMigrations.length > 0) {
      console.log(`   Found ${failedMigrations.length} failed migration(s):`);
      for (const m of failedMigrations) {
        console.log(`   - Resolving: ${m.migration_name}`);
        // Mark as applied since the objects likely already exist in DB
        // Use --applied instead of --rolled-back to prevent re-running
        try {
          execSync(
            `npx prisma migrate resolve --schema=prisma/schema --applied "${m.migration_name}"`,
            { stdio: "inherit", env: process.env },
          );
        } catch {
          // Migration might already be resolved or doesn't exist in local files
          console.log(`     (already resolved or not found locally)`);
        }
      }
      console.log("");
    } else {
      console.log("   No failed migrations found\n");
    }

    // Step 2.5: Clean up rolled-back migrations
    // ★ 只删除记录，让 prisma migrate deploy 重新运行它们
    console.log("2.5. Cleaning up rolled-back migrations...");
    const rolledBackMigrations = await prisma.$queryRaw<
      Array<{ migration_name: string }>
    >`
      SELECT DISTINCT migration_name FROM "_prisma_migrations"
      WHERE rolled_back_at IS NOT NULL
    `;

    if (rolledBackMigrations.length > 0) {
      console.log(
        `   Found ${rolledBackMigrations.length} unique rolled-back migration(s):`,
      );
      for (const m of rolledBackMigrations) {
        console.log(`   - ${m.migration_name}`);
      }

      // 只删除记录，不标记为 applied，让 migrate deploy 重新运行
      const deleteResult = await prisma.$executeRaw`
        DELETE FROM "_prisma_migrations"
        WHERE rolled_back_at IS NOT NULL
      `;
      console.log(`   Deleted ${deleteResult} rolled-back records`);
      console.log("   These migrations will be re-run by migrate deploy\n");
    } else {
      console.log("   No rolled-back migrations found\n");
    }

    // Step 3: Run Prisma migrate deploy
    console.log("3. Running Prisma migrate deploy...");
    execSync("npx prisma migrate deploy --schema=prisma/schema", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("   Migrations deployed\n");

    // Step 3.5: Ensure critical schema changes (fallback for failed migrations)
    console.log("3.5. Ensuring critical schema changes...");

    // Check if secrets.current_version column exists
    const secretsColumnCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'secrets' AND column_name = 'current_version'
      ) as exists
    `;

    if (!secretsColumnCheck[0]?.exists) {
      console.log("   Adding secrets.current_version column...");
      await prisma.$executeRaw`ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "current_version" INT NOT NULL DEFAULT 1`;
      console.log("   Added secrets.current_version");
    } else {
      console.log("   OK secrets.current_version");
    }

    // Check if secret_versions table exists
    const versionsTableCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'secret_versions'
      ) as exists
    `;

    if (!versionsTableCheck[0]?.exists) {
      console.log("   Creating secret_versions table...");
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "secret_versions" (
          "id" TEXT NOT NULL,
          "secret_id" TEXT NOT NULL,
          "version" INTEGER NOT NULL,
          "encrypted_value" TEXT NOT NULL,
          "iv" VARCHAR(32) NOT NULL,
          "key_version" INTEGER NOT NULL DEFAULT 1,
          "checksum" VARCHAR(64) NOT NULL,
          "created_by" VARCHAR(100),
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "change_note" TEXT,
          CONSTRAINT "secret_versions_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "secret_versions_secret_id_version_key" UNIQUE ("secret_id", "version"),
          CONSTRAINT "secret_versions_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "secret_versions_secret_id_idx" ON "secret_versions"("secret_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "secret_versions_created_at_idx" ON "secret_versions"("created_at")`;
      console.log("   Created secret_versions table");
    } else {
      console.log("   OK secret_versions table");
    }

    // Check if tool_configs.secret_key column exists
    const toolConfigsColumnCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tool_configs' AND column_name = 'secret_key'
      ) as exists
    `;

    if (!toolConfigsColumnCheck[0]?.exists) {
      console.log("   Adding tool_configs.secret_key column...");
      await prisma.$executeRaw`ALTER TABLE "tool_configs" ADD COLUMN IF NOT EXISTS "secret_key" VARCHAR(100)`;
      console.log("   Added tool_configs.secret_key");
    } else {
      console.log("   OK tool_configs.secret_key");
    }

    // Check if login_history table exists
    const loginHistoryCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'login_history'
      ) as exists
    `;

    if (!loginHistoryCheck[0]?.exists) {
      console.log("   Creating login_history table...");
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "login_history" (
          "id" TEXT NOT NULL,
          "user_id" TEXT NOT NULL,
          "login_at" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
          "ip_address" TEXT,
          "user_agent" TEXT,
          "device" TEXT,
          "browser" TEXT,
          "os" TEXT,
          "location" TEXT,
          CONSTRAINT "login_history_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "login_history_user_id_idx" ON "login_history"("user_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "login_history_login_at_idx" ON "login_history"("login_at")`;
      console.log("   Created login_history table");
    } else {
      console.log("   OK login_history table");
    }

    // Check if mcp_server_configs.secret_key column exists
    const mcpServerConfigsColumnCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'mcp_server_configs' AND column_name = 'secret_key'
      ) as exists
    `;

    if (!mcpServerConfigsColumnCheck[0]?.exists) {
      console.log("   Adding mcp_server_configs.secret_key column...");
      await prisma.$executeRaw`ALTER TABLE "mcp_server_configs" ADD COLUMN IF NOT EXISTS "secret_key" VARCHAR(100)`;
      console.log("   Added mcp_server_configs.secret_key");
    } else {
      console.log("   OK mcp_server_configs.secret_key");
    }

    // Check if ai_usage_logs table exists
    const aiUsageLogsCheck = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'ai_usage_logs'
      ) as exists
    `;

    if (!aiUsageLogsCheck[0]?.exists) {
      console.log("   Creating ai_usage_logs table...");
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "ai_usage_logs" (
          "id" TEXT NOT NULL,
          "capability_type" TEXT NOT NULL,
          "capability_id" TEXT NOT NULL,
          "user_id" TEXT,
          "team_id" TEXT,
          "agent_id" TEXT,
          "success" BOOLEAN NOT NULL,
          "duration" INTEGER,
          "tokens_used" INTEGER,
          "error_code" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "ai_usage_logs_capability_type_capability_id_idx" ON "ai_usage_logs"("capability_type", "capability_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "ai_usage_logs_created_at_idx" ON "ai_usage_logs"("created_at")`;
      console.log("   Created ai_usage_logs table");
    } else {
      console.log("   OK ai_usage_logs table");
    }

    // Check if social_content_versions table exists
    const socialContentVersionsCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'social_content_versions'
      ) as exists
    `;

    if (!socialContentVersionsCheck[0]?.exists) {
      console.log("   Creating social_content_versions table...");
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "social_content_versions" (
          "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
          "content_id" TEXT NOT NULL,
          "platform_type" "SocialPlatformType" NOT NULL,
          "title" VARCHAR(200) NOT NULL,
          "content" TEXT NOT NULL,
          "digest" VARCHAR(500),
          "is_default" BOOLEAN NOT NULL DEFAULT false,
          "generated_by" VARCHAR(20),
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL,
          CONSTRAINT "social_content_versions_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "social_content_versions_content_id_fkey" FOREIGN KEY ("content_id") REFERENCES "social_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "social_content_versions_content_id_idx" ON "social_content_versions"("content_id")`;
      await prisma.$executeRaw`CREATE UNIQUE INDEX IF NOT EXISTS "social_content_versions_content_id_platform_type_key" ON "social_content_versions"("content_id", "platform_type")`;
      console.log("   Created social_content_versions table");
    } else {
      console.log("   OK social_content_versions table");
    }

    // Check if research_tasks.progress column exists
    // ★ 2026-01-25: 任务进度追踪字段
    const researchTasksProgressCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'research_tasks' AND column_name = 'progress'
      ) as exists
    `;

    if (!researchTasksProgressCheck[0]?.exists) {
      console.log("   Adding research_tasks.progress column...");
      await prisma.$executeRaw`ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "progress" INTEGER NOT NULL DEFAULT 0`;
      await prisma.$executeRaw`COMMENT ON COLUMN "research_tasks"."progress" IS 'Task execution progress (0-100)'`;
      console.log("   Added research_tasks.progress");
    } else {
      console.log("   OK research_tasks.progress");
    }

    // Check if research_tasks.skills column exists
    // ★ 2026-01-26: Leader 分配的技能
    const researchTasksSkillsCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'research_tasks' AND column_name = 'skills'
      ) as exists
    `;

    if (!researchTasksSkillsCheck[0]?.exists) {
      console.log("   Adding research_tasks.skills column...");
      await prisma.$executeRaw`ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "skills" TEXT[] DEFAULT ARRAY[]::TEXT[]`;
      await prisma.$executeRaw`COMMENT ON COLUMN "research_tasks"."skills" IS 'Leader-assigned skills for this task'`;
      console.log("   Added research_tasks.skills");
    } else {
      console.log("   OK research_tasks.skills");
    }

    // Check if research_tasks.tools column exists
    // ★ 2026-01-26: Leader 分配的工具
    const researchTasksToolsCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'research_tasks' AND column_name = 'tools'
      ) as exists
    `;

    if (!researchTasksToolsCheck[0]?.exists) {
      console.log("   Adding research_tasks.tools column...");
      await prisma.$executeRaw`ALTER TABLE "research_tasks" ADD COLUMN IF NOT EXISTS "tools" TEXT[] DEFAULT ARRAY[]::TEXT[]`;
      await prisma.$executeRaw`COMMENT ON COLUMN "research_tasks"."tools" IS 'Leader-assigned tools for this task'`;
      console.log("   Added research_tasks.tools");
    } else {
      console.log("   OK research_tasks.tools");
    }

    // Check if research_topics.language column exists
    // ★ 2026-01-26: 报告语言配置
    const researchTopicsLanguageCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'research_topics' AND column_name = 'language'
      ) as exists
    `;

    if (!researchTopicsLanguageCheck[0]?.exists) {
      console.log("   Adding research_topics.language column...");
      await prisma.$executeRaw`ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "language" VARCHAR(10) NOT NULL DEFAULT 'zh'`;
      await prisma.$executeRaw`COMMENT ON COLUMN "research_topics"."language" IS 'Report language: zh (Chinese) or en (English)'`;
      console.log("   Added research_topics.language");
    } else {
      console.log("   OK research_topics.language");
    }

    // Check if research_feedback_items table exists
    // ★ 2026-01-27: Research Feedback Loop System
    const researchFeedbackCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'research_feedback_items'
      ) as exists
    `;

    if (!researchFeedbackCheck[0]?.exists) {
      console.log("   Creating research feedback tables...");

      // Create enums if not exist
      await prisma.$executeRaw`DO $$ BEGIN CREATE TYPE "ResearchFeedbackSource" AS ENUM ('REPORT_ANNOTATION', 'MANUAL', 'SYSTEM'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
      await prisma.$executeRaw`DO $$ BEGIN CREATE TYPE "ResearchFeedbackCategory" AS ENUM ('QUALITY_ISSUE', 'FEATURE_REQUEST', 'CONTENT_ERROR', 'IMPROVEMENT', 'POSITIVE'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
      await prisma.$executeRaw`DO $$ BEGIN CREATE TYPE "ResearchFeedbackItemStatus" AS ENUM ('PENDING', 'ANALYZING', 'REVIEWING', 'APPROVED', 'REJECTED', 'APPLIED', 'CLOSED'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
      await prisma.$executeRaw`DO $$ BEGIN CREATE TYPE "ImprovementType" AS ENUM ('PROMPT_UPDATE', 'STRATEGY_CHANGE', 'QUALITY_RULE', 'DOCUMENTATION'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
      await prisma.$executeRaw`DO $$ BEGIN CREATE TYPE "FeedbackPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'CRITICAL'); EXCEPTION WHEN duplicate_object THEN null; END $$`;

      // Create research_feedback_knowledge table first (referenced by FK)
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "research_feedback_knowledge" (
          "id" TEXT NOT NULL,
          "feedback_item_id" TEXT NOT NULL,
          "title" VARCHAR(500) NOT NULL,
          "content" TEXT NOT NULL,
          "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
          "improvement_type" "ImprovementType" NOT NULL,
          "improvement_data" JSONB,
          "applied_at" TIMESTAMP(3),
          "effect_score" DOUBLE PRECISION,
          "effect_notes" TEXT,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "research_feedback_knowledge_pkey" PRIMARY KEY ("id")
        )
      `;

      // Create research_feedback_items table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "research_feedback_items" (
          "id" TEXT NOT NULL,
          "source_type" "ResearchFeedbackSource" NOT NULL,
          "source_id" TEXT,
          "content" TEXT NOT NULL,
          "selected_text" TEXT,
          "category" "ResearchFeedbackCategory" DEFAULT 'IMPROVEMENT',
          "subcategory" VARCHAR(100),
          "priority" "FeedbackPriority" NOT NULL DEFAULT 'NORMAL',
          "ai_analysis" JSONB,
          "status" "ResearchFeedbackItemStatus" NOT NULL DEFAULT 'PENDING',
          "assigned_to" TEXT,
          "knowledge_item_id" TEXT,
          "action_taken" TEXT,
          "topic_id" TEXT,
          "report_id" TEXT,
          "section_id" TEXT,
          "user_id" TEXT NOT NULL,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "resolved_at" TIMESTAMP(3),
          CONSTRAINT "research_feedback_items_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "research_feedback_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "research_feedback_items_topic_id_fkey" FOREIGN KEY ("topic_id") REFERENCES "research_topics"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT "research_feedback_items_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "topic_reports"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT "research_feedback_items_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
          CONSTRAINT "research_feedback_items_knowledge_item_id_fkey" FOREIGN KEY ("knowledge_item_id") REFERENCES "research_feedback_knowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `;

      // Create indexes
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_feedback_items_status_priority_idx" ON "research_feedback_items"("status", "priority")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_feedback_items_topic_id_idx" ON "research_feedback_items"("topic_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_feedback_items_user_id_idx" ON "research_feedback_items"("user_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_feedback_knowledge_feedback_item_id_idx" ON "research_feedback_knowledge"("feedback_item_id")`;

      console.log("   Created research feedback tables");
    } else {
      console.log("   OK research_feedback_items table");
    }

    // Check if slides_missions.context_package column exists
    // ★ 2026-01-27: Mission Context Package for slides
    const slidesMissionsContextPackageCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'slides_missions' AND column_name = 'context_package'
      ) as exists
    `;

    if (!slidesMissionsContextPackageCheck[0]?.exists) {
      console.log("   Adding slides_missions.context_package column...");
      await prisma.$executeRaw`ALTER TABLE "slides_missions" ADD COLUMN IF NOT EXISTS "context_package" JSONB`;
      await prisma.$executeRaw`COMMENT ON COLUMN "slides_missions"."context_package" IS 'Mission Context Package - structured context from Leader'`;
      console.log("   Added slides_missions.context_package");
    } else {
      console.log("   OK slides_missions.context_package");
    }

    // Check if deep_research_sessions.discussion column exists
    // ★ 2026-02-14: Discussion-driven research team columns
    const deepResearchDiscussionCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deep_research_sessions' AND column_name = 'discussion'
      ) as exists
    `;

    if (!deepResearchDiscussionCheck[0]?.exists) {
      console.log("   Adding deep_research_sessions.discussion column...");
      await prisma.$executeRaw`ALTER TABLE "deep_research_sessions" ADD COLUMN IF NOT EXISTS "discussion" JSONB[] DEFAULT '{}'`;
      console.log("   Added deep_research_sessions.discussion");
    } else {
      console.log("   OK deep_research_sessions.discussion");
    }

    const deepResearchDirectionsCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'deep_research_sessions' AND column_name = 'directions'
      ) as exists
    `;

    if (!deepResearchDirectionsCheck[0]?.exists) {
      console.log("   Adding deep_research_sessions.directions column...");
      await prisma.$executeRaw`ALTER TABLE "deep_research_sessions" ADD COLUMN IF NOT EXISTS "directions" JSONB`;
      console.log("   Added deep_research_sessions.directions");
    } else {
      console.log("   OK deep_research_sessions.directions");
    }
    // Check if research_ideas table exists
    // ★ 2026-02-14: Research Ideas & Demos tables
    const researchIdeasCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_name = 'research_ideas'
      ) as exists
    `;

    if (!researchIdeasCheck[0]?.exists) {
      console.log("   Creating research ideas & demos tables...");

      // Create enums
      await prisma.$executeRaw`DO $$ BEGIN CREATE TYPE "ResearchIdeaStatus" AS ENUM ('DISCOVERED', 'STARRED', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN null; END $$`;
      await prisma.$executeRaw`DO $$ BEGIN CREATE TYPE "ResearchDemoStatus" AS ENUM ('PENDING', 'GENERATING', 'COMPLETED', 'FAILED'); EXCEPTION WHEN duplicate_object THEN null; END $$`;

      // Create research_ideas table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "research_ideas" (
          "id" TEXT NOT NULL,
          "project_id" TEXT NOT NULL,
          "session_id" TEXT,
          "title" VARCHAR(500) NOT NULL,
          "description" TEXT NOT NULL,
          "source_message_id" TEXT,
          "agent_role" VARCHAR(50),
          "agent_name" VARCHAR(100),
          "status" "ResearchIdeaStatus" NOT NULL DEFAULT 'DISCOVERED',
          "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
          "evidence" JSONB,
          "metadata" JSONB,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "research_ideas_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "research_ideas_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "research_ideas_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "deep_research_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_ideas_project_id_idx" ON "research_ideas"("project_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_ideas_session_id_idx" ON "research_ideas"("session_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_ideas_status_idx" ON "research_ideas"("status")`;

      // Create research_demos table
      await prisma.$executeRaw`
        CREATE TABLE IF NOT EXISTS "research_demos" (
          "id" TEXT NOT NULL,
          "idea_id" TEXT NOT NULL,
          "project_id" TEXT NOT NULL,
          "title" VARCHAR(500) NOT NULL,
          "html_content" TEXT NOT NULL DEFAULT '',
          "status" "ResearchDemoStatus" NOT NULL DEFAULT 'PENDING',
          "error" TEXT,
          "metadata" JSONB,
          "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "research_demos_pkey" PRIMARY KEY ("id"),
          CONSTRAINT "research_demos_idea_id_fkey" FOREIGN KEY ("idea_id") REFERENCES "research_ideas"("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "research_demos_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_demos_idea_id_idx" ON "research_demos"("idea_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_demos_project_id_idx" ON "research_demos"("project_id")`;
      await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "research_demos_status_idx" ON "research_demos"("status")`;

      console.log("   Created research ideas & demos tables");
    } else {
      console.log("   OK research_ideas & research_demos tables");
    }

    // Check cross-module linking columns (20260220_cross_module_linking)
    const slidesMissionSourceSubscriptionCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'slides_missions' AND column_name = 'source_subscription'
      ) as exists
    `;
    if (!slidesMissionSourceSubscriptionCheck[0]?.exists) {
      console.log("   Adding slides_missions.source_subscription column...");
      await prisma.$executeRaw`ALTER TABLE "slides_missions" ADD COLUMN IF NOT EXISTS "source_subscription" JSONB`;
      console.log("   Added slides_missions.source_subscription");
    } else {
      console.log("   OK slides_missions.source_subscription");
    }

    const researchProjectCrossModuleSourceCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'research_projects' AND column_name = 'cross_module_source'
      ) as exists
    `;
    if (!researchProjectCrossModuleSourceCheck[0]?.exists) {
      console.log("   Adding research_projects.cross_module_source column...");
      await prisma.$executeRaw`ALTER TABLE "research_projects" ADD COLUMN IF NOT EXISTS "cross_module_source" JSONB`;
      console.log("   Added research_projects.cross_module_source");
    } else {
      console.log("   OK research_projects.cross_module_source");
    }

    // Check if research_projects.visibility column exists
    // ★ 2026-02-23: PRIVATE/PUBLIC visibility control
    const researchProjectVisibilityCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'research_projects' AND column_name = 'visibility'
      ) as exists
    `;
    if (!researchProjectVisibilityCheck[0]?.exists) {
      console.log("   Adding research_projects.visibility column...");
      await prisma.$executeRaw`ALTER TABLE "research_projects" ADD COLUMN IF NOT EXISTS "visibility" VARCHAR(20) NOT NULL DEFAULT 'PRIVATE'`;
      console.log("   Added research_projects.visibility");
    } else {
      console.log("   OK research_projects.visibility");
    }

    const researchTopicLinkedResearchIdsCheck = await prisma.$queryRaw<
      Array<{ exists: boolean }>
    >`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'research_topics' AND column_name = 'linked_research_ids'
      ) as exists
    `;
    if (!researchTopicLinkedResearchIdsCheck[0]?.exists) {
      console.log("   Adding research_topics.linked_research_ids column...");
      await prisma.$executeRaw`ALTER TABLE "research_topics" ADD COLUMN IF NOT EXISTS "linked_research_ids" JSONB DEFAULT '[]'::jsonb`;
      console.log("   Added research_topics.linked_research_ids");
    } else {
      console.log("   OK research_topics.linked_research_ids");
    }
    console.log("");

    // Step 4: Generate Prisma Client
    console.log("4. Generating Prisma Client...");
    execSync("npx prisma generate --schema=prisma/schema", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("   Client generated\n");

    // Step 4.5: Fix enum values (cannot be added via migrations due to transaction limitations)
    // Note: PostgreSQL ALTER TYPE doesn't support parameterized queries, so we use
    // explicit SQL for each known enum value to avoid dynamic string construction
    console.log("4.5. Fixing enum values...");

    // Helper to safely add enum value with explicit SQL (no string interpolation)
    const addEnumIfNotExists = async (
      checkQuery: Promise<{ exists: boolean }[]>,
      addQuery: () => Promise<number>,
      label: string,
    ) => {
      try {
        const result = await checkQuery;
        if (!result[0]?.exists) {
          await addQuery();
          console.log(`   Added ${label}`);
        } else {
          console.log(`   OK ${label}`);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes("already exists")) {
          console.log(`   OK ${label}`);
        } else {
          console.warn(`   Warning: Could not add ${label}: ${message}`);
        }
      }
    };

    // ResearchMessageType enum values
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DIMENSION_STARTED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ResearchMessageType')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "ResearchMessageType" ADD VALUE IF NOT EXISTS 'DIMENSION_STARTED'`,
      "ResearchMessageType.DIMENSION_STARTED",
    );
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DIMENSION_PROGRESS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ResearchMessageType')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "ResearchMessageType" ADD VALUE IF NOT EXISTS 'DIMENSION_PROGRESS'`,
      "ResearchMessageType.DIMENSION_PROGRESS",
    );
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DIMENSION_COMPLETED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ResearchMessageType')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "ResearchMessageType" ADD VALUE IF NOT EXISTS 'DIMENSION_COMPLETED'`,
      "ResearchMessageType.DIMENSION_COMPLETED",
    );

    // ResearchMissionStatus enum values
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PLAN_READY' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ResearchMissionStatus')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "ResearchMissionStatus" ADD VALUE IF NOT EXISTS 'PLAN_READY'`,
      "ResearchMissionStatus.PLAN_READY",
    );

    // SecretCategory enum values
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'POLICY' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SecretCategory')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'POLICY'`,
      "SecretCategory.POLICY",
    );
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'DEV_TOOLS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SecretCategory')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'DEV_TOOLS'`,
      "SecretCategory.DEV_TOOLS",
    );
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'MCP' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SecretCategory')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'MCP'`,
      "SecretCategory.MCP",
    );

    // DeepResearchStatus enum values (discussion-driven research)
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'IDEATION' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DeepResearchStatus')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "DeepResearchStatus" ADD VALUE IF NOT EXISTS 'IDEATION'`,
      "DeepResearchStatus.IDEATION",
    );
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'FINDINGS' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DeepResearchStatus')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "DeepResearchStatus" ADD VALUE IF NOT EXISTS 'FINDINGS'`,
      "DeepResearchStatus.FINDINGS",
    );

    // CreditTransactionType enum values (billing overhaul + donation rewards)
    const creditEnumValues = [
      "AI_WRITING",
      "AI_IMAGE",
      "AI_SOCIAL",
      "AI_RESEARCH",
      "AI_INSIGHTS",
      "AI_PLANNING",
      "NOTEBOOK_RESEARCH",
      "LIBRARY",
      "NOTES",
      "COLLECTIONS",
      "DONATION_REWARD",
      "DONATION_USAGE_REWARD",
    ];
    for (const value of creditEnumValues) {
      await addEnumIfNotExists(
        prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = ${value} AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'CreditTransactionType')) as exists`,
        () =>
          prisma.$executeRawUnsafe(
            `ALTER TYPE "CreditTransactionType" ADD VALUE IF NOT EXISTS '${value}'`,
          ),
        `CreditTransactionType.${value}`,
      );
    }

    // Migrate legacy AI_STUDIO data to AI_RESEARCH (idempotent)
    try {
      const migrated = await prisma.$executeRaw`
        UPDATE "credit_transactions" SET "type" = 'AI_RESEARCH' WHERE "type" = 'AI_STUDIO'
      `;
      if (migrated > 0) {
        console.log(
          `   Migrated ${migrated} AI_STUDIO transactions to AI_RESEARCH`,
        );
      }
      await prisma.$executeRaw`
        UPDATE "credit_transactions" SET "module_type" = 'deep-research' WHERE "module_type" = 'ai-studio'
      `;
      await prisma.$executeRaw`
        UPDATE "credit_rules" SET "module_type" = 'deep-research' WHERE "module_type" = 'ai-studio'
      `;
    } catch {
      // AI_STUDIO enum value may not exist or tables may not exist yet
    }
    console.log("");

    // Step 4.6: Fix MCP server package names (from @anthropics to @modelcontextprotocol)
    // Note: args is text[] array type, use array_replace() instead of jsonb functions
    console.log("4.6. Fixing MCP server package names...");
    try {
      // Fix GitHub server package name
      const githubFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-github', '@modelcontextprotocol/server-github')
        WHERE '@anthropics/mcp-server-github' = ANY(args)
      `;
      if (githubFixed > 0) {
        console.log(`   Fixed ${githubFixed} GitHub MCP server(s)`);
      }

      // Fix DuckDuckGo server package name
      const ddgFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-duckduckgo', '@modelcontextprotocol/server-ddg-search')
        WHERE '@anthropics/mcp-server-duckduckgo' = ANY(args)
      `;
      if (ddgFixed > 0) {
        console.log(`   Fixed ${ddgFixed} DuckDuckGo MCP server(s)`);
      }

      // Fix Filesystem server package name
      const fsFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-filesystem', '@modelcontextprotocol/server-filesystem')
        WHERE '@anthropics/mcp-server-filesystem' = ANY(args)
      `;
      if (fsFixed > 0) {
        console.log(`   Fixed ${fsFixed} Filesystem MCP server(s)`);
      }

      if (githubFixed === 0 && ddgFixed === 0 && fsFixed === 0) {
        console.log("   No MCP servers needed fixing");
      }
    } catch (error: any) {
      console.warn(
        `   Warning: Could not fix MCP package names: ${error.message}`,
      );
    }
    console.log("");

    // Step 4.7: Fix secret categories for known secrets
    console.log("4.7. Fixing secret categories...");
    try {
      // Update GitHub-related secrets to DEV_TOOLS category
      const githubSecretsFixed = await prisma.$executeRaw`
        UPDATE "secrets"
        SET category = 'DEV_TOOLS'
        WHERE (LOWER(name) LIKE '%github%' OR LOWER(display_name) LIKE '%github%')
          AND category != 'DEV_TOOLS'
      `;
      if (githubSecretsFixed > 0) {
        console.log(`   Fixed ${githubSecretsFixed} GitHub secret(s) category`);
      } else {
        console.log("   No GitHub secrets needed category fix");
      }
    } catch (error: any) {
      console.warn(
        `   Warning: Could not fix secret categories: ${error.message}`,
      );
    }
    console.log("");

    // Step 5: Verify critical tables
    console.log("5. Verifying critical tables...");
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = 'public'
      AND tablename = ANY(${CRITICAL_TABLES}::text[])
    `;

    const foundTables = new Set(tables.map((t) => t.tablename));
    let allFound = true;

    for (const table of CRITICAL_TABLES) {
      const exists = foundTables.has(table);
      console.log(`   ${exists ? "OK" : "MISSING"} ${table}`);
      if (!exists) allFound = false;
    }

    if (!allFound) {
      console.warn("\n   Warning: Some critical tables are missing!\n");
    }

    console.log("\n========================================");
    console.log("  Migration deployment completed!");
    console.log("========================================\n");
  } catch (error) {
    console.error("\n========================================");
    console.error("  Migration deployment FAILED");
    console.error("========================================");
    console.error(error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

// Run deployment
deploy();
