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
    // Step 1: Verify database connection
    console.log("1. Connecting to database...");
    await prisma.$connect();
    console.log("   Connected successfully\n");

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
