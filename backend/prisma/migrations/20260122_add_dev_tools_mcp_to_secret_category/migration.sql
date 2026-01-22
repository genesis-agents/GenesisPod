-- Add DEV_TOOLS and MCP to SecretCategory enum

-- Add DEV_TOOLS value
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'DEV_TOOLS'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SecretCategory')
    ) THEN
        ALTER TYPE "SecretCategory" ADD VALUE 'DEV_TOOLS';
    END IF;
END$$;

-- Add MCP value
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'MCP'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'SecretCategory')
    ) THEN
        ALTER TYPE "SecretCategory" ADD VALUE 'MCP';
    END IF;
END$$;
