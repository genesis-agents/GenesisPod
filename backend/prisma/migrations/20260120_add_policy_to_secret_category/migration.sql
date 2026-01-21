-- Add POLICY to SecretCategory enum
-- This allows policy research tools (Congress.gov API etc.) to have their API keys properly categorized

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'POLICY'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SecretCategory')
    ) THEN
        ALTER TYPE "SecretCategory" ADD VALUE 'POLICY';
    END IF;
END
$$;
