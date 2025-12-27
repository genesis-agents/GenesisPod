-- CreateEnum
CREATE TYPE "KnowledgeBaseMemberRole" AS ENUM ('OWNER', 'ADMIN', 'EDITOR', 'VIEWER');

-- CreateTable
CREATE TABLE "knowledge_base_members" (
    "id" TEXT NOT NULL,
    "knowledge_base_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role" "KnowledgeBaseMemberRole" NOT NULL DEFAULT 'VIEWER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_base_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "knowledge_base_members_knowledge_base_id_idx" ON "knowledge_base_members"("knowledge_base_id");

-- CreateIndex
CREATE INDEX "knowledge_base_members_user_id_idx" ON "knowledge_base_members"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_base_members_knowledge_base_id_user_id_key" ON "knowledge_base_members"("knowledge_base_id", "user_id");

-- AddForeignKey
ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_base_members" ADD CONSTRAINT "knowledge_base_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
