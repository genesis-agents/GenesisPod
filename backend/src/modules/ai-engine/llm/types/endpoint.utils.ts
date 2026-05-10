/**
 * Provider endpoint URL helpers — 全项目唯一 normalization 入口（chat + embedding + image）
 *
 * 2026-05-10 §2/§4 联调发现：
 *   PROVIDER_API_DEFAULTS / DB ai_providers.endpoint 存的 base URL 形如
 *   `https://api.deepseek.com/v1`（不含 path），但 OpenAI-compatible /
 *   Anthropic 流式与非流式 caller 把它当成完整 URL 直接 POST，触发 404。
 *   embedding / image / Gemini 路径同样存在多份就地拼接逻辑，需归一化。
 *
 * 单源约定：所有发出 LLM 请求的代码（streaming + non-streaming + connection
 * test + BYOK direct-key）必须先过这些 helper，不再各自手拼字符串。
 *
 * Chat:
 *   - ensureChatCompletionsPath：OpenAI / DeepSeek / Groq / Qwen / Doubao /
 *     Zhipu / Moonshot / Perplexity / OpenRouter / Minimax / xAI 等同构 provider
 *   - ensureMessagesPath：Anthropic family (`/v1/messages`)
 *   - ensureGeminiGenerateContentPath：Google Gemini（容忍三种入参形态）
 *
 * Embedding:
 *   - ensureOpenAIEmbeddingsPath：OpenAI / xAI / DeepSeek / Cohere v2 等同构
 *   - ensureCohereEmbedPath：Cohere v1 (`/embed`)
 *   - ensureGeminiBatchEmbedContentsPath：Google Gemini 批量 embedding
 *   - ensureGeminiEmbedContentPath：Google Gemini 单条 embedding
 *
 * Image:
 *   - ensureOpenAIImagesGenerationsPath：DALL-E / gpt-image (`/images/generations`)
 *
 * 行为：
 *   - 已含正确 path → 原样返回（去尾斜杠）
 *   - 未含 path → 末尾追加（先剥所有尾斜杠）
 *   - 空字符串 / null → 返回 null（caller 必须显式兜底，不再静默 POST 空 URL）
 *   - Gemini 容忍含 `:generateContent` 的完整 URL，此时直接返回（仅去尾斜杠）
 */

const stripTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

/** Append `/chat/completions` if missing. */
export function ensureChatCompletionsPath(
  url: string | undefined | null,
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const normalized = stripTrailingSlash(trimmed);
  if (normalized.endsWith("/chat/completions")) return normalized;
  return `${normalized}/chat/completions`;
}

/** Append `/messages` if missing (Anthropic). */
export function ensureMessagesPath(
  url: string | undefined | null,
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const normalized = stripTrailingSlash(trimmed);
  if (normalized.endsWith("/messages")) return normalized;
  return `${normalized}/messages`;
}

/**
 * Build Gemini generateContent URL，容忍三种入参形态：
 *   1. 完整 URL（含 `:generateContent`）→ 原样（仅去尾斜杠）
 *   2. base URL（含 `/models`，不带 model）→ `${base}/${modelId}:generateContent`
 *   3. base URL（不含 `/models`）→ `${base}/models/${modelId}:generateContent`
 *   4. 空 → 默认 `https://generativelanguage.googleapis.com/v1beta`
 */
export function ensureGeminiGenerateContentPath(
  url: string | undefined | null,
  modelId: string,
): string {
  const base =
    stripTrailingSlash(url?.trim() || "") ||
    "https://generativelanguage.googleapis.com/v1beta";
  if (base.includes(":generateContent")) return base;
  if (/\/models\/?$/.test(base)) {
    return `${base.replace(/\/+$/, "")}/${modelId}:generateContent`;
  }
  return `${base}/models/${modelId}:generateContent`;
}

/** Append `/embeddings` if missing (OpenAI / xAI / DeepSeek / Cohere v2 同构 embedding). */
export function ensureOpenAIEmbeddingsPath(
  url: string | undefined | null,
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const normalized = stripTrailingSlash(trimmed);
  if (normalized.endsWith("/embeddings")) return normalized;
  return `${normalized}/embeddings`;
}

/** Append `/embed` if missing (Cohere v1). */
export function ensureCohereEmbedPath(
  url: string | undefined | null,
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const normalized = stripTrailingSlash(trimmed);
  if (normalized.endsWith("/embed")) return normalized;
  return `${normalized}/embed`;
}

/** Build Gemini `/models/{model}:batchEmbedContents` URL（容忍尾部 /models）. */
export function ensureGeminiBatchEmbedContentsPath(
  url: string | undefined | null,
  modelId: string,
): string {
  const base =
    stripTrailingSlash(
      (url?.trim() || "").replace(/\/models\/?$/, "").replace(/\/+$/, ""),
    ) || "https://generativelanguage.googleapis.com/v1beta";
  if (base.includes(":batchEmbedContents")) return base;
  return `${base}/models/${modelId}:batchEmbedContents`;
}

/** Build Gemini `/models/{model}:embedContent` URL（单条 embedding）. */
export function ensureGeminiEmbedContentPath(
  url: string | undefined | null,
  modelId: string,
): string {
  const base =
    stripTrailingSlash(
      (url?.trim() || "").replace(/\/models\/?$/, "").replace(/\/+$/, ""),
    ) || "https://generativelanguage.googleapis.com/v1beta";
  if (base.includes(":embedContent")) return base;
  return `${base}/models/${modelId}:embedContent`;
}

/**
 * Append `/images/generations` if missing (OpenAI DALL-E / gpt-image)，
 * 容忍 caller 误传 chat/completions URL（自动剥）。
 */
export function ensureOpenAIImagesGenerationsPath(
  url: string | undefined | null,
): string | null {
  const trimmed = url?.trim();
  if (!trimmed) return null;
  const stripped = stripTrailingSlash(trimmed).replace(
    /\/chat\/completions$/,
    "",
  );
  if (stripped.endsWith("/images/generations")) return stripped;
  // 若传入仅 base（不含 /v1），自动补 /v1。
  if (stripped.endsWith("/v1")) return `${stripped}/images/generations`;
  return `${stripped}/v1/images/generations`;
}
