-- AddGoogleDriveFileIds
-- Add google_drive_file_ids column to knowledge_bases table

-- Check if column exists before adding (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'knowledge_bases'
        AND column_name = 'google_drive_file_ids'
    ) THEN
        ALTER TABLE "knowledge_bases" ADD COLUMN "google_drive_file_ids" JSONB DEFAULT '[]'::jsonb;
    END IF;
END $$;
