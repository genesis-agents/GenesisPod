-- Emergency Fix: Google Drive Table Schema
-- Problem: Migration created tables with wrong column names
-- Solution: Add missing columns with correct names

-- Step 1: Add missing columns if they don't exist
DO $$
BEGIN
    -- Add token_expiry column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_connections'
        AND column_name = 'token_expiry'
    ) THEN
        -- Check if token_expires_at exists, copy data then rename
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'google_drive_connections'
            AND column_name = 'token_expires_at'
        ) THEN
            ALTER TABLE "google_drive_connections"
            RENAME COLUMN "token_expires_at" TO "token_expiry";
            RAISE NOTICE 'Renamed token_expires_at to token_expiry';
        ELSE
            -- Column doesn't exist at all, add it
            ALTER TABLE "google_drive_connections"
            ADD COLUMN "token_expiry" TIMESTAMP(3) NOT NULL DEFAULT NOW();
            RAISE NOTICE 'Added token_expiry column';
        END IF;
    ELSE
        RAISE NOTICE 'Column token_expiry already exists';
    END IF;

    -- Add storage_limit column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_connections'
        AND column_name = 'storage_limit'
    ) THEN
        -- Check if storage_quota exists, copy data then rename
        IF EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'google_drive_connections'
            AND column_name = 'storage_quota'
        ) THEN
            ALTER TABLE "google_drive_connections"
            RENAME COLUMN "storage_quota" TO "storage_limit";
            RAISE NOTICE 'Renamed storage_quota to storage_limit';
        ELSE
            -- Column doesn't exist at all, add it
            ALTER TABLE "google_drive_connections"
            ADD COLUMN "storage_limit" BIGINT;
            RAISE NOTICE 'Added storage_limit column';
        END IF;
    ELSE
        RAISE NOTICE 'Column storage_limit already exists';
    END IF;

    -- Ensure storage_usage column exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_connections'
        AND column_name = 'storage_usage'
    ) THEN
        ALTER TABLE "google_drive_connections"
        ADD COLUMN "storage_usage" BIGINT;
        RAISE NOTICE 'Added storage_usage column';
    END IF;

    -- Ensure google_id has unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'google_drive_connections'
        AND indexname = 'google_drive_connections_google_id_key'
    ) THEN
        CREATE UNIQUE INDEX "google_drive_connections_google_id_key"
        ON "google_drive_connections"("google_id");
        RAISE NOTICE 'Added unique index on google_id';
    END IF;

END $$;

-- Step 2: Fix enum types if needed
DO $$
BEGIN
    -- Check and add REVOKED to GoogleDriveConnectionStatus if not exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'REVOKED'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'GoogleDriveConnectionStatus')
    ) THEN
        ALTER TYPE "GoogleDriveConnectionStatus" ADD VALUE IF NOT EXISTS 'REVOKED';
        RAISE NOTICE 'Added REVOKED to GoogleDriveConnectionStatus enum';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        RAISE NOTICE 'REVOKED already exists in enum';
END $$;

-- Step 3: Ensure GoogleDriveSyncAction enum exists with correct values
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoogleDriveSyncAction') THEN
        CREATE TYPE "GoogleDriveSyncAction" AS ENUM ('IMPORT', 'EXPORT');
        RAISE NOTICE 'Created GoogleDriveSyncAction enum';
    END IF;
END $$;

-- Step 4: Fix google_drive_sync_history table if needed
DO $$
BEGIN
    -- Add action column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'action'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "action" "GoogleDriveSyncAction" NOT NULL DEFAULT 'IMPORT';
        RAISE NOTICE 'Added action column to google_drive_sync_history';
    END IF;

    -- Add google_file_id column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'google_file_id'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "google_file_id" TEXT;
        RAISE NOTICE 'Added google_file_id column';
    END IF;

    -- Add google_file_name column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'google_file_name'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "google_file_name" TEXT;
        RAISE NOTICE 'Added google_file_name column';
    END IF;

    -- Add resource_id column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'resource_id'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "resource_id" TEXT;
        RAISE NOTICE 'Added resource_id column';
    END IF;

    -- Add export_format column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'export_format'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "export_format" TEXT;
        RAISE NOTICE 'Added export_format column';
    END IF;

    -- Add target_folder_id column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'target_folder_id'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "target_folder_id" TEXT;
        RAISE NOTICE 'Added target_folder_id column';
    END IF;

    -- Add error column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'error'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "error" TEXT;
        RAISE NOTICE 'Added error column';
    END IF;

    -- Add metadata column if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_sync_history'
        AND column_name = 'metadata'
    ) THEN
        ALTER TABLE "google_drive_sync_history"
        ADD COLUMN "metadata" JSONB;
        RAISE NOTICE 'Added metadata column';
    END IF;
END $$;

-- Step 5: Fix google_drive_imported_files table if needed
DO $$
BEGIN
    -- Rename google_mime_type to mime_type if needed
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_imported_files'
        AND column_name = 'google_mime_type'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_imported_files'
        AND column_name = 'mime_type'
    ) THEN
        ALTER TABLE "google_drive_imported_files"
        RENAME COLUMN "google_mime_type" TO "mime_type";
        RAISE NOTICE 'Renamed google_mime_type to mime_type';
    END IF;

    -- Add mime_type if neither exists
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_imported_files'
        AND column_name = 'mime_type'
    ) THEN
        ALTER TABLE "google_drive_imported_files"
        ADD COLUMN "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream';
        RAISE NOTICE 'Added mime_type column';
    END IF;

    -- Add google_modified_time if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'google_drive_imported_files'
        AND column_name = 'google_modified_time'
    ) THEN
        ALTER TABLE "google_drive_imported_files"
        ADD COLUMN "google_modified_time" TIMESTAMP(3) NOT NULL DEFAULT NOW();
        RAISE NOTICE 'Added google_modified_time column';
    END IF;

    -- Ensure resource_id has unique constraint
    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE tablename = 'google_drive_imported_files'
        AND indexname = 'google_drive_imported_files_resource_id_key'
    ) THEN
        -- First remove duplicates if any
        DELETE FROM "google_drive_imported_files" a
        USING "google_drive_imported_files" b
        WHERE a.id > b.id AND a."resource_id" = b."resource_id";

        CREATE UNIQUE INDEX "google_drive_imported_files_resource_id_key"
        ON "google_drive_imported_files"("resource_id");
        RAISE NOTICE 'Added unique index on resource_id';
    END IF;
END $$;

-- Done!
SELECT 'Google Drive schema emergency fix completed successfully' AS result;
