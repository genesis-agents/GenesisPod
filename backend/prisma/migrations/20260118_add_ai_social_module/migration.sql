-- AI Social Module Migration
-- Creates tables for social media content publishing (WeChat MP, Xiaohongshu)

-- Create SocialPlatformType enum
DO $$ BEGIN
    CREATE TYPE "SocialPlatformType" AS ENUM ('WECHAT_MP', 'XIAOHONGSHU');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create SocialContentType enum
DO $$ BEGIN
    CREATE TYPE "SocialContentType" AS ENUM ('WECHAT_ARTICLE', 'XIAOHONGSHU_NOTE');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create SocialContentStatus enum
DO $$ BEGIN
    CREATE TYPE "SocialContentStatus" AS ENUM ('DRAFT', 'PENDING', 'SCHEDULED', 'PUBLISHING', 'PUBLISHED', 'FAILED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create SocialContentSourceType enum
DO $$ BEGIN
    CREATE TYPE "SocialContentSourceType" AS ENUM ('MANUAL', 'EXTERNAL_URL', 'AI_EXPLORE', 'AI_RESEARCH', 'AI_OFFICE', 'AI_WRITING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create SocialReviewStatus enum
DO $$ BEGIN
    CREATE TYPE "SocialReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVISION_REQUESTED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create social_platform_connections table
CREATE TABLE IF NOT EXISTS "social_platform_connections" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "platform_type" "SocialPlatformType" NOT NULL,
    "account_name" TEXT,
    "account_id" TEXT,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "session_data" JSONB,
    "cookies" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_sync_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_platform_connections_pkey" PRIMARY KEY ("id")
);

-- Create social_contents table
CREATE TABLE IF NOT EXISTS "social_contents" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "connection_id" TEXT,
    "content_type" "SocialContentType" NOT NULL,
    "source_type" "SocialContentSourceType" NOT NULL DEFAULT 'MANUAL',
    "source_id" TEXT,
    "source_url" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "digest" TEXT,
    "cover_image_url" TEXT,
    "images" TEXT[],
    "tags" TEXT[],
    "status" "SocialContentStatus" NOT NULL DEFAULT 'DRAFT',
    "review_status" "SocialReviewStatus" NOT NULL DEFAULT 'PENDING',
    "review_notes" TEXT,
    "reviewed_by" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "compliance_check" JSONB,
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "external_id" TEXT,
    "external_url" TEXT,
    "error_message" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "social_contents_pkey" PRIMARY KEY ("id")
);

-- Create social_publish_logs table for tracking publish attempts
CREATE TABLE IF NOT EXISTS "social_publish_logs" (
    "id" TEXT NOT NULL,
    "content_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "details" JSONB,
    "error_message" TEXT,
    "screenshot_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "social_publish_logs_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint on social_platform_connections (user_id, platform_type)
CREATE UNIQUE INDEX IF NOT EXISTS "social_platform_connections_user_id_platform_type_key"
ON "social_platform_connections"("user_id", "platform_type");

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS "social_platform_connections_user_id_idx" ON "social_platform_connections"("user_id");
CREATE INDEX IF NOT EXISTS "social_platform_connections_platform_type_idx" ON "social_platform_connections"("platform_type");
CREATE INDEX IF NOT EXISTS "social_platform_connections_is_active_idx" ON "social_platform_connections"("is_active");

CREATE INDEX IF NOT EXISTS "social_contents_user_id_idx" ON "social_contents"("user_id");
CREATE INDEX IF NOT EXISTS "social_contents_connection_id_idx" ON "social_contents"("connection_id");
CREATE INDEX IF NOT EXISTS "social_contents_content_type_idx" ON "social_contents"("content_type");
CREATE INDEX IF NOT EXISTS "social_contents_source_type_idx" ON "social_contents"("source_type");
CREATE INDEX IF NOT EXISTS "social_contents_status_idx" ON "social_contents"("status");
CREATE INDEX IF NOT EXISTS "social_contents_review_status_idx" ON "social_contents"("review_status");
CREATE INDEX IF NOT EXISTS "social_contents_scheduled_at_idx" ON "social_contents"("scheduled_at");
CREATE INDEX IF NOT EXISTS "social_contents_created_at_idx" ON "social_contents"("created_at");

CREATE INDEX IF NOT EXISTS "social_publish_logs_content_id_idx" ON "social_publish_logs"("content_id");
CREATE INDEX IF NOT EXISTS "social_publish_logs_created_at_idx" ON "social_publish_logs"("created_at");

-- Add foreign key constraints
ALTER TABLE "social_platform_connections"
ADD CONSTRAINT "social_platform_connections_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_contents"
ADD CONSTRAINT "social_contents_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "social_contents"
ADD CONSTRAINT "social_contents_connection_id_fkey"
FOREIGN KEY ("connection_id") REFERENCES "social_platform_connections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "social_contents"
ADD CONSTRAINT "social_contents_reviewed_by_fkey"
FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "social_publish_logs"
ADD CONSTRAINT "social_publish_logs_content_id_fkey"
FOREIGN KEY ("content_id") REFERENCES "social_contents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
