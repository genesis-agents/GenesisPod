-- Emergency fix: Add missing values to AIModelType enum
-- Error: invalid input value for enum "AIModelType": "EMBEDDING"

-- Step 1: Add EMBEDDING to AIModelType enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'EMBEDDING'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIModelType')
    ) THEN
        ALTER TYPE "AIModelType" ADD VALUE 'EMBEDDING';
    END IF;
END $$;

-- Step 2: Add RERANK to AIModelType enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'RERANK'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIModelType')
    ) THEN
        ALTER TYPE "AIModelType" ADD VALUE 'RERANK';
    END IF;
END $$;

-- Step 3: Add MULTIMODAL to AIModelType enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'MULTIMODAL'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIModelType')
    ) THEN
        ALTER TYPE "AIModelType" ADD VALUE 'MULTIMODAL';
    END IF;
END $$;

-- Step 4: Add IMAGE_EDITING to AIModelType enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'IMAGE_EDITING'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'AIModelType')
    ) THEN
        ALTER TYPE "AIModelType" ADD VALUE 'IMAGE_EDITING';
    END IF;
END $$;
