/**
 * 统一的 External Tool → Secret Name 映射
 *
 * 设计原则：
 * 1. Secret 名称使用 kebab-case，与 Secret Manager 实际存储一致
 * 2. 所有使用 Secret 的代码都必须通过此映射获取名称
 * 3. 不允许在其他地方硬编码 Secret 名称
 *
 * 命名规范：
 * - 使用 kebab-case: tavily-search-api-key
 * - 不使用 SCREAMING_SNAKE_CASE: TAVILY_API_KEY
 * - 不使用 camelCase: tavilyApiKey
 */

/**
 * External Tool ID → Secret Name 映射
 * 这是系统的唯一真相来源（Single Source of Truth）
 */
export const EXTERNAL_TOOL_SECRET_MAPPING: Record<string, string> = {
  // ==================== Web Search ====================
  tavily: "tavily-search-api-key",
  serper: "serper-api-key",
  perplexity: "perplexity-api-key",

  // ==================== Content Extraction ====================
  jina: "jina-api-key",
  firecrawl: "firecrawl-api-key",
  tavilyExtract: "tavily-extraction-api-key",

  // ==================== YouTube ====================
  supadata: "supadata-api-key",

  // ==================== TTS ====================
  elevenlabs: "elevenlabs-api-key",
  googleTts: "google-tts-api-key",

  // ==================== Skills ====================
  skillsmp: "skillsmp-api-key",

  // ==================== Policy Research ====================
  "congress-gov": "congress-gov",
  opensanctions: "opensanctions-api",

  // ==================== GitHub ====================
  "github-search": "github-token",
};

/**
 * 便捷常量：按类别分组的 Secret 名称
 * 用于 SearchService、ExtractionService 等服务
 */
export const SECRET_NAMES = {
  // Web Search
  TAVILY_SEARCH: EXTERNAL_TOOL_SECRET_MAPPING.tavily,
  SERPER: EXTERNAL_TOOL_SECRET_MAPPING.serper,
  PERPLEXITY: EXTERNAL_TOOL_SECRET_MAPPING.perplexity,

  // Content Extraction
  JINA: EXTERNAL_TOOL_SECRET_MAPPING.jina,
  FIRECRAWL: EXTERNAL_TOOL_SECRET_MAPPING.firecrawl,
  TAVILY_EXTRACTION: EXTERNAL_TOOL_SECRET_MAPPING.tavilyExtract,

  // YouTube
  SUPADATA: EXTERNAL_TOOL_SECRET_MAPPING.supadata,

  // TTS
  ELEVENLABS: EXTERNAL_TOOL_SECRET_MAPPING.elevenlabs,
  GOOGLE_TTS: EXTERNAL_TOOL_SECRET_MAPPING.googleTts,

  // Skills
  SKILLSMP: EXTERNAL_TOOL_SECRET_MAPPING.skillsmp,

  // Policy Research
  CONGRESS_GOV: EXTERNAL_TOOL_SECRET_MAPPING["congress-gov"],
  OPENSANCTIONS: EXTERNAL_TOOL_SECRET_MAPPING.opensanctions,

  // GitHub
  GITHUB_TOKEN: EXTERNAL_TOOL_SECRET_MAPPING["github-search"],
} as const;

/**
 * Legacy 名称 → 新名称映射
 * 用于向后兼容，在 getValueInternal 中自动转换
 */
export const LEGACY_SECRET_NAME_MAPPING: Record<string, string> = {
  // 旧的 SCREAMING_SNAKE_CASE 格式 → 新的 kebab-case 格式
  TAVILY_API_KEY: SECRET_NAMES.TAVILY_SEARCH,
  SERPER_API_KEY: SECRET_NAMES.SERPER,
  PERPLEXITY_API_KEY: SECRET_NAMES.PERPLEXITY,
  JINA_API_KEY: SECRET_NAMES.JINA,
  FIRECRAWL_API_KEY: SECRET_NAMES.FIRECRAWL,
  SUPADATA_API_KEY: SECRET_NAMES.SUPADATA,
  ELEVENLABS_API_KEY: SECRET_NAMES.ELEVENLABS,
  GOOGLE_TTS_API_KEY: SECRET_NAMES.GOOGLE_TTS,
  SKILLSMP_API_KEY: SECRET_NAMES.SKILLSMP,
  CONGRESS_API_KEY: SECRET_NAMES.CONGRESS_GOV,
};

/**
 * 获取工具对应的 Secret 名称
 * @param toolId 工具 ID
 * @returns Secret 名称，如果不存在返回 null
 */
export function getSecretNameForTool(toolId: string): string | null {
  return EXTERNAL_TOOL_SECRET_MAPPING[toolId] || null;
}

/**
 * 获取 Secret 名称对应的工具 ID
 * @param secretName Secret 名称
 * @returns 工具 ID，如果不存在返回 null
 */
export function getToolIdForSecret(secretName: string): string | null {
  for (const [toolId, name] of Object.entries(EXTERNAL_TOOL_SECRET_MAPPING)) {
    if (name === secretName) return toolId;
  }
  return null;
}

/**
 * 规范化 Secret 名称
 * 如果是旧格式（SCREAMING_SNAKE_CASE），转换为新格式（kebab-case）
 * @param name 原始名称
 * @returns 规范化后的名称
 */
export function normalizeSecretName(name: string): string {
  // 如果是旧格式，转换为新格式
  if (LEGACY_SECRET_NAME_MAPPING[name]) {
    return LEGACY_SECRET_NAME_MAPPING[name];
  }
  return name;
}

/**
 * SystemSetting 键 → Secret 名称映射
 * 用于迁移脚本
 */
export const SYSTEM_SETTING_TO_SECRET_MAPPING: Array<{
  key: string;
  name: string;
  displayName: string;
  category: string;
  provider: string;
}> = [
  {
    key: "search.perplexity.apiKey",
    name: SECRET_NAMES.PERPLEXITY,
    displayName: "Perplexity API Key",
    category: "SEARCH",
    provider: "Perplexity",
  },
  {
    key: "search.tavily.apiKey",
    name: SECRET_NAMES.TAVILY_SEARCH,
    displayName: "Tavily Search API Key",
    category: "SEARCH",
    provider: "Tavily",
  },
  {
    key: "search.serper.apiKey",
    name: SECRET_NAMES.SERPER,
    displayName: "Serper API Key",
    category: "SEARCH",
    provider: "Serper",
  },
  {
    key: "extraction.jina.apiKey",
    name: SECRET_NAMES.JINA,
    displayName: "Jina Reader API Key",
    category: "EXTRACTION",
    provider: "Jina",
  },
  {
    key: "extraction.firecrawl.apiKey",
    name: SECRET_NAMES.FIRECRAWL,
    displayName: "Firecrawl API Key",
    category: "EXTRACTION",
    provider: "Firecrawl",
  },
  {
    key: "extraction.tavily.apiKey",
    name: SECRET_NAMES.TAVILY_EXTRACTION,
    displayName: "Tavily Extraction API Key",
    category: "EXTRACTION",
    provider: "Tavily",
  },
  {
    key: "youtube.supadata.apiKey",
    name: SECRET_NAMES.SUPADATA,
    displayName: "Supadata YouTube API Key",
    category: "YOUTUBE",
    provider: "Supadata",
  },
  {
    key: "tts.elevenlabs.apiKey",
    name: SECRET_NAMES.ELEVENLABS,
    displayName: "ElevenLabs TTS API Key",
    category: "TTS",
    provider: "ElevenLabs",
  },
  {
    key: "tts.google.apiKey",
    name: SECRET_NAMES.GOOGLE_TTS,
    displayName: "Google Cloud TTS API Key",
    category: "TTS",
    provider: "Google",
  },
  {
    key: "skillsmp.apiKey",
    name: SECRET_NAMES.SKILLSMP,
    displayName: "SkillsMP API Key",
    category: "SKILLSMP",
    provider: "SkillsMP",
  },
];
