/**
 * Capability-Provider Mapping
 *
 * 定义内建能力（Built-in Capability）与外部提供者（External Provider）的映射关系
 * 解决 UI 展示混乱的问题：将能力和它的实现放在一起显示
 */

export interface ProviderDefinition {
  id: string;
  name: string;
  description: string;
  url: string;
  noKeyRequired?: boolean;
  freeQuota?: string;
  pricing?: string;
  secretKeyName?: string; // 对应 Secret Manager 中的密钥名称
}

export interface CapabilityDefinition {
  id: string; // 对应 Built-in Tool 的 id
  name: string;
  displayName: string;
  description: string;
  icon: string; // Lucide icon name
  category: 'search' | 'extraction' | 'generation' | 'analysis' | 'other';
  providers: ProviderDefinition[];
}

/**
 * 能力定义列表
 * 每个能力包含其所有可用的 Provider
 */
export const CAPABILITY_DEFINITIONS: CapabilityDefinition[] = [
  // ==================== 搜索能力 ====================
  {
    id: 'web-search',
    name: 'web-search',
    displayName: '网络搜索',
    description:
      '搜索互联网获取最新信息，适用于需要实时数据、新闻、或需要验证的信息',
    icon: 'Search',
    category: 'search',
    providers: [
      {
        id: 'tavily',
        name: 'Tavily',
        description: 'AI Agent 优化的搜索 API，快速响应和结构化数据',
        url: 'https://tavily.com',
        secretKeyName: 'TAVILY_API_KEY',
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        description: 'AI 驱动的研究搜索引擎，实时信息和深度研究',
        url: 'https://perplexity.ai',
        secretKeyName: 'PERPLEXITY_API_KEY',
      },
      {
        id: 'serper',
        name: 'Serper',
        description: 'Google 搜索结果 API，高准确度和丰富元数据',
        url: 'https://serper.dev',
        secretKeyName: 'SERPER_API_KEY',
      },
      {
        id: 'duckduckgo',
        name: 'DuckDuckGo',
        description: '隐私优先的免费搜索引擎，无需 API Key',
        url: 'https://duckduckgo.com',
        noKeyRequired: true,
      },
    ],
  },

  // ==================== 内容提取能力 ====================
  {
    id: 'web-scraper',
    name: 'web-scraper',
    displayName: '网页抓取',
    description: '抓取并解析指定 URL 的网页内容，提取页面标题和主要文本内容',
    icon: 'FileText',
    category: 'extraction',
    providers: [
      {
        id: 'jina',
        name: 'Jina AI Reader',
        description: 'URL 转 Markdown，免费高质量提取',
        url: 'https://jina.ai/reader',
        freeQuota: '1M tokens/month',
        secretKeyName: 'JINA_API_KEY',
      },
      {
        id: 'firecrawl',
        name: 'Firecrawl',
        description: '专业网页抓取服务，支持 JavaScript 渲染',
        url: 'https://firecrawl.dev',
        secretKeyName: 'FIRECRAWL_API_KEY',
      },
      {
        id: 'tavilyExtract',
        name: 'Tavily Extract',
        description: 'Tavily 的内容提取服务',
        url: 'https://tavily.com',
        secretKeyName: 'TAVILY_API_KEY',
      },
    ],
  },

  // ==================== 音频生成能力 ====================
  {
    id: 'audio-generation',
    name: 'audio-generation',
    displayName: '语音合成',
    description: '将文本转换为自然语音，支持多种声音和语言',
    icon: 'Volume2',
    category: 'generation',
    providers: [
      {
        id: 'elevenlabs',
        name: 'ElevenLabs',
        description: '高质量 AI 语音合成，自然流畅',
        url: 'https://elevenlabs.io',
        freeQuota: '10,000 chars/month',
        pricing: '$5/month+',
        secretKeyName: 'ELEVENLABS_API_KEY',
      },
      {
        id: 'googleTts',
        name: 'Google Cloud TTS',
        description: 'Google 云端文字转语音服务',
        url: 'https://cloud.google.com/text-to-speech',
        freeQuota: '4M chars/month',
        pricing: 'Usage-based',
        secretKeyName: 'GOOGLE_TTS_API_KEY',
      },
    ],
  },

  // ==================== YouTube 能力 ====================
  {
    id: 'youtube-transcript',
    name: 'youtube-transcript',
    displayName: 'YouTube 字幕',
    description: '获取 YouTube 视频的字幕和转录文本',
    icon: 'Youtube',
    category: 'extraction',
    providers: [
      {
        id: 'supadata',
        name: 'Supadata',
        description: 'YouTube 字幕和转录 API',
        url: 'https://supadata.ai/youtube-transcript-api',
        freeQuota: '100/month',
        pricing: '$9/month (1000)',
        secretKeyName: 'SUPADATA_API_KEY',
      },
    ],
  },
];

/**
 * 政策研究工具（独立显示，不需要外部 Provider）
 */
export const STANDALONE_TOOLS = [
  {
    id: 'federal-register',
    name: 'Federal Register',
    displayName: '联邦公报',
    description: '搜索美国联邦公报，获取行政命令、法规和通知',
    icon: 'Landmark',
    category: 'policy-research',
    noKeyRequired: true,
    url: 'https://www.federalregister.gov',
  },
  {
    id: 'congress-gov',
    name: 'Congress.gov',
    displayName: '国会立法',
    description: '搜索美国国会立法，获取法案和投票记录',
    icon: 'Scale',
    category: 'policy-research',
    freeQuota: '5,000 requests/hour',
    url: 'https://api.congress.gov',
    secretKeyName: 'CONGRESS_GOV_API_KEY',
  },
  {
    id: 'whitehouse-news',
    name: 'White House News',
    displayName: '白宫新闻',
    description: '获取白宫新闻发布和声明',
    icon: 'Building2',
    category: 'policy-research',
    noKeyRequired: true,
    url: 'https://www.whitehouse.gov/news',
  },
];

/**
 * 根据能力 ID 获取其定义
 */
export function getCapabilityById(
  id: string
): CapabilityDefinition | undefined {
  return CAPABILITY_DEFINITIONS.find((cap) => cap.id === id);
}

/**
 * 根据 Provider ID 获取其所属的能力
 */
export function getCapabilityByProviderId(
  providerId: string
): CapabilityDefinition | undefined {
  return CAPABILITY_DEFINITIONS.find((cap) =>
    cap.providers.some((p) => p.id === providerId)
  );
}

/**
 * 获取能力的所有 Provider ID
 */
export function getProviderIdsForCapability(capabilityId: string): string[] {
  const cap = getCapabilityById(capabilityId);
  return cap ? cap.providers.map((p) => p.id) : [];
}

/**
 * 判断一个工具 ID 是否是能力（而非独立工具或 Provider）
 */
export function isCapability(toolId: string): boolean {
  return CAPABILITY_DEFINITIONS.some((cap) => cap.id === toolId);
}

/**
 * 判断一个工具 ID 是否是 Provider
 */
export function isProvider(toolId: string): boolean {
  return CAPABILITY_DEFINITIONS.some((cap) =>
    cap.providers.some((p) => p.id === toolId)
  );
}
