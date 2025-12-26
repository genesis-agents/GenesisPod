-- Fix Google Drive tables to match Prisma schema
-- Drop existing tables with wrong structure and recreate correctly

-- Drop tables in dependency order
DROP TABLE IF EXISTS "google_drive_imported_files" CASCADE;
DROP TABLE IF EXISTS "google_drive_sync_history" CASCADE;
DROP TABLE IF EXISTS "google_drive_connections" CASCADE;

-- Drop old/wrong enums
DROP TYPE IF EXISTS "GoogleDriveConnectionStatus" CASCADE;
DROP TYPE IF EXISTS "GoogleDriveSyncType" CASCADE;
DROP TYPE IF EXISTS "GoogleDriveSyncAction" CASCADE;
DROP TYPE IF EXISTS "GoogleDriveSyncStatus" CASCADE;

-- Create correct enums
CREATE TYPE "GoogleDriveConnectionStatus" AS ENUM ('ACTIVE', 'ERROR', 'EXPIRED', 'REVOKED');
CREATE TYPE "GoogleDriveSyncAction" AS ENUM ('IMPORT', 'EXPORT');
CREATE TYPE "GoogleDriveSyncStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'SUCCESS', 'FAILED');

-- Create google_drive_connections with correct schema
CREATE TABLE "google_drive_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "token_expiry" TIMESTAMP(3) NOT NULL,
    "google_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT,
    "photo_url" TEXT,
    "storage_limit" BIGINT,
    "storage_usage" BIGINT,
    "status" "GoogleDriveConnectionStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_error" TEXT,
    "last_sync_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_drive_connections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_connections_user_id_key" ON "google_drive_connections"("user_id");
CREATE UNIQUE INDEX "google_drive_connections_google_id_key" ON "google_drive_connections"("google_id");
CREATE INDEX "google_drive_connections_user_id_status_idx" ON "google_drive_connections"("user_id", "status");
CREATE INDEX "google_drive_connections_google_id_idx" ON "google_drive_connections"("google_id");

ALTER TABLE "google_drive_connections" ADD CONSTRAINT "google_drive_connections_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create google_drive_sync_history with correct schema
CREATE TABLE "google_drive_sync_history" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "action" "GoogleDriveSyncAction" NOT NULL,
    "status" "GoogleDriveSyncStatus" NOT NULL,
    "google_file_id" TEXT,
    "google_file_name" TEXT,
    "resource_id" TEXT,
    "export_format" TEXT,
    "target_folder_id" TEXT,
    "error" TEXT,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL,
    "completed_at" TIMESTAMP(3),
    CONSTRAINT "google_drive_sync_history_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "google_drive_sync_history_connection_id_started_at_idx" ON "google_drive_sync_history"("connection_id", "started_at");
CREATE INDEX "google_drive_sync_history_status_started_at_idx" ON "google_drive_sync_history"("status", "started_at");

ALTER TABLE "google_drive_sync_history" ADD CONSTRAINT "google_drive_sync_history_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create google_drive_imported_files with correct schema
CREATE TABLE "google_drive_imported_files" (
    "id" TEXT NOT NULL,
    "connection_id" TEXT NOT NULL,
    "google_file_id" TEXT NOT NULL,
    "google_file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "google_modified_time" TIMESTAMP(3) NOT NULL,
    "resource_id" TEXT NOT NULL,
    "last_synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_drive_imported_files_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "google_drive_imported_files_resource_id_key" ON "google_drive_imported_files"("resource_id");
CREATE UNIQUE INDEX "google_drive_imported_files_connection_id_google_file_id_key" ON "google_drive_imported_files"("connection_id", "google_file_id");
CREATE INDEX "google_drive_imported_files_connection_id_google_file_id_idx" ON "google_drive_imported_files"("connection_id", "google_file_id");
CREATE INDEX "google_drive_imported_files_resource_id_idx" ON "google_drive_imported_files"("resource_id");

ALTER TABLE "google_drive_imported_files" ADD CONSTRAINT "google_drive_imported_files_connection_id_fkey"
    FOREIGN KEY ("connection_id") REFERENCES "google_drive_connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
