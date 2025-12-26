-- AlterTable: Add isBookmarked column to ask_sessions
ALTER TABLE "ask_sessions" ADD COLUMN "is_bookmarked" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex: Add index for bookmark queries
CREATE INDEX "ask_sessions_user_id_is_bookmarked_idx" ON "ask_sessions"("user_id", "is_bookmarked");
