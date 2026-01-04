#!/bin/sh
# Version: 3 - Force rebuild with export tables fix

echo "=========================================="
echo "Starting DeepDive Engine Backend"
echo "=========================================="

echo "🔧 Step 0: Fixing enum values (outside Prisma transaction)..."
node ./scripts/fix-enum-values.js || true

echo "🔧 Step 0.5: Creating export tables if needed..."
node ./scripts/fix-export-tables.js
if [ $? -ne 0 ]; then
  echo "⚠️ fix-export-tables.js failed, but continuing..."
fi

echo "🔧 Step 1: Resolving failed migrations..."

# Check if the migration is marked as failed and resolve it
# Use --schema to ensure Prisma finds the schema
npx prisma migrate resolve --applied 20251204000000_add_team_collaboration --schema=./prisma/schema.prisma || true

echo "🔄 Step 2: Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "🔧 Step 2.5: Regenerating Prisma Client..."
npx prisma generate --schema=./prisma/schema.prisma

echo "🚀 Step 3: Starting application..."
exec node dist/main
