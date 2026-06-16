-- 归一 BYOK provider 别名 → 系统 canonical slug（2026-06-15）
--
-- 背景：user_api_keys.provider 是用户自由文本输入（如手打 "claude"），但系统其余
-- 各处（inferProvider / ai-chat / ai_providers 表 slug）都以 canonical 为准
-- （anthropic / openai / google / xai）。别名 slug 导致：
--   1) resolveProviderDefaults 按别名查 ai_providers 查不到 → "未配置 endpoint" → 测试失败
--   2) 真实 LLM 调用按 canonical（anthropic）查 user_api_keys → 找不到存为 "claude" 的 key
-- 代码侧已在保存(validateProvider)与解析(resolveProviderDefaults)入口统一归一，
-- 本迁移把存量行一并归一，与 canonicalizeProvider() 的映射保持一致。

-- 第一步：无唯一冲突（同 user 同 label 下不存在 canonical 行）的直接归一。
WITH alias_map(alias, canonical) AS (
  VALUES
    ('claude', 'anthropic'),
    ('gpt', 'openai'),
    ('chatgpt', 'openai'),
    ('azure-openai', 'openai'),
    ('gemini', 'google'),
    ('google-gemini', 'google'),
    ('grok', 'xai'),
    ('x-ai', 'xai')
)
UPDATE user_api_keys k
SET provider = m.canonical
FROM alias_map m
WHERE lower(k.provider) = m.alias
  AND NOT EXISTS (
    SELECT 1
    FROM user_api_keys k2
    WHERE k2.user_id = k.user_id
      AND k2.provider = m.canonical
      AND k2.label = k.label
  );

-- 第二步：极少数冲突行（用户同时手配了别名与 canonical 且 label 相同）——
-- 归一 provider 的同时给 label 追加别名后缀以保唯一，避免数据丢失。
-- label 为 VarChar(50)：截断 base 后再拼 "-<alias>"，总长 ≤ 50。
WITH alias_map(alias, canonical) AS (
  VALUES
    ('claude', 'anthropic'),
    ('gpt', 'openai'),
    ('chatgpt', 'openai'),
    ('azure-openai', 'openai'),
    ('gemini', 'google'),
    ('google-gemini', 'google'),
    ('grok', 'xai'),
    ('x-ai', 'xai')
)
UPDATE user_api_keys k
SET provider = m.canonical,
    label = left(k.label, GREATEST(0, 49 - length(m.alias))) || '-' || m.alias
FROM alias_map m
WHERE lower(k.provider) = m.alias;
