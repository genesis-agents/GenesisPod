#!/bin/sh

echo "🔧 Step 1: Resolving failed migrations..."

# Check if the migration is marked as failed and resolve it
# Use --schema to ensure Prisma finds the schema
npx prisma migrate resolve --applied 20251204000000_add_team_collaboration --schema=./prisma/schema.prisma || true

echo "🔄 Step 2: Running database migrations..."
npx prisma migrate deploy --schema=./prisma/schema.prisma

echo "🚀 Step 3: Starting application..."
exec node dist/main
