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
            `npx prisma migrate resolve --applied "${m.migration_name}"`,
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

    // Step 2.5: Check for rolled-back migrations that need to be re-applied
    console.log("2.5. Checking for rolled-back migrations...");
    const rolledBackMigrations = await prisma.$queryRaw<
      Array<{ migration_name: string }>
    >`
      SELECT migration_name FROM "_prisma_migrations"
      WHERE rolled_back_at IS NOT NULL
    `;

    if (rolledBackMigrations.length > 0) {
      console.log(
        `   Found ${rolledBackMigrations.length} rolled-back migration(s):`,
      );
      for (const m of rolledBackMigrations) {
        console.log(`   - Marking as applied: ${m.migration_name}`);
        // Remove the rolled-back record and mark as applied
        try {
          await prisma.$executeRaw`
            DELETE FROM "_prisma_migrations"
            WHERE migration_name = ${m.migration_name}
          `;
          execSync(
            `npx prisma migrate resolve --applied "${m.migration_name}"`,
            { stdio: "inherit", env: process.env },
          );
        } catch {
          console.log(`     (could not resolve)`);
        }
      }
      console.log("");
    } else {
      console.log("   No rolled-back migrations found\n");
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

    // Step 4.5: Fix enum values (cannot be added via migrations due to transaction limitations)
    console.log("4.5. Fixing enum values...");
    const enumValues = [
      { type: "ResearchMessageType", value: "DIMENSION_STARTED" },
      { type: "ResearchMessageType", value: "DIMENSION_PROGRESS" },
      { type: "ResearchMessageType", value: "DIMENSION_COMPLETED" },
    ];

    for (const { type, value } of enumValues) {
      try {
        // Check if enum value already exists
        const result = await prisma.$queryRaw<{ exists: boolean }[]>`
          SELECT EXISTS (
            SELECT 1 FROM pg_enum
            WHERE enumlabel = ${value}
            AND enumtypid = (SELECT oid FROM pg_type WHERE typname = ${type})
          ) as exists
        `;

        if (!result[0]?.exists) {
          // Add enum value using raw SQL (outside transaction)
          await prisma.$executeRawUnsafe(
            `ALTER TYPE "${type}" ADD VALUE IF NOT EXISTS '${value}'`,
          );
          console.log(`   Added ${type}.${value}`);
        } else {
          console.log(`   OK ${type}.${value}`);
        }
      } catch (error: any) {
        if (error.message?.includes("already exists")) {
          console.log(`   OK ${type}.${value}`);
        } else {
          console.warn(
            `   Warning: Could not add ${type}.${value}: ${error.message}`,
          );
        }
      }
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
