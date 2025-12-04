#!/bin/sh
set -e

echo "🔧 Step 1: Resolving failed migrations..."

# Check if the migration is marked as failed and resolve it
npx prisma migrate resolve --applied 20251204000000_add_team_collaboration 2>&1 || echo "Migration resolve completed or not needed"

echo "🔄 Step 2: Running database migrations..."
npx prisma migrate deploy

echo "🚀 Step 3: Starting application..."
exec node dist/main
