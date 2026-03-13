-- Add IMAGE_SEARCH to SecretCategory enum
DO $$
BEGIN
    ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'IMAGE_SEARCH';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
