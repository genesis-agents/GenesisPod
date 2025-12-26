#!/usr/bin/env node
/**
 * Fix missing AIModelType enum values in PostgreSQL
 * This script runs outside of Prisma transactions to add enum values
 *
 * PostgreSQL does not allow ALTER TYPE ADD VALUE inside transactions,
 * so we use a direct pg connection here.
 */

const { Pool } = require("pg");

const enumValues = ["EMBEDDING", "RERANK", "MULTIMODAL", "IMAGE_EDITING"];

async function fixEnumValues() {
  console.log("🔧 Fixing AIModelType enum values...");

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL not set, skipping enum fix");
    return;
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: databaseUrl.includes("railway.app")
      ? { rejectUnauthorized: false }
      : false,
  });

  try {
    const client = await pool.connect();

    for (const value of enumValues) {
      try {
        // Check if enum value already exists
        const checkResult = await client.query(
          `
          SELECT 1 FROM pg_enum
          WHERE enumlabel = $1
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIModelType')
        `,
          [value],
        );

        if (checkResult.rows.length === 0) {
          // Add enum value - this must run outside a transaction
          await client.query(
            `ALTER TYPE "AIModelType" ADD VALUE IF NOT EXISTS '${value}'`,
          );
          console.log(`   ✅ Added enum value: ${value}`);
        } else {
          console.log(`   ⏭️  Enum value already exists: ${value}`);
        }
      } catch (err) {
        // Ignore "already exists" errors
        if (err.message.includes("already exists")) {
          console.log(`   ⏭️  Enum value already exists: ${value}`);
        } else {
          console.error(`   ⚠️  Error adding ${value}:`, err.message);
        }
      }
    }

    client.release();
    console.log("✅ Enum fix completed");
  } catch (err) {
    console.error("❌ Failed to fix enum values:", err.message);
  } finally {
    await pool.end();
  }
}

fixEnumValues().catch(console.error);
