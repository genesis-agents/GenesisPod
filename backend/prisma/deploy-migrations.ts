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
 * - Do NOT add "fallback" CREATE TABLE / ALTER TABLE here
 * - Do NOT use DO $$ EXCEPTION wrapper for ALTER TYPE ADD VALUE in migrations
 *   (EXCEPTION creates a subtransaction; ALTER TYPE ADD VALUE fails in subtransactions)
 * - Use direct: ALTER TYPE "X" ADD VALUE IF NOT EXISTS 'Y';
 * - See .claude/skills/development/database-migration/SKILL.md for guidelines
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
    // NOTE: This auto-resolves failed migrations as "applied" to unblock deployment.
    // Historical migrations may have used DO $$/EXCEPTION patterns that fail in Prisma
    // transactions. Those migrations are marked as applied, and the enum values are
    // applied separately in Step 4 below.
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
        console.log(
          `   - WARNING: Auto-resolving as applied: ${m.migration_name}`,
        );
        console.log(
          `     (migration SQL was NOT executed - check if manual intervention needed)`,
        );
        try {
          execSync(
            `npx prisma migrate resolve --schema=prisma/schema --applied "${m.migration_name}"`,
            { stdio: "inherit", env: process.env },
          );
        } catch {
          console.log(`     (already resolved or not found locally)`);
        }
      }
      console.log("");
    } else {
      console.log("   No failed migrations found\n");
    }

    // Step 2.5: Clean up rolled-back migrations
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

    // Step 4: Generate Prisma Client
    console.log("4. Generating Prisma Client...");
    execSync("npx prisma generate --schema=prisma/schema", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("   Client generated\n");

    // Step 4.5: Ensure enum values exist
    // WHY THIS EXISTS: Historical migration files used DO $$/EXCEPTION wrappers around
    // ALTER TYPE ADD VALUE. This pattern creates a PostgreSQL subtransaction (via EXCEPTION),
    // and ALTER TYPE ADD VALUE cannot execute inside a subtransaction. So those migrations
    // failed, were auto-resolved as "applied" by Step 2, but the enum values were never
    // actually added. This step compensates by adding them outside any transaction.
    //
    // FUTURE MIGRATIONS should use direct: ALTER TYPE "X" ADD VALUE IF NOT EXISTS 'Y';
    // (no DO/EXCEPTION wrapper) — which works correctly in Prisma's transaction.
    // Once all historical migrations are superseded, this section can be removed.
    console.log("4.5. Ensuring enum values (legacy migration compensation)...");

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

    // DeepResearchStatus enum values
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
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'PLAN_READY' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DeepResearchStatus')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "DeepResearchStatus" ADD VALUE IF NOT EXISTS 'PLAN_READY'`,
      "DeepResearchStatus.PLAN_READY",
    );
    await addEnumIfNotExists(
      prisma.$queryRaw`SELECT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'CANCELLED' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'DeepResearchStatus')) as exists`,
      () =>
        prisma.$executeRaw`ALTER TYPE "DeepResearchStatus" ADD VALUE IF NOT EXISTS 'CANCELLED'`,
      "DeepResearchStatus.CANCELLED",
    );

    // CreditTransactionType enum values
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
    console.log("");

    // Step 4.6: Data migrations (idempotent)
    console.log("4.6. Running data migrations...");

    // Migrate legacy AI_STUDIO data to AI_RESEARCH
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
      // ★ credit_rules 有 UNIQUE(module_type, operation_type)，直接 UPDATE
      //   ai-studio→deep-research 会和已经存在的 (deep-research,*) 行撞键。
      //   先删除会冲突的 ai-studio 重复行，再 UPDATE 剩余的。
      const deletedDup = await prisma.$executeRaw`
        DELETE FROM "credit_rules" cr1
        WHERE cr1."module_type" = 'ai-studio'
          AND EXISTS (
            SELECT 1 FROM "credit_rules" cr2
            WHERE cr2."module_type" = 'deep-research'
              AND cr2."operation_type" = cr1."operation_type"
          )
      `;
      if (deletedDup > 0) {
        console.log(
          `   Deleted ${deletedDup} legacy ai-studio credit_rules already migrated`,
        );
      }
      const renamed = await prisma.$executeRaw`
        UPDATE "credit_rules" SET "module_type" = 'deep-research' WHERE "module_type" = 'ai-studio'
      `;
      if (renamed > 0) {
        console.log(
          `   Renamed ${renamed} credit_rules ai-studio→deep-research`,
        );
      }
    } catch (err) {
      // AI_STUDIO enum value may not exist or tables may not exist yet
      console.log(
        `   Skipped AI_STUDIO migration: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    // Fix MCP server package names (from @anthropics to @modelcontextprotocol)
    try {
      const githubFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-github', '@modelcontextprotocol/server-github')
        WHERE '@anthropics/mcp-server-github' = ANY(args)
      `;
      const ddgFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-duckduckgo', '@modelcontextprotocol/server-ddg-search')
        WHERE '@anthropics/mcp-server-duckduckgo' = ANY(args)
      `;
      const fsFixed = await prisma.$executeRaw`
        UPDATE "mcp_server_configs"
        SET args = array_replace(args, '@anthropics/mcp-server-filesystem', '@modelcontextprotocol/server-filesystem')
        WHERE '@anthropics/mcp-server-filesystem' = ANY(args)
      `;
      const totalFixed = githubFixed + ddgFixed + fsFixed;
      if (totalFixed > 0) {
        console.log(`   Fixed ${totalFixed} MCP server package name(s)`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`   Warning: Could not fix MCP package names: ${message}`);
    }

    // Fix secret categories for known secrets
    try {
      const githubSecretsFixed = await prisma.$executeRaw`
        UPDATE "secrets"
        SET category = 'DEV_TOOLS'
        WHERE (LOWER(name) LIKE '%github%' OR LOWER(display_name) LIKE '%github%')
          AND category != 'DEV_TOOLS'
      `;
      if (githubSecretsFixed > 0) {
        console.log(`   Fixed ${githubSecretsFixed} GitHub secret(s) category`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`   Warning: Could not fix secret categories: ${message}`);
    }
    console.log("   Data migrations completed\n");

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
