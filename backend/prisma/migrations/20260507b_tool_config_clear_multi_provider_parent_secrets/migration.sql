-- 清理 N:1 映射下被污染的 ToolConfig.secretKey 父行（2026-05-07）
--
-- 背景：updateToolConfig 此前对所有 alias→registry 映射都同步 secretKey 到 parent 行，
-- 但 web-search ← {tavily,perplexity,serper,duckduckgo} / web-scraper ← {jina,firecrawl,
-- tavilyExtract,supadata} / audio-generation ← {elevenlabs,googleTts} 是 N:1 映射，
-- last-write-wins 让 parent 行保存的是"最近一个被配置的 sibling"的 secretKey —— 毫无意义
-- 但被前端 ToolsManagement bridge 灌回到所有 sibling provider，导致 Perplexity dialog
-- 显示 Tavily 的 key（Screenshot_5 真因）。
--
-- 配套代码改动：
--   - tool-id-aliases.ts 加 isMultiProviderRegistry()
--   - ai-admin.service.updateToolConfig 跳过 multi-provider parent 的 secretKey/config sync
--   - ToolsManagement bridge 不从 multi-provider parent 继承 secretKey 给 sibling
--
-- 范围：仅清零 3 个 N:1 parent registry id 的 secretKey + config(apiKey) 残留。
-- 1:1 映射（arxiv-search/pubmed/openalex-search/finance-api/weather-api/github-search 等）
-- 不动 —— 那些场景 secretKey 在 parent 是有效的（语义上同一工具）。

UPDATE "tool_configs"
SET "secret_key" = NULL,
    "updated_at" = CURRENT_TIMESTAMP
WHERE "tool_id" IN ('web-search', 'web-scraper', 'audio-generation')
  AND "secret_key" IS NOT NULL;

-- config 中可能有 apiKey 字段污染（直接输入路径会写到 tool config）
-- 仅清掉 apiKey，保留其他 config 字段
UPDATE "tool_configs"
SET "config" = "config" - 'apiKey',
    "updated_at" = CURRENT_TIMESTAMP
WHERE "tool_id" IN ('web-search', 'web-scraper', 'audio-generation')
  AND "config" ? 'apiKey';
