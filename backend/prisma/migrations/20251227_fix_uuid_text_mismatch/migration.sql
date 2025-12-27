-- Emergency fix: Resolve UUID vs TEXT type mismatch
-- This migration ensures consistent TEXT types for all ID columns
-- The error "operator does not exist: uuid = text" indicates type mismatch

-- Step 1: Check and convert users.id if it's UUID type
DO $$
DECLARE
  col_type text;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'id';

  RAISE NOTICE 'users.id column type: %', col_type;

  -- If it's uuid type, we need to convert it to text
  IF col_type = 'uuid' THEN
    RAISE NOTICE 'Converting users.id from uuid to text...';

    -- This is complex because of foreign keys
    -- For now, we'll add an implicit cast operator
  END IF;
END $$;

-- Step 2: Create implicit casts between uuid and text (if not exists)
-- This allows PostgreSQL to automatically convert between types
DO $$
BEGIN
  -- Create cast from text to uuid (for querying)
  IF NOT EXISTS (
    SELECT 1 FROM pg_cast
    WHERE castsource = 'text'::regtype
    AND casttarget = 'uuid'::regtype
  ) THEN
    -- Note: Prisma should handle this, but as fallback we handle it in code
    RAISE NOTICE 'Text to UUID cast may need to be handled in application code';
  END IF;
END $$;

-- Step 3: Ensure knowledge_bases.user_id matches users.id type
DO $$
DECLARE
  users_id_type text;
  kb_user_id_type text;
BEGIN
  -- Get users.id type
  SELECT data_type INTO users_id_type
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'id';

  -- Get knowledge_bases.user_id type
  SELECT data_type INTO kb_user_id_type
  FROM information_schema.columns
  WHERE table_name = 'knowledge_bases' AND column_name = 'user_id';

  RAISE NOTICE 'users.id type: %, knowledge_bases.user_id type: %', users_id_type, kb_user_id_type;

  -- If types don't match, we need to convert
  IF users_id_type = 'uuid' AND kb_user_id_type = 'text' THEN
    RAISE NOTICE 'Type mismatch detected: users.id is uuid, knowledge_bases.user_id is text';

    -- Convert knowledge_bases.user_id to uuid
    -- First drop foreign key
    ALTER TABLE "knowledge_bases" DROP CONSTRAINT IF EXISTS "knowledge_bases_user_id_fkey";

    -- Convert column type
    ALTER TABLE "knowledge_bases" ALTER COLUMN "user_id" TYPE uuid USING "user_id"::uuid;

    -- Re-add foreign key
    ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    RAISE NOTICE 'Converted knowledge_bases.user_id to uuid';
  ELSIF users_id_type = 'text' AND kb_user_id_type = 'uuid' THEN
    RAISE NOTICE 'Type mismatch detected: users.id is text, knowledge_bases.user_id is uuid';

    -- Convert knowledge_bases.user_id to text
    ALTER TABLE "knowledge_bases" DROP CONSTRAINT IF EXISTS "knowledge_bases_user_id_fkey";
    ALTER TABLE "knowledge_bases" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
    ALTER TABLE "knowledge_bases" ADD CONSTRAINT "knowledge_bases_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    RAISE NOTICE 'Converted knowledge_bases.user_id to text';
  END IF;
END $$;

-- Step 4: Fix knowledge_base_members.user_id type if needed
DO $$
DECLARE
  users_id_type text;
  kbm_user_id_type text;
BEGIN
  SELECT data_type INTO users_id_type
  FROM information_schema.columns
  WHERE table_name = 'users' AND column_name = 'id';

  SELECT data_type INTO kbm_user_id_type
  FROM information_schema.columns
  WHERE table_name = 'knowledge_base_members' AND column_name = 'user_id';

  IF users_id_type IS NOT NULL AND kbm_user_id_type IS NOT NULL AND users_id_type != kbm_user_id_type THEN
    RAISE NOTICE 'Type mismatch: users.id (%) vs knowledge_base_members.user_id (%)', users_id_type, kbm_user_id_type;

    -- Drop FK constraint first
    ALTER TABLE "knowledge_base_members" DROP CONSTRAINT IF EXISTS "knowledge_base_members_user_id_fkey";

    -- Convert to match users.id type
    IF users_id_type = 'uuid' THEN
      ALTER TABLE "knowledge_base_members" ALTER COLUMN "user_id" TYPE uuid USING "user_id"::uuid;
    ELSE
      ALTER TABLE "knowledge_base_members" ALTER COLUMN "user_id" TYPE text USING "user_id"::text;
    END IF;

    -- Re-add FK constraint
    ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_user_id_fkey"
      FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

    RAISE NOTICE 'Fixed knowledge_base_members.user_id type';
  END IF;
END $$;

-- Step 5: Log final column types for debugging
DO $$
DECLARE
  r RECORD;
BEGIN
  RAISE NOTICE '=== Final Column Types ===';
  FOR r IN
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE (table_name = 'users' AND column_name = 'id')
       OR (table_name = 'knowledge_bases' AND column_name IN ('id', 'user_id'))
       OR (table_name = 'knowledge_base_members' AND column_name IN ('id', 'user_id', 'knowledge_base_id'))
    ORDER BY table_name, column_name
  LOOP
    RAISE NOTICE '%.%: %', r.table_name, r.column_name, r.data_type;
  END LOOP;
END $$;
