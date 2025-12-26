#!/bin/sh
set -e

echo "================================"
echo "Starting DeepDive Backend..."
echo "================================"

echo ""
echo "🔧 Fixing Google Drive table schema..."
# Direct SQL fix for Google Drive tables - runs before migrations
npx prisma db execute --stdin << 'EOSQL' || echo "⚠️ Schema fix skipped (may already be applied)"
DO $$
BEGIN
    -- Fix token_expiry column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'google_drive_connections' AND column_name = 'token_expires_at')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'google_drive_connections' AND column_name = 'token_expiry')
    THEN
        ALTER TABLE google_drive_connections RENAME COLUMN token_expires_at TO token_expiry;
    END IF;
    -- Fix storage_limit column
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'google_drive_connections' AND column_name = 'storage_quota')
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'google_drive_connections' AND column_name = 'storage_limit')
    THEN
        ALTER TABLE google_drive_connections RENAME COLUMN storage_quota TO storage_limit;
    END IF;
    -- Add token_expiry if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'google_drive_connections' AND column_name = 'token_expiry')
    THEN
        ALTER TABLE google_drive_connections ADD COLUMN token_expiry TIMESTAMP(3) DEFAULT NOW();
    END IF;
    -- Add storage_limit if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'google_drive_connections' AND column_name = 'storage_limit')
    THEN
        ALTER TABLE google_drive_connections ADD COLUMN storage_limit BIGINT;
    END IF;
    -- Add storage_usage if missing
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'google_drive_connections' AND column_name = 'storage_usage')
    THEN
        ALTER TABLE google_drive_connections ADD COLUMN storage_usage BIGINT;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Schema fix: %', SQLERRM;
END $$;
EOSQL
echo "✅ Schema fix completed!"

echo ""
echo "🔄 Running database migrations..."
if npx prisma migrate deploy; then
    echo "✅ Migrations completed successfully!"
else
    echo "❌ Migration failed with exit code $?"
    exit 1
fi

echo ""
echo "🌱 Running database seed..."
if npm run prisma:seed; then
    echo "✅ Seed completed successfully!"
else
    echo "⚠️  Seed failed, but continuing..."
fi

echo ""
echo "✅ Starting application..."
exec node dist/main
