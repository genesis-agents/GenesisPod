/**
 * Database connection diagnostic script
 * Run this to debug Railway deployment issues
 */

import { PrismaClient } from "@prisma/client";

async function diagnose() {
  console.log("🔍 Starting database connection diagnostics...\n");

  // 1. Check environment variables
  console.log("📋 Environment Variables:");
  console.log(`NODE_ENV: ${process.env.NODE_ENV || "not set"}`);
  console.log(`PORT: ${process.env.PORT || "not set"}`);

  const dbUrl = process.env.DATABASE_URL;
  if (dbUrl) {
    // Parse the URL
    try {
      const url = new URL(dbUrl);
      console.log(`DATABASE_URL (parsed):`);
      console.log(`  - Protocol: ${url.protocol}`);
      console.log(`  - Host: ${url.hostname}`);
      console.log(`  - Port: ${url.port}`);
      console.log(`  - Database: ${url.pathname.slice(1)}`);
      console.log(`  - Username: ${url.username}`);
      console.log(`  - Password: ${url.password ? "****" : "not set"}`);
    } catch (e) {
      console.error(`  ❌ Failed to parse DATABASE_URL: ${e}`);
    }
  } else {
    console.error(`  ❌ DATABASE_URL is not set!`);
    process.exit(1);
  }

  console.log("\n🔌 Attempting to connect to database...");

  const prisma = new PrismaClient({
    log: ["query", "info", "warn", "error"],
  });

  try {
    const startTime = Date.now();
    await prisma.$connect();
    const duration = Date.now() - startTime;
    console.log(`✅ Connection successful! (${duration}ms)`);

    // Test a simple query
    console.log("\n🧪 Testing database query...");
    const result = await prisma.$queryRaw<
      Array<{ version: string }>
    >`SELECT version()`;
    console.log(`✅ Database version: ${result[0]?.version}`);

    // Check migrations table
    console.log("\n📊 Checking migrations status...");
    const migrations = await prisma.$queryRaw<
      Array<{ migration_name: string; finished_at: Date | null }>
    >`
      SELECT migration_name, finished_at
      FROM "_prisma_migrations"
      ORDER BY started_at DESC
      LIMIT 5
    `;
    console.log(`Found ${migrations.length} recent migrations:`);
    migrations.forEach((m) => {
      console.log(
        `  - ${m.migration_name}: ${m.finished_at ? "✅ completed" : "⚠️  incomplete"}`,
      );
    });

    await prisma.$disconnect();
    console.log("\n✅ All diagnostics passed!");
    process.exit(0);
  } catch (error: unknown) {
    console.error(`\n❌ Connection failed!`);

    if (error instanceof Error) {
      console.error(`Error type: ${error.constructor.name}`);
      console.error(`Error message: ${error.message}`);

      // Prisma errors have a code property
      if (
        "code" in error &&
        typeof (error as Record<string, unknown>).code === "string"
      ) {
        console.error(`Error code: ${(error as Record<string, unknown>).code}`);
      }
    } else {
      console.error(`Error: ${String(error)}`);
    }

    // Additional diagnostics
    console.log("\n🔍 Additional diagnostics:");
    console.log(`Current working directory: ${process.cwd()}`);
    console.log(`Node version: ${process.version}`);
    console.log(`Platform: ${process.platform}`);

    await prisma.$disconnect();
    process.exit(1);
  }
}

diagnose().catch((error) => {
  console.error("❌ Diagnostic script failed:", error);
  process.exit(1);
});
