-- =====================================================================
-- PR-6 v1.6 D4 硬合约 qualityGap 持久化
-- =====================================================================
-- mission markCompleted 时若 assertHardContract 返回 gaps，写入此列。
-- UI 读此渲染黄色 banner（completed + qualityGap）— 绝不 fail mission。

ALTER TABLE "agent_playground_missions"
  ADD COLUMN "quality_gaps" JSONB;
