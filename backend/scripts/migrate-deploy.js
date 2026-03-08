#!/usr/bin/env node
/**
 * Production migration runner.
 *
 * Runs `prisma migrate deploy` before application startup.
 * This ensures all pending migrations are applied automatically on every deploy.
 *
 * Usage: node scripts/migrate-deploy.js
 * Called by: npm run start:prod → "node scripts/migrate-deploy.js && node dist/main"
 *
 * Behavior:
 * - Applies all pending migrations from prisma/migrations/
 * - Exits 0 on success (no pending migrations also counts as success)
 * - Exits 1 on failure (blocks application startup to prevent schema mismatch)
 */

const { execSync } = require("child_process");

const SCHEMA_PATH = "prisma/schema";

function main() {
  console.log("[migrate-deploy] Checking for pending migrations...");

  try {
    const output = execSync(
      `npx prisma migrate deploy --schema=${SCHEMA_PATH}`,
      {
        stdio: ["pipe", "pipe", "pipe"],
        timeout: 60_000, // 60s timeout
        env: { ...process.env },
      },
    );

    const stdout = output.toString();
    if (stdout.includes("No pending migrations")) {
      console.log(
        "[migrate-deploy] No pending migrations. Database is up to date.",
      );
    } else {
      console.log("[migrate-deploy] Migrations applied successfully:");
      console.log(stdout);
    }

    process.exit(0);
  } catch (error) {
    const stderr = error.stderr ? error.stderr.toString() : "";
    const stdout = error.stdout ? error.stdout.toString() : "";

    console.error("[migrate-deploy] Migration failed!");
    console.error("[migrate-deploy] stdout:", stdout);
    console.error("[migrate-deploy] stderr:", stderr);

    // Exit 1 to block application startup — running with schema mismatch
    // causes runtime errors that are harder to debug than a failed deploy
    process.exit(1);
  }
}

main();
