-- ============================================================
-- 修复研究团队消息和 Agent 活动表的枚举值
-- 如果旧的错误枚举已存在，需要先删除再重新创建
-- ============================================================

-- 删除旧的枚举类型（如果存在错误的值）
DO $$ BEGIN
    -- 先删除依赖于这些枚举的表
    DROP TABLE IF EXISTS "research_team_messages" CASCADE;
    DROP TABLE IF EXISTS "research_agent_activities" CASCADE;

    -- 删除旧的枚举类型
    DROP TYPE IF EXISTS "ResearchMessageType" CASCADE;
    DROP TYPE IF EXISTS "AgentActivityType" CASCADE;
END $$;

-- 创建正确的枚举类型
CREATE TYPE "ResearchMessageType" AS ENUM (
    'LEADER_RESPONSE',   -- Leader 回复
    'USER_MESSAGE',      -- 用户消息
    'SYSTEM_MESSAGE',    -- 系统消息
    'AGENT_REPORT'       -- Agent 汇报
);

CREATE TYPE "AgentActivityType" AS ENUM (
    'THINKING',    -- 思考中
    'PLANNING',    -- 规划中
    'RESEARCHING', -- 研究中
    'WRITING',     -- 撰写中
    'REVIEWING',   -- 审核中
    'COMPLETED',   -- 完成
    'FAILED'       -- 失败
);

-- ==================== RESEARCH TEAM MESSAGES ====================

CREATE TABLE "research_team_messages" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,

    -- 消息信息
    "message_type" "ResearchMessageType" NOT NULL,
    "sender_role" TEXT,        -- leader, user, system
    "sender_name" TEXT,        -- 显示名称
    "content" TEXT NOT NULL,   -- 消息内容

    -- 元数据
    "metadata" JSONB,          -- 额外的上下文信息

    -- 时间戳
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_team_messages_pkey" PRIMARY KEY ("id")
);

-- 团队消息索引
CREATE INDEX "research_team_messages_topic_id_created_at_idx"
    ON "research_team_messages"("topic_id", "created_at" DESC);
CREATE INDEX "research_team_messages_mission_id_idx"
    ON "research_team_messages"("mission_id");

-- 团队消息外键
ALTER TABLE "research_team_messages" ADD CONSTRAINT "research_team_messages_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "research_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==================== RESEARCH AGENT ACTIVITIES ====================

CREATE TABLE "research_agent_activities" (
    "id" TEXT NOT NULL,
    "topic_id" TEXT NOT NULL,
    "mission_id" TEXT NOT NULL,

    -- Agent 信息
    "agent_id" TEXT NOT NULL,
    "agent_name" TEXT NOT NULL,
    "agent_role" TEXT NOT NULL, -- leader, researcher, reviewer, synthesizer

    -- 活动信息
    "activity_type" "AgentActivityType" NOT NULL,
    "phase" TEXT,               -- 阶段：understanding, analyzing, planning, executing
    "content" TEXT NOT NULL,    -- 活动内容/思考内容
    "progress" INTEGER NOT NULL DEFAULT 0, -- 进度 0-100

    -- 维度关联
    "dimension_id" TEXT,
    "dimension_name" TEXT,

    -- 元数据
    "metadata" JSONB,           -- 额外信息

    -- 时间戳
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_agent_activities_pkey" PRIMARY KEY ("id")
);

-- Agent 活动索引
CREATE INDEX "research_agent_activities_topic_id_created_at_idx"
    ON "research_agent_activities"("topic_id", "created_at" DESC);
CREATE INDEX "research_agent_activities_mission_id_idx"
    ON "research_agent_activities"("mission_id");
CREATE INDEX "research_agent_activities_agent_id_idx"
    ON "research_agent_activities"("agent_id");

-- Agent 活动外键
ALTER TABLE "research_agent_activities" ADD CONSTRAINT "research_agent_activities_topic_id_fkey"
    FOREIGN KEY ("topic_id") REFERENCES "research_topics"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ==================== 完成 ====================
-- 手动执行此迁移: psql -U username -d database -f migration.sql
