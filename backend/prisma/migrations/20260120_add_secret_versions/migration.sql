-- Add currentVersion column to secrets table
ALTER TABLE "secrets" ADD COLUMN IF NOT EXISTS "current_version" INT NOT NULL DEFAULT 1;

-- Create secret_versions table for version history
CREATE TABLE IF NOT EXISTS "secret_versions" (
    "id" TEXT NOT NULL,
    "secret_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "encrypted_value" TEXT NOT NULL,
    "iv" VARCHAR(32) NOT NULL,
    "key_version" INTEGER NOT NULL DEFAULT 1,
    "checksum" VARCHAR(64) NOT NULL,
    "created_by" VARCHAR(100),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "change_note" TEXT,

    CONSTRAINT "secret_versions_pkey" PRIMARY KEY ("id")
);

-- Add unique constraint on secret_id + version
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_secret_id_version_key" UNIQUE ("secret_id", "version");

-- Add foreign key constraint
ALTER TABLE "secret_versions" ADD CONSTRAINT "secret_versions_secret_id_fkey" FOREIGN KEY ("secret_id") REFERENCES "secrets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add indexes
CREATE INDEX IF NOT EXISTS "secret_versions_secret_id_idx" ON "secret_versions"("secret_id");
CREATE INDEX IF NOT EXISTS "secret_versions_created_at_idx" ON "secret_versions"("created_at");
