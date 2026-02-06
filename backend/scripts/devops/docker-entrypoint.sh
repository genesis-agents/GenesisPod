#!/bin/sh
# Version: 8 - Clean migration approach

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

echo "🔧 Step 1: Resolving known failed migration..."
# Only resolve the historically problematic migration
npx prisma migrate resolve --applied 20251204000000_add_team_collaboration --schema=./prisma/schema.prisma || true

echo "🔄 Step 2: Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "🔧 Step 2.5: Regenerating Prisma Client..."
npx prisma generate --schema=./prisma/schema.prisma

echo "🚀 Step 3: Starting application..."
exec node --max-old-space-size=512 dist/main
