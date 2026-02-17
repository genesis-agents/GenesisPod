-- Add FINANCE to SecretCategory enum
DO $$
BEGIN
    ALTER TYPE "SecretCategory" ADD VALUE IF NOT EXISTS 'FINANCE';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
