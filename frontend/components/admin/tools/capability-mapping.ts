/**
 * Capability-Provider Mapping
 *
 * 定义内建能力（Built-in Capability）与外部提供者（External Provider）的映射关系
 * 所有工具类型统一使用折叠卡片样式展示
 */

export interface ProviderDefinition {
  id: string;
  name: string;
  description: string;
  url: string;
  noKeyRequired?: boolean;
  freeQuota?: string;
  pricing?: string;
}

export interface CapabilityDefinition {
  id: string; // 对应 Built-in Tool 的 id
  name: string;
  displayName: string;
  description: string;
  icon: string; // Lucide icon name
  category: CapabilityCategory;
  providers: ProviderDefinition[];
  /** 如果为 true，每个 provider 都是独立的工具（有各自的开关） */
  independentProviders?: boolean;
}

/**
 * 能力类别
 */
export type CapabilityCategory =
  | 'search'
  | 'academic'
  | 'extraction'
  | 'generation'
  | 'processing'
  | 'memory'
  | 'integration'
  | 'export'
  | 'finance'
  | 'weather'
  | 'policy'
  | 'devtools'
  | 'image-search';

/**
 * 类别显示顺序和配置
 */
export const CATEGORY_CONFIG: Record<
  CapabilityCategory,
  { order: number; labelKey: string }
> = {
  search: { order: 1, labelKey: 'admin.tools.categories.search' },
  academic: { order: 2, labelKey: 'admin.tools.categories.academic' },
  extraction: { order: 3, labelKey: 'admin.tools.categories.extraction' },
  generation: { order: 4, labelKey: 'admin.tools.categories.generation' },
  processing: { order: 5, labelKey: 'admin.tools.categories.processing' },
  memory: { order: 6, labelKey: 'admin.tools.categories.memory' },
  integration: { order: 7, labelKey: 'admin.tools.categories.integration' },
  export: { order: 8, labelKey: 'admin.tools.categories.export' },
  finance: { order: 9, labelKey: 'admin.tools.categories.finance' },
  weather: { order: 10, labelKey: 'admin.tools.categories.weather' },
  'image-search': {
    order: 11,
    labelKey: 'admin.tools.categories.image-search',
  },
  policy: { order: 12, labelKey: 'admin.tools.categories.policy' },
  devtools: { order: 13, labelKey: 'admin.tools.categories.devtools' },
};

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
      },
      {
        id: 'perplexity',
        name: 'Perplexity',
        description: 'AI 驱动的研究搜索引擎，实时信息和深度研究',
        url: 'https://perplexity.ai',
      },
      {
        id: 'serper',
        name: 'Serper',
        description: 'Google 搜索结果 API，高准确度和丰富元数据',
        url: 'https://serper.dev',
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

  // 学术搜索
  {
    id: 'arxiv-search',
    name: 'arxiv-search',
    displayName: '学术搜索',
    description:
      '搜索学术论文和研究文献，涵盖 AI、物理、数学、计算机科学、生物医学等领域',
    icon: 'GraduationCap',
    category: 'academic',
    independentProviders: true,
    providers: [
      {
        id: 'arxiv',
        name: 'arXiv',
        description: '全球最大的学术预印本库，免费公开访问',
        url: 'https://arxiv.org',
        noKeyRequired: true,
        freeQuota: '3 requests/second',
      },
      {
        id: 'semantic-scholar',
        name: 'Semantic Scholar',
        description: 'AI 驱动的学术搜索引擎，2亿+论文，引用分析和语义检索',
        url: 'https://www.semanticscholar.org',
        freeQuota: '100 requests/5min (无Key)',
        pricing: '免费申请 API Key 提升限额',
      },
      {
        id: 'pubmed',
        name: 'PubMed',
        description: 'NCBI 生物医学文献数据库，3600万+引文，覆盖医学和生命科学',
        url: 'https://pubmed.ncbi.nlm.nih.gov',
        freeQuota: '3 requests/second (无Key)',
        pricing: '免费申请 API Key 提升至 10 req/s',
      },
      {
        id: 'openalex',
        name: 'OpenAlex',
        description: '开放学术数据库，2.5亿+学术作品，免费无限制，覆盖全学科',
        url: 'https://openalex.org',
        freeQuota: '10 req/s (无 mailto)，配置邮箱后无限制 (polite pool)',
        pricing: '免费，配置联系邮箱即可解锁无限速',
      },
    ],
  },

  // Hacker News 搜索
  {
    id: 'hackernews-search',
    name: 'hackernews-search',
    displayName: 'Hacker News',
    description:
      '搜索 Hacker News 技术社区讨论，获取开发者观点、技术趋势和行业新闻',
    icon: 'Newspaper',
    category: 'search',
    providers: [
      {
        id: 'hackernews',
        name: 'HN Algolia',
        description: 'Hacker News 官方搜索 API，免费无限制',
        url: 'https://hn.algolia.com/api',
        noKeyRequired: true,
        freeQuota: 'Unlimited',
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
      },
      {
        id: 'firecrawl',
        name: 'Firecrawl',
        description: '专业网页抓取服务，支持 JavaScript 渲染',
        url: 'https://firecrawl.dev',
      },
      {
        id: 'tavilyExtract',
        name: 'Tavily Extract',
        description: 'Tavily 的内容提取服务',
        url: 'https://tavily.com',
      },
    ],
  },

  // YouTube 字幕 - 归类到内容提取，使用 web-scraper 的开关
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
      },
    ],
  },

  // ==================== 内容生成能力 ====================
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
      },
      {
        id: 'googleTts',
        name: 'Google Cloud TTS',
        description: 'Google 云端文字转语音服务',
        url: 'https://cloud.google.com/text-to-speech',
        freeQuota: '4M chars/month',
        pricing: 'Usage-based',
      },
    ],
  },

  // ==================== 金融数据能力 ====================
  {
    id: 'finance-api',
    name: 'finance-api',
    displayName: '金融数据',
    description: '获取实时金融数据，包括股票行情、外汇汇率和加密货币价格',
    icon: 'TrendingUp',
    category: 'finance',
    providers: [
      {
        id: 'alpha-vantage',
        name: 'Alpha Vantage',
        description: '实时金融数据 API，股票、外汇、加密货币行情',
        url: 'https://www.alphavantage.co',
        freeQuota: '25 requests/day',
      },
    ],
  },

  // ==================== 天气数据能力 ====================
  {
    id: 'weather-api',
    name: 'weather-api',
    displayName: '天气数据',
    description: '获取全球城市的实时天气和未来5天天气预报',
    icon: 'CloudSun',
    category: 'weather',
    providers: [
      {
        id: 'weather-api',
        name: 'OpenWeatherMap',
        description: '全球天气数据 API，支持当前天气和预报',
        url: 'https://openweathermap.org',
        freeQuota: '60 requests/minute',
        pricing: '免费tier可用',
      },
    ],
  },

  // ==================== 图像搜索能力 ====================
  {
    id: 'image-search',
    name: 'image-search',
    displayName: '图像搜索',
    description: '搜索互联网图片，用于研究报告插图和数据可视化素材',
    icon: 'Image',
    category: 'image-search',
    providers: [
      {
        id: 'serpapi-image-search',
        name: 'SerpAPI',
        description: 'Google 图片搜索 API，高质量结果和丰富元数据',
        url: 'https://serpapi.com',
        freeQuota: '100 searches/month',
        pricing: '$50/month (5000)',
      },
      {
        id: 'bing-image-search',
        name: 'Bing Image Search',
        description: 'Microsoft Bing 图片搜索 API，支持安全过滤',
        url: 'https://www.microsoft.com/en-us/bing/apis/bing-image-search-api',
        pricing: '$3/1000 transactions',
      },
      {
        id: 'google-image-search',
        name: 'Google Custom Search',
        description: 'Google 自定义搜索 API，需配置搜索引擎 ID',
        url: 'https://developers.google.com/custom-search',
        freeQuota: '100 queries/day',
        pricing: '$5/1000 queries',
      },
    ],
  },

  // ==================== 政策研究能力 ====================
  // 每个 Provider 都是独立的工具，有各自的开关
  {
    id: 'policy-research',
    name: 'policy-research',
    displayName: '政策研究',
    description: '获取美国政府政策、法规和新闻',
    icon: 'Landmark',
    category: 'policy',
    independentProviders: true, // 每个 provider 有独立开关
    providers: [
      {
        id: 'federal-register',
        name: '联邦公报',
        description: '搜索美国联邦公报，获取行政命令、法规和通知',
        url: 'https://www.federalregister.gov',
        noKeyRequired: true,
      },
      {
        id: 'congress-gov',
        name: '国会立法',
        description: '搜索美国国会立法，获取法案和投票记录',
        url: 'https://api.congress.gov',
        freeQuota: '5,000 requests/hour',
      },
      {
        id: 'whitehouse-news',
        name: '白宫新闻',
        description: '获取白宫新闻发布和声明',
        url: 'https://www.whitehouse.gov/news',
        noKeyRequired: true,
      },
    ],
  },

  // ==================== 开发工具能力 ====================
  {
    id: 'github-search',
    name: 'github-search',
    displayName: 'GitHub 搜索',
    description: '搜索 GitHub 仓库、代码和开源项目',
    icon: 'Github',
    category: 'devtools',
    providers: [
      {
        id: 'github-search',
        name: 'GitHub',
        description: 'GitHub API 搜索仓库、代码和用户',
        url: 'https://github.com',
        freeQuota: '60 requests/hour (unauthenticated)',
        pricing: '5,000 requests/hour (authenticated)',
      },
    ],
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

/**
 * 获取所有独立 Provider 的 ID 列表（用于政策研究等）
 */
export function getIndependentProviderIds(): string[] {
  return CAPABILITY_DEFINITIONS.filter(
    (cap) => cap.independentProviders
  ).flatMap((cap) => cap.providers.map((p) => p.id));
}

/**
 * 前端 Provider ID → 后端 Tool Registry ID 映射
 * 前端 capability-mapping 中的 provider.id 与 ToolRegistry 注册的 tool.id 不一定一致
 * 用于前端查找 builtinTool 时将 provider.id 映射到实际的 tool ID
 */
export const PROVIDER_TO_TOOL_ID: Record<string, string> = {
  // Web Search providers → web-search tool
  tavily: 'web-search',
  perplexity: 'web-search',
  serper: 'web-search',
  duckduckgo: 'web-search',
  // Extraction providers → web-scraper tool
  jina: 'web-scraper',
  firecrawl: 'web-scraper',
  tavilyExtract: 'web-scraper',
  // Academic providers → respective tools
  arxiv: 'arxiv-search',
  'semantic-scholar': 'semantic-scholar',
  pubmed: 'pubmed',
  openalex: 'openalex-search',
  // Community
  hackernews: 'hackernews-search',
  // GitHub
  'github-search': 'github-search',
  // Curated content sources
  'industry-report': 'industry-report-search',
  // YouTube
  supadata: 'web-scraper',
  // Policy
  'federal-register': 'federal-register',
  'congress-gov': 'congress-gov',
  'whitehouse-news': 'whitehouse-news',
  // Finance & Weather
  'alpha-vantage': 'finance-api',
  'weather-api': 'weather-api',
  // Audio Generation
  elevenlabs: 'audio-generation',
  googleTts: 'audio-generation',
  // Image Search providers — each has its own API key, no aggregator sync
  'serpapi-image-search': 'serpapi-image-search',
  'bing-image-search': 'bing-image-search',
  'google-image-search': 'google-image-search',
};

/**
 * 根据 Provider ID 获取对应的 Tool Registry ID
 * 如果映射表中没有，则返回原始 provider ID
 */
export function getToolIdForProvider(providerId: string): string {
  return PROVIDER_TO_TOOL_ID[providerId] || providerId;
}

/**
 * 按类别分组并排序能力
 */
export function getCapabilitiesByCategory(): Map<
  CapabilityCategory,
  CapabilityDefinition[]
> {
  const grouped = new Map<CapabilityCategory, CapabilityDefinition[]>();

  // 按类别分组
  CAPABILITY_DEFINITIONS.forEach((cap) => {
    const list = grouped.get(cap.category) || [];
    list.push(cap);
    grouped.set(cap.category, list);
  });

  // 按 order 排序返回
  const sorted = new Map<CapabilityCategory, CapabilityDefinition[]>();
  const categories = Array.from(grouped.keys()).sort(
    (a, b) => CATEGORY_CONFIG[a].order - CATEGORY_CONFIG[b].order
  );

  categories.forEach((cat) => {
    sorted.set(cat, grouped.get(cat)!);
  });

  return sorted;
}
