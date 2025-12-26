-- Google Drive Integration Migration
-- Uses simpler syntax compatible with deploy-migrations.ts

-- Step 1: Create enum types (safe to run multiple times)
DO $$ BEGIN CREATE TYPE "GoogleDriveConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'EXPIRED', 'DISCONNECTED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "GoogleDriveSyncType" AS ENUM ('FULL', 'INCREMENTAL', 'MANUAL'); EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN CREATE TYPE "GoogleDriveSyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Step 2: Create google_drive_connections table
CREATE TABLE IF NOT EXISTS "google_drive_connections" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "user_id" TEXT NOT NULL UNIQUE,
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
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Create google_drive_sync_history table
CREATE TABLE IF NOT EXISTS "google_drive_sync_history" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "connection_id" TEXT NOT NULL,
  "sync_type" "GoogleDriveSyncType" NOT NULL DEFAULT 'INCREMENTAL',
  "status" "GoogleDriveSyncStatus" NOT NULL DEFAULT 'PENDING',
  "files_processed" INTEGER NOT NULL DEFAULT 0,
  "files_imported" INTEGER NOT NULL DEFAULT 0,
  "files_updated" INTEGER NOT NULL DEFAULT 0,
  "files_failed" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completed_at" TIMESTAMP(3)
);

-- Step 4: Create google_drive_imported_files table
CREATE TABLE IF NOT EXISTS "google_drive_imported_files" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "connection_id" TEXT NOT NULL,
  "google_file_id" TEXT NOT NULL,
  "google_file_name" TEXT NOT NULL,
  "google_mime_type" TEXT NOT NULL,
  "resource_id" TEXT,
  "file_hash" TEXT,
  "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "google_drive_imported_files_unique" UNIQUE ("connection_id", "google_file_id")
);

-- Step 5: Create indexes
CREATE INDEX IF NOT EXISTS "google_drive_connections_google_id_idx" ON "google_drive_connections"("google_id");

CREATE INDEX IF NOT EXISTS "google_drive_connections_status_idx" ON "google_drive_connections"("user_id", "status");

CREATE INDEX IF NOT EXISTS "google_drive_sync_history_connection_id_idx" ON "google_drive_sync_history"("connection_id", "started_at");

CREATE INDEX IF NOT EXISTS "google_drive_sync_history_status_idx" ON "google_drive_sync_history"("status", "started_at");

CREATE INDEX IF NOT EXISTS "google_drive_imported_files_connection_idx" ON "google_drive_imported_files"("connection_id", "google_file_id");

CREATE INDEX IF NOT EXISTS "google_drive_imported_files_resource_idx" ON "google_drive_imported_files"("resource_id");

-- Step 6: Add foreign keys (use DO blocks to handle already exists)
DO $$ BEGIN ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "google_drive_sync_history" ADD CONSTRAINT "google_drive_sync_history_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN ALTER TABLE "google_drive_imported_files" ADD CONSTRAINT "google_drive_imported_files_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE; EXCEPTION WHEN duplicate_object THEN null; END $$;
