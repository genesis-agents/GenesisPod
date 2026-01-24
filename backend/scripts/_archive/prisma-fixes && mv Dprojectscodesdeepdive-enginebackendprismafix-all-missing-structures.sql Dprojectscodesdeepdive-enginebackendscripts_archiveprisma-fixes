/**
 * Fix enum values that cannot be added via Prisma migrations
 *
 * PostgreSQL's ALTER TYPE ADD VALUE cannot run inside a transaction,
 * but Prisma migrations always run in transactions. This script
 * adds the missing enum values outside of transaction context.
 *
 * Run this script before starting the application if enum errors occur.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixEnumValues() {
  console.log("🔧 Fixing enum values...\n");

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

      if (result[0]?.exists) {
        console.log(`  ✓ ${type}.${value} already exists`);
      } else {
        // Add enum value - must use raw SQL string, not parameterized
        await prisma.$executeRawUnsafe(
          `ALTER TYPE "${type}" ADD VALUE IF NOT EXISTS '${value}'`,
        );
        console.log(`  ✓ Added ${type}.${value}`);
      }
    } catch (error: any) {
      // If the value already exists, that's fine
      if (error.message?.includes("already exists")) {
        console.log(`  ✓ ${type}.${value} already exists`);
      } else {
        console.error(`  ✗ Failed to add ${type}.${value}:`, error.message);
      }
    }
  }

  console.log("\n✅ Enum fix complete!");
}

fixEnumValues()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
