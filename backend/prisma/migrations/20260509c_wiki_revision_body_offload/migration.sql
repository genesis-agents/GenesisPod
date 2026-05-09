-- 2026-05-09 WikiPageRevision.body off-load 准备
-- Revision 是极冷数据（每次编辑累一份，仅 revert 时读），按 PR-1 同模式：
--   1. 加 body_uri / body_size 两列（nullable）
--   2. 写入路径不变（仍写 body 列，先 7 天保留 dual-write）
--   3. StorageOffloadService 24h cron 把 7 天前的 revision 搬到 R2
--      (wiki-revisions/{pageId}/{revisionId}.md)，body 置 ""
--   4. 读路径走 PrismaService.knowledgeBaseDocument hydrate 同模式
ALTER TABLE "wiki_page_revisions"
  ADD COLUMN "body_uri" TEXT,
  ADD COLUMN "body_size" INTEGER;
