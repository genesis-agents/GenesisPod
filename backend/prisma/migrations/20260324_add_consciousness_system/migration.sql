-- 意识上传系统 (Consciousness Upload System)

-- Enums
CREATE TYPE "ConsciousnessStatus" AS ENUM ('DRAFT', 'COLLECTING', 'ANALYZING', 'READY', 'ARCHIVED');
CREATE TYPE "ConsciousnessDataSourceType" AS ENUM ('TEXT', 'DOCUMENT', 'CHAT_HISTORY', 'SOCIAL_MEDIA', 'KNOWLEDGE_BASE', 'NOTES');
CREATE TYPE "ConsciousnessSharePermission" AS ENUM ('PRIVATE', 'SHARED', 'PUBLIC');

-- 意识档案
CREATE TABLE "consciousness_profiles" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "avatar_url" TEXT,
    "status" "ConsciousnessStatus" NOT NULL DEFAULT 'DRAFT',
    "personality_model" JSONB,
    "writing_style" JSONB,
    "knowledge_domains" JSONB,
    "share_permission" "ConsciousnessSharePermission" NOT NULL DEFAULT 'PRIVATE',
    "total_data_sources" INTEGER NOT NULL DEFAULT 0,
    "total_memories" INTEGER NOT NULL DEFAULT 0,
    "total_conversations" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "analyzed_at" TIMESTAMP(3),
    CONSTRAINT "consciousness_profiles_pkey" PRIMARY KEY ("id")
);

-- 数据源
CREATE TABLE "consciousness_data_sources" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "type" "ConsciousnessDataSourceType" NOT NULL,
    "name" VARCHAR(300) NOT NULL,
    "content" TEXT,
    "file_url" TEXT,
    "file_size" INTEGER,
    "mime_type" VARCHAR(100),
    "is_processed" BOOLEAN NOT NULL DEFAULT false,
    "processed_at" TIMESTAMP(3),
    "extracted_data" JSONB,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consciousness_data_sources_pkey" PRIMARY KEY ("id")
);

-- 记忆
CREATE TABLE "consciousness_memories" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "category" VARCHAR(100) NOT NULL,
    "topic" VARCHAR(300) NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "source_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "consciousness_memories_pkey" PRIMARY KEY ("id")
);

-- 对话
CREATE TABLE "consciousness_conversations" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "summary" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "consciousness_conversations_pkey" PRIMARY KEY ("id")
);

-- 消息
CREATE TABLE "consciousness_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "content" TEXT NOT NULL,
    "memories_used" JSONB,
    "tokens" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consciousness_messages_pkey" PRIMARY KEY ("id")
);

-- 分享
CREATE TABLE "consciousness_shares" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "shared_with_user_id" TEXT NOT NULL,
    "can_chat" BOOLEAN NOT NULL DEFAULT true,
    "can_view_memories" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "consciousness_shares_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "consciousness_profiles_user_id_status_idx" ON "consciousness_profiles"("user_id", "status");
CREATE INDEX "consciousness_profiles_user_id_updated_at_idx" ON "consciousness_profiles"("user_id", "updated_at");

CREATE INDEX "consciousness_data_sources_profile_id_type_idx" ON "consciousness_data_sources"("profile_id", "type");
CREATE INDEX "consciousness_data_sources_profile_id_is_processed_idx" ON "consciousness_data_sources"("profile_id", "is_processed");

CREATE INDEX "consciousness_memories_profile_id_category_idx" ON "consciousness_memories"("profile_id", "category");
CREATE INDEX "consciousness_memories_profile_id_importance_idx" ON "consciousness_memories"("profile_id", "importance");

CREATE INDEX "consciousness_conversations_profile_id_updated_at_idx" ON "consciousness_conversations"("profile_id", "updated_at");
CREATE INDEX "consciousness_conversations_user_id_updated_at_idx" ON "consciousness_conversations"("user_id", "updated_at");

CREATE INDEX "consciousness_messages_conversation_id_created_at_idx" ON "consciousness_messages"("conversation_id", "created_at");

-- Unique constraint
CREATE UNIQUE INDEX "consciousness_shares_profile_id_shared_with_user_id_key" ON "consciousness_shares"("profile_id", "shared_with_user_id");

-- Foreign keys
ALTER TABLE "consciousness_profiles" ADD CONSTRAINT "consciousness_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consciousness_data_sources" ADD CONSTRAINT "consciousness_data_sources_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "consciousness_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consciousness_memories" ADD CONSTRAINT "consciousness_memories_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "consciousness_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consciousness_conversations" ADD CONSTRAINT "consciousness_conversations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "consciousness_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consciousness_messages" ADD CONSTRAINT "consciousness_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "consciousness_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "consciousness_shares" ADD CONSTRAINT "consciousness_shares_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "consciousness_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
