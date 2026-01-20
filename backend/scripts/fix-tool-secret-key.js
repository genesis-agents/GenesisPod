/**
 * Fix tool_configs table - adds secret_key column if missing
 * This runs before Prisma migrations to handle edge cases
 */

const { PrismaClient } = require("@prisma/client");

async function main() {
  console.log("=== fix-tool-secret-key.js starting ===");
  const prisma = new PrismaClient();

  try {
    // Check if secret_key column exists in tool_configs
    const columnExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'tool_configs'
        AND column_name = 'secret_key'
      );
    `;

    console.log("Column check result:", JSON.stringify(columnExists));

    const exists =
      columnExists[0]?.exists === true || columnExists[0]?.exists === "t";

    if (!exists) {
      console.log("📦 Adding secret_key column to tool_configs...");

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "tool_configs"
        ADD COLUMN IF NOT EXISTS "secret_key" VARCHAR(100);
      `);

      await prisma.$executeRawUnsafe(`
        COMMENT ON COLUMN "tool_configs"."secret_key" IS 'Reference to Secret Manager secret name for API key';
      `);

      console.log("✅ secret_key column added to tool_configs!");
    } else {
      console.log("✅ tool_configs.secret_key column already exists.");
    }

    // Also check ai_models table
    const aiModelColumnExists = await prisma.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'ai_models'
        AND column_name = 'secret_key'
      );
    `;

    const aiModelExists =
      aiModelColumnExists[0]?.exists === true ||
      aiModelColumnExists[0]?.exists === "t";

    if (!aiModelExists) {
      console.log("📦 Adding secret_key column to ai_models...");

      await prisma.$executeRawUnsafe(`
        ALTER TABLE "ai_models"
        ADD COLUMN IF NOT EXISTS "secret_key" VARCHAR(100);
      `);

      console.log("✅ secret_key column added to ai_models!");
    } else {
      console.log("✅ ai_models.secret_key column already exists.");
    }
  } catch (error) {
    console.error("❌ Error fixing secret_key columns:", error.message);
    // Don't throw - let the app continue
  } finally {
    await prisma.$disconnect();
  }
}

main();
