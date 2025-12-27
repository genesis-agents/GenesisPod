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
      WHERE finished_at IS NULL
      OR (logs IS NOT NULL AND logs != '')
    `;

    if (failedMigrations.length > 0) {
      console.log(`   Found ${failedMigrations.length} failed migration(s):`);
      for (const m of failedMigrations) {
        console.log(`   - Resolving: ${m.migration_name}`);
        try {
          execSync(
            `npx prisma migrate resolve --rolled-back "${m.migration_name}"`,
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

    // Step 3: Run Prisma migrate deploy
    console.log("3. Running Prisma migrate deploy...");
    execSync("npx prisma migrate deploy", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("   Migrations deployed\n");

    // Step 4: Generate Prisma Client
    console.log("4. Generating Prisma Client...");
    execSync("npx prisma generate", {
      stdio: "inherit",
      env: process.env,
    });
    console.log("   Client generated\n");

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
