#!/bin/sh
set -e

echo "================================"
echo "Starting DeepDive Backend..."
echo "================================"

echo ""
echo "📊 DIAGNOSTIC: Checking current database state..."
npx prisma db execute --stdin << 'EOSQL' || echo "⚠️ Diagnostic skipped"
DO $$
DECLARE
    rec RECORD;
    migration_count INTEGER;
    col_exists BOOLEAN;
    tbl_exists BOOLEAN;
BEGIN
    -- Count migrations
    SELECT COUNT(*) INTO migration_count FROM "_prisma_migrations";
    RAISE NOTICE '📋 Total migrations applied: %', migration_count;

    -- List recent 2026 migrations
    RAISE NOTICE '🕐 Recent 2026 migrations:';
    FOR rec IN
        SELECT migration_name, finished_at
        FROM "_prisma_migrations"
        WHERE migration_name LIKE '2026%'
        ORDER BY started_at DESC
        LIMIT 20
    LOOP
        RAISE NOTICE '  - %: %', rec.migration_name, CASE WHEN rec.finished_at IS NOT NULL THEN 'completed' ELSE 'incomplete' END;
    END LOOP;

    -- Check critical tables/columns
    RAISE NOTICE '🔍 Critical structure checks:';

    -- Check tool_configs.secret_key
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tool_configs' AND column_name = 'secret_key'
    ) INTO col_exists;
    RAISE NOTICE '  tool_configs.secret_key: %', CASE WHEN col_exists THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check login_history table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'login_history'
    ) INTO tbl_exists;
    RAISE NOTICE '  login_history table: %', CASE WHEN tbl_exists THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check secrets table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'secrets'
    ) INTO tbl_exists;
    RAISE NOTICE '  secrets table: %', CASE WHEN tbl_exists THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check social_platform_connections table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_platform_connections'
    ) INTO tbl_exists;
    RAISE NOTICE '  social_platform_connections table: %', CASE WHEN tbl_exists THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check social_contents table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_contents'
    ) INTO tbl_exists;
    RAISE NOTICE '  social_contents table: %', CASE WHEN tbl_exists THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check ai_models.secret_key
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'secret_key'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.secret_key: %', CASE WHEN col_exists THEN 'EXISTS' ELSE 'MISSING' END;

    -- Check ai_models.is_reasoning
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'is_reasoning'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.is_reasoning: %', CASE WHEN col_exists THEN 'EXISTS' ELSE 'MISSING' END;
END $$;
EOSQL
echo "✅ Diagnostic completed!"

echo ""
echo "🔧 Running comprehensive database structure fix..."
npx prisma db execute --schema=prisma/schema --file=./prisma/fix-all-missing-structures.sql || echo "⚠️ Some fixes skipped (may already be applied)"
echo "✅ Structure fix completed!"

echo ""
echo "🔧 Fixing Google Drive table schema..."
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
echo "✅ Google Drive schema fix completed!"

echo ""
echo "🔄 Running database migrations..."
if npx prisma migrate deploy; then
    echo "✅ Migrations completed successfully!"
else
    echo "❌ Migration failed with exit code $?"
    exit 1
fi

echo ""
echo "📊 POST-FIX: Verifying database state..."
npx prisma db execute --stdin << 'EOSQL' || echo "⚠️ Verification skipped"
DO $$
DECLARE
    col_exists BOOLEAN;
    tbl_exists BOOLEAN;
BEGIN
    RAISE NOTICE '🔍 Final structure verification:';

    -- Check tool_configs.secret_key
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tool_configs' AND column_name = 'secret_key'
    ) INTO col_exists;
    RAISE NOTICE '  tool_configs.secret_key: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check login_history table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'login_history'
    ) INTO tbl_exists;
    RAISE NOTICE '  login_history table: %', CASE WHEN tbl_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check secrets table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'secrets'
    ) INTO tbl_exists;
    RAISE NOTICE '  secrets table: %', CASE WHEN tbl_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check social_platform_connections table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_platform_connections'
    ) INTO tbl_exists;
    RAISE NOTICE '  social_platform_connections table: %', CASE WHEN tbl_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check social_contents table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_contents'
    ) INTO tbl_exists;
    RAISE NOTICE '  social_contents table: %', CASE WHEN tbl_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check ai_models.secret_key
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'secret_key'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.secret_key: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check ai_models.is_reasoning
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'is_reasoning'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.is_reasoning: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check secrets access tracking columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'secrets' AND column_name = 'last_accessed_at'
    ) INTO col_exists;
    RAISE NOTICE '  secrets.last_accessed_at: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'secrets' AND column_name = 'access_count'
    ) INTO col_exists;
    RAISE NOTICE '  secrets.access_count: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'secrets' AND column_name = 'current_version'
    ) INTO col_exists;
    RAISE NOTICE '  secrets.current_version: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check social_publish_logs table
    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'social_publish_logs'
    ) INTO tbl_exists;
    RAISE NOTICE '  social_publish_logs table: %', CASE WHEN tbl_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    -- Check ai_models capability columns
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'api_format'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.api_format: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'supports_temperature'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.supports_temperature: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'supports_streaming'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.supports_streaming: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'supports_function_calling'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.supports_function_calling: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'supports_vision'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.supports_vision: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'token_param_name'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.token_param_name: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'default_timeout_ms'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.default_timeout_ms: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'price_input_per_million'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.price_input_per_million: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'price_output_per_million'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.price_output_per_million: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ai_models' AND column_name = 'priority'
    ) INTO col_exists;
    RAISE NOTICE '  ai_models.priority: %', CASE WHEN col_exists THEN '✅ OK' ELSE '❌ MISSING' END;
END $$;
EOSQL
echo "✅ Verification completed!"

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
