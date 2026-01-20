-- CreateTable: LoginHistory
-- Tracks user login sessions for security and analytics

CREATE TABLE "login_history" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "login_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "device" TEXT,
    "browser" TEXT,
    "os" TEXT,
    "location" TEXT,

    CONSTRAINT "login_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "login_history_user_id_idx" ON "login_history"("user_id");

-- CreateIndex
CREATE INDEX "login_history_login_at_idx" ON "login_history"("login_at");

-- AddForeignKey
ALTER TABLE "login_history" ADD CONSTRAINT "login_history_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
