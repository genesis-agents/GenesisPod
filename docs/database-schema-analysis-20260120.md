# Database Schema Analysis Report - 2026-01-20

## Problem Summary

Production database on Railway is missing critical structures that exist in the local Prisma schema:

1. **`tool_configs.secret_key`** - Column does not exist (Prisma Error P2022)
2. **`login_history`** - Table does not exist (Prisma Error P2021)

## Root Cause Analysis

### Local Migrations That Should Create These Structures

| Migration                         | Purpose                               | File Exists |
| --------------------------------- | ------------------------------------- | ----------- |
| `20260120_add_login_history`      | Create login_history table            | YES         |
| `20260120_add_tool_secret_key`    | Add secret_key to tool_configs        | YES         |
| `20260120_fix_missing_structures` | Idempotent fix for missing structures | YES         |

### Possible Causes

1. **Migrations not deployed**: The Railway deployment pipeline might not be running `prisma migrate deploy` successfully
2. **Migration marked as applied but failed**: Prisma marked the migration as applied without actually executing the SQL
3. **Naming convention inconsistency**: Mix of 8-digit (YYYYMMDD) and 14-digit (YYYYMMDDHHMMSS) migration names could cause sorting issues

## Expected Schema vs Actual

### tool_configs Table

**Expected (from Prisma schema):**

```sql
CREATE TABLE tool_configs (
  id VARCHAR(36) PRIMARY KEY,
  tool_id VARCHAR(255) UNIQUE NOT NULL,
  enabled BOOLEAN DEFAULT true,
  display_name VARCHAR(255),
  description TEXT,
  secret_key VARCHAR(100),        -- MISSING IN PRODUCTION
  config JSONB,
  requires_auth BOOLEAN DEFAULT false,
  allowed_roles TEXT[],
  category VARCHAR(255),
  tags TEXT[],
  created_at TIMESTAMP(3) DEFAULT NOW(),
  updated_at TIMESTAMP(3)
);
```

**Actual (in production):**

- `secret_key` column is MISSING

### login_history Table

**Expected (from Prisma schema):**

```sql
CREATE TABLE login_history (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  login_at TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  device TEXT,
  browser TEXT,
  os TEXT,
  location TEXT
);

CREATE INDEX login_history_user_id_idx ON login_history(user_id);
CREATE INDEX login_history_login_at_idx ON login_history(login_at);
```

**Actual (in production):**

- Table DOES NOT EXIST

## Solution Implemented

### 1. Docker Entrypoint SQL Fixes (Immediate)

Added idempotent SQL fixes to `docker-entrypoint.sh` that run BEFORE `prisma migrate deploy`:

```sh
# Fix tool_configs.secret_key
npx prisma db execute --stdin << 'EOSQL'
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'tool_configs' AND column_name = 'secret_key'
    ) THEN
        ALTER TABLE "tool_configs" ADD COLUMN "secret_key" VARCHAR(100);
    END IF;
END $$;
EOSQL

# Create login_history table
npx prisma db execute --stdin << 'EOSQL'
DO $$
BEGIN
    CREATE TABLE IF NOT EXISTS "login_history" (...);
    CREATE INDEX IF NOT EXISTS "login_history_user_id_idx" ON "login_history"("user_id");
    CREATE INDEX IF NOT EXISTS "login_history_login_at_idx" ON "login_history"("login_at");
    -- Add foreign key if not exists
    IF NOT EXISTS (...) THEN
        ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" ...;
    END IF;
END $$;
EOSQL
```

### 2. Diagnostic Output Added

Added diagnostic SQL to entrypoint that outputs:

- Total migration count
- Recent 2026 migrations status
- `tool_configs.secret_key` existence
- `login_history` table existence

### 3. Idempotent Fix Migration

Created `20260120_fix_missing_structures/migration.sql` with idempotent SQL that can be safely re-run.

## Verification Steps

After next deployment, check Railway logs for:

```
📊 DIAGNOSTIC: Checking current database state...
📋 Total migrations applied: XX
🕐 Recent 2026 migrations:
  - 20260120_add_login_history: completed
  - 20260120_add_tool_secret_key: completed
  - 20260120_fix_missing_structures: completed
🔑 tool_configs.secret_key exists: true
📝 login_history table exists: true
```

## Files Modified

1. `backend/docker-entrypoint.sh` - Added diagnostic output and SQL fixes
2. `backend/prisma/migrations/20260120_fix_missing_structures/migration.sql` - Idempotent fix
3. `backend/prisma/check-schema-diff.ts` - Diagnostic script (can be removed after fix)

## Recommendations

1. **Deploy the current changes** to apply the SQL fixes
2. **Monitor the deployment logs** to see the diagnostic output
3. **Consider standardizing migration names** to 14-digit format (YYYYMMDDHHMMSS)
4. **Add migration validation** to CI/CD pipeline to prevent future drift

## Status

- [x] Root cause identified
- [x] Immediate fix implemented (SQL in entrypoint)
- [x] Diagnostic added to deployment
- [ ] Deployed to production
- [ ] Verified fix working
