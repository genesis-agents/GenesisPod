-- Google Drive Integration Migration
-- Step 1: Create enum types

DO $$ BEGIN
  CREATE TYPE "GoogleDriveConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'EXPIRED', 'DISCONNECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GoogleDriveSyncType" AS ENUM ('FULL', 'INCREMENTAL', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "GoogleDriveSyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 2: Create google_drive_connections table

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS "google_drive_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "google_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "photo_url" TEXT,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3) NOT NULL,
    "scopes" TEXT[],
    "root_folder_id" TEXT,
    "storage_quota" BIGINT,
    "storage_usage" BIGINT,
    "status" "GoogleDriveConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_error" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "sync_enabled" BOOLEAN NOT NULL DEFAULT true,
    "sync_folder_ids" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_drive_connections_pkey" PRIMARY KEY ("id")
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 3: Create indexes for google_drive_connections

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "google_drive_connections_user_id_key" ON "google_drive_connections"("user_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "google_drive_connections_user_id_status_idx" ON "google_drive_connections"("user_id", "status");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "google_drive_connections_google_id_idx" ON "google_drive_connections"("google_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 4: Add foreign key for google_drive_connections

DO $$ BEGIN
  ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 5: Create google_drive_sync_history table

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS "google_drive_sync_history" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "sync_type" "GoogleDriveSyncType" NOT NULL DEFAULT 'INCREMENTAL',
    "status" "GoogleDriveSyncStatus" NOT NULL DEFAULT 'PENDING',
    "files_processed" INTEGER NOT NULL DEFAULT 0,
    "files_imported" INTEGER NOT NULL DEFAULT 0,
    "files_updated" INTEGER NOT NULL DEFAULT 0,
    "files_failed" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "google_drive_sync_history_pkey" PRIMARY KEY ("id")
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 6: Create indexes for google_drive_sync_history

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "google_drive_sync_history_connection_id_started_at_idx" ON "google_drive_sync_history"("connection_id", "started_at");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "google_drive_sync_history_status_started_at_idx" ON "google_drive_sync_history"("status", "started_at");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 7: Add foreign key for google_drive_sync_history

DO $$ BEGIN
  ALTER TABLE "google_drive_sync_history" ADD CONSTRAINT "google_drive_sync_history_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 8: Create google_drive_imported_files table

DO $$ BEGIN
  CREATE TABLE IF NOT EXISTS "google_drive_imported_files" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "google_file_id" TEXT NOT NULL,
    "google_file_name" TEXT NOT NULL,
    "google_mime_type" TEXT NOT NULL,
    "resource_id" TEXT,
    "file_hash" TEXT,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_drive_imported_files_pkey" PRIMARY KEY ("id")
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 9: Create indexes for google_drive_imported_files

DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS "google_drive_imported_files_connection_id_google_file_id_key" ON "google_drive_imported_files"("connection_id", "google_file_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "google_drive_imported_files_connection_id_google_file_id_idx" ON "google_drive_imported_files"("connection_id", "google_file_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS "google_drive_imported_files_resource_id_idx" ON "google_drive_imported_files"("resource_id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Step 10: Add foreign key for google_drive_imported_files

DO $$ BEGIN
  ALTER TABLE "google_drive_imported_files" ADD CONSTRAINT "google_drive_imported_files_connection_id_fkey"
  FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
