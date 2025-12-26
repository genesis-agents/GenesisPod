-- Google Drive Integration Migration (Force)
-- Creates all Google Drive tables in a single transaction

DO $$
BEGIN
  -- Create enum types
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoogleDriveConnectionStatus') THEN
    CREATE TYPE "GoogleDriveConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'EXPIRED', 'DISCONNECTED');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoogleDriveSyncType') THEN
    CREATE TYPE "GoogleDriveSyncType" AS ENUM ('FULL', 'INCREMENTAL', 'MANUAL');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GoogleDriveSyncStatus') THEN
    CREATE TYPE "GoogleDriveSyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED', 'CANCELLED');
  END IF;

  -- Create google_drive_connections table
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'google_drive_connections') THEN
    CREATE TABLE "google_drive_connections" (
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

    CREATE INDEX "google_drive_connections_google_id_idx" ON "google_drive_connections"("google_id");
    CREATE INDEX "google_drive_connections_status_idx" ON "google_drive_connections"("user_id", "status");

    ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
  END IF;

  -- Create google_drive_sync_history table
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'google_drive_sync_history') THEN
    CREATE TABLE "google_drive_sync_history" (
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

    CREATE INDEX "google_drive_sync_history_connection_id_idx" ON "google_drive_sync_history"("connection_id", "started_at");
    CREATE INDEX "google_drive_sync_history_status_idx" ON "google_drive_sync_history"("status", "started_at");

    ALTER TABLE "google_drive_sync_history" ADD CONSTRAINT "google_drive_sync_history_connection_id_fkey"
      FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE;
  END IF;

  -- Create google_drive_imported_files table
  IF NOT EXISTS (SELECT 1 FROM pg_tables WHERE tablename = 'google_drive_imported_files') THEN
    CREATE TABLE "google_drive_imported_files" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "connection_id" TEXT NOT NULL,
      "google_file_id" TEXT NOT NULL,
      "google_file_name" TEXT NOT NULL,
      "google_mime_type" TEXT NOT NULL,
      "resource_id" TEXT,
      "file_hash" TEXT,
      "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE ("connection_id", "google_file_id")
    );

    CREATE INDEX "google_drive_imported_files_connection_idx" ON "google_drive_imported_files"("connection_id", "google_file_id");
    CREATE INDEX "google_drive_imported_files_resource_idx" ON "google_drive_imported_files"("resource_id");

    ALTER TABLE "google_drive_imported_files" ADD CONSTRAINT "google_drive_imported_files_connection_id_fkey"
      FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE;
  END IF;

  RAISE NOTICE 'Google Drive tables created successfully';
END $$;
