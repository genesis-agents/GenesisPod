'use client';

import { useState, useEffect, useCallback } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import {
  Search,
  CheckCircle,
  XCircle,
  Loader2,
  Save,
  ExternalLink,
  Zap,
  Globe,
  Sparkles,
  AlertTriangle,
  RefreshCw,
  FileText,
  Wallet,
  TrendingUp,
  Eye,
  EyeOff,
  Youtube,
  Plus,
  Trash2,
} from 'lucide-react';
import { SimulationAPITab } from '../simulation/SimulationAPITab';

import { logger } from '@/lib/utils/logger';
import { ClientDate } from '@/components/common/ClientDate';
interface SearchConfig {
  provider: string;
  enabled: boolean;
  perplexity: { apiKey: string | null; hasApiKey: boolean };
  tavily: { apiKey: string | null; hasApiKey: boolean; keyCount?: number };
  serper: { apiKey: string | null; hasApiKey: boolean; keyCount?: number };
  duckduckgo: {
    apiKey: string | null;
    hasApiKey: boolean;
    noKeyRequired?: boolean;
  };
}

interface ExtractionConfig {
  enabled: boolean;
  jina: { apiKey: string | null; hasApiKey: boolean };
  firecrawl: { apiKey: string | null; hasApiKey: boolean };
  tavily: { apiKey: string | null; hasApiKey: boolean };
}

interface BalanceInfo {
  provider: string;
  hasBalance: boolean;
  balance?: string;
  quota?: { used: number; limit: number };
  error?: string;
}

// YouTube transcript API configuration
interface YouTubeConfig {
  enabled: boolean;
  provider: string;
  supadata: { apiKey: string | null; hasApiKey: boolean };
}

// TTS (Text-to-Speech) API configuration
interface TTSConfig {
  enabled: boolean;
  provider: string;
  elevenlabs: { apiKey: string | null; hasApiKey: boolean };
  google: { apiKey: string | null; hasApiKey: boolean };
}

// SkillsMP API configuration
interface SkillsMPConfig {
  enabled: boolean;
  apiKey: string | null;
  hasApiKey: boolean;
  lastSync?: string;
  syncInterval: 'daily' | 'weekly' | 'manual';
}

// YouTube transcript provider configurations
const YOUTUBE_PROVIDERS = [
  {
    id: 'supadata',
    name: 'Supadata',
    description: 'YouTube字幕提取API，绕过IP封锁',
    features: ['100次/月免费', '云服务器友好', '支持多语言'],
    color: 'from-red-500 to-rose-500',
    bgColor: 'bg-red-50',
    textColor: 'text-red-600',
    url: 'https://supadata.ai/youtube-transcript-api',
    signupUrl: 'https://dash.supadata.ai?plan=basic',
    placeholder: 'Enter Supadata API key',
    pricing: '$9/月 (1000次)',
    freeQuota: '100次/月',
  },
] as const;

// TTS provider configurations
const TTS_PROVIDERS = [
  {
    id: 'elevenlabs',
    name: 'ElevenLabs',
    description: '高质量AI语音合成，支持多种声音和情感',
    features: ['自然语音', '多种声音', '情感表达', '29种语言'],
    color: 'from-indigo-500 to-purple-500',
    bgColor: 'bg-indigo-50',
    textColor: 'text-indigo-600',
    url: 'https://elevenlabs.io',
    signupUrl: 'https://elevenlabs.io/sign-up',
    placeholder: 'Enter ElevenLabs API key',
    pricing: '$5/月起',
    freeQuota: '10,000字符/月',
  },
  {
    id: 'google',
    name: 'Google Cloud TTS',
    description: 'Google云端文字转语音，支持40+语言',
    features: ['40+语言', 'Neural2声音', '高质量', 'SSML支持'],
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    url: 'https://cloud.google.com/text-to-speech',
    signupUrl: 'https://console.cloud.google.com/apis/credentials',
    placeholder: 'Enter Google Cloud API key',
    pricing: '按用量计费',
    freeQuota: '400万字符/月免费',
  },
] as const;

// SkillsMP provider configuration
const SKILLSMP_PROVIDER = {
  id: 'skillsmp',
  name: 'SkillsMP',
  description:
    'Agent Skills Marketplace - 66,000+ skills for Claude Code, Codex & ChatGPT',
  features: ['AI语义搜索', 'SKILL.md标准', '每日自动同步', '分类浏览'],
  color: 'from-violet-500 to-purple-600',
  bgColor: 'bg-violet-50',
  textColor: 'text-violet-600',
  url: 'https://skillsmp.com',
  signupUrl: 'https://skillsmp.com/docs/api',
  placeholder: 'sk_live_...',
  pricing: '免费/付费计划',
  freeQuota: '基础搜索免费',
} as const;

// Search provider configurations
const SEARCH_PROVIDERS = [
  {
    id: 'perplexity',
    name: 'Perplexity',
    description: 'AI驱动的研究搜索引擎',
    features: ['AI生成答案', '实时信息', '深度研究'],
    icon: '/icons/search/perplexity.svg',
    color: 'from-blue-500 to-cyan-500',
    bgColor: 'bg-blue-50',
    textColor: 'text-blue-600',
    url: 'https://perplexity.ai',
    placeholder: 'pplx-...',
  },
  {
    id: 'tavily',
    name: 'Tavily',
    description: 'AI Agent优化的搜索API',
    features: ['Agent优化', '结构化数据', '快速响应'],
    icon: '/icons/search/tavily.svg',
    color: 'from-purple-500 to-indigo-500',
    bgColor: 'bg-purple-50',
    textColor: 'text-purple-600',
    url: 'https://tavily.com',
    placeholder: 'tvly-...',
  },
  {
    id: 'serper',
    name: 'Serper',
    description: 'Google搜索结果API',
    features: ['Google结果', '高准确率', '丰富元数据'],
    icon: '/icons/search/serper.svg',
    color: 'from-green-500 to-emerald-500',
    bgColor: 'bg-green-50',
    textColor: 'text-green-600',
    url: 'https://serper.dev',
    placeholder: 'Enter API key',
  },
  {
    id: 'duckduckgo',
    name: 'DuckDuckGo',
    description: '隐私优先的免费搜索引擎',
    features: ['免费使用', '无需API Key', '隐私保护'],
    icon: '/icons/search/duckduckgo.svg',
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
    url: 'https://duckduckgo.com',
    placeholder: '',
    noKeyRequired: true,
  },
] as const;

// Content extraction provider configurations
const EXTRACTION_PROVIDERS = [
  {
    id: 'jina',
    name: 'Jina AI Reader',
    description: 'URL转Markdown，免费高质量',
    features: ['免费额度', '高质量', 'Markdown输出'],
    color: 'from-orange-500 to-red-500',
    bgColor: 'bg-orange-50',
    textColor: 'text-orange-600',
    url: 'https://jina.ai/reader',
    placeholder: 'jina_...',
    balanceType: 'extraction' as const,
  },
  {
    id: 'firecrawl',
    name: 'Firecrawl',
    description: '复杂网页抓取，支持JS渲染',
    features: ['JS渲染', '复杂网站', '结构化数据'],
    color: 'from-amber-500 to-orange-500',
    bgColor: 'bg-amber-50',
    textColor: 'text-amber-600',
    url: 'https://firecrawl.dev',
    placeholder: 'fc-...',
    balanceType: 'extraction' as const,
  },
  {
    id: 'tavily',
    name: 'Tavily (Deep Research)',
    description: '深度研究与内容分析',
    features: ['深度研究', '多源综合', 'AI分析'],
    color: 'from-violet-500 to-purple-500',
    bgColor: 'bg-violet-50',
    textColor: 'text-violet-600',
    url: 'https://tavily.com',
    placeholder: 'tvly-...',
    balanceType: 'extraction' as const,
  },
] as const;

// Simulation API Categories with Provider support
interface SimulationAPIProvider {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  headers?: string;
  enabled: boolean;
  isDefault: boolean;
}

interface BackendProvider {
  id: string;
  name: string;
  category: string;
  baseUrl: string;
  apiKey: string;
  headers?: string;
  enabled: boolean;
  isDefault: boolean;
}

interface SimulationAPICategory {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  icon: string;
  gradientFrom: string;
  gradientTo: string;
  providers: SimulationAPIProvider[];
}

// 预置API模板 - 帮助用户快速配置常用数据源
interface APITemplate {
  name: string;
  description: string;
  baseUrl: string;
  apiKeyUrl: string; // 获取API Key的链接
  apiKeyPlaceholder: string;
  headers?: string;
  freeQuota?: string; // 免费额度说明
}

const API_TEMPLATES: Record<string, APITemplate[]> = {
  market: [
    {
      name: 'Alpha Vantage',
      description: '免费股票/加密货币/商品数据API，每分钟5次请求',
      baseUrl:
        'https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=NVDA&apikey=',
      apiKeyUrl: 'https://www.alphavantage.co/support/#api-key',
      apiKeyPlaceholder: 'YOUR_ALPHAVANTAGE_KEY',
      freeQuota: '免费：5次/分钟, 500次/天',
    },
    {
      name: 'Yahoo Finance (via RapidAPI)',
      description: '雅虎财经数据，需RapidAPI账号',
      baseUrl: 'https://yahoo-finance15.p.rapidapi.com/api/v1/markets/quote',
      apiKeyUrl: 'https://rapidapi.com/sparior/api/yahoo-finance15',
      apiKeyPlaceholder: 'YOUR_RAPIDAPI_KEY',
      headers: '{"X-RapidAPI-Host": "yahoo-finance15.p.rapidapi.com"}',
      freeQuota: '免费：100次/月',
    },
    {
      name: 'Financial Modeling Prep',
      description: '财务数据、实时报价、历史价格',
      baseUrl: 'https://financialmodelingprep.com/api/v3/quote/NVDA?apikey=',
      apiKeyUrl: 'https://site.financialmodelingprep.com/developer/docs',
      apiKeyPlaceholder: 'YOUR_FMP_KEY',
      freeQuota: '免费：250次/天',
    },
  ],
  finance: [
    {
      name: 'SEC EDGAR',
      description: 'SEC公开财报数据，完全免费无需Key',
      baseUrl: 'https://data.sec.gov/submissions/CIK0001045810.json',
      apiKeyUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany',
      apiKeyPlaceholder: '无需API Key',
      headers: `{"User-Agent": "${config.brand.userAgent}"}`,
      freeQuota: '免费：无限制（需设置User-Agent）',
    },
    {
      name: 'Financial Modeling Prep (Filings)',
      description: '公司财报、资产负债表、现金流',
      baseUrl:
        'https://financialmodelingprep.com/api/v3/income-statement/NVDA?apikey=',
      apiKeyUrl: 'https://site.financialmodelingprep.com/developer/docs',
      apiKeyPlaceholder: 'YOUR_FMP_KEY',
      freeQuota: '免费：250次/天',
    },
    {
      name: 'Polygon.io',
      description: '股票、期权、加密货币市场数据',
      baseUrl: 'https://api.polygon.io/v3/reference/tickers/NVDA?apiKey=',
      apiKeyUrl: 'https://polygon.io/dashboard/signup',
      apiKeyPlaceholder: 'YOUR_POLYGON_KEY',
      freeQuota: '免费：5次/分钟',
    },
  ],
  news: [
    {
      name: 'NewsAPI',
      description: '全球新闻聚合API，支持关键词搜索',
      baseUrl: 'https://newsapi.org/v2/everything?q=NVIDIA&apiKey=',
      apiKeyUrl: 'https://newsapi.org/register',
      apiKeyPlaceholder: 'YOUR_NEWSAPI_KEY',
      freeQuota: '免费：100次/天（开发者版）',
    },
    {
      name: 'GNews',
      description: '新闻搜索API，支持多语言',
      baseUrl: 'https://gnews.io/api/v4/search?q=semiconductor&token=',
      apiKeyUrl: 'https://gnews.io/register',
      apiKeyPlaceholder: 'YOUR_GNEWS_TOKEN',
      freeQuota: '免费：100次/天',
    },
    {
      name: 'Finnhub',
      description: '财经新闻和市场情绪分析（日期会自动更新为最近一年）',
      baseUrl: (() => {
        const today = new Date();
        const oneYearAgo = new Date(today);
        oneYearAgo.setFullYear(today.getFullYear() - 1);
        const formatDate = (d: Date) => d.toISOString().split('T')[0];
        return `https://finnhub.io/api/v1/company-news?symbol=NVDA&from=${formatDate(oneYearAgo)}&to=${formatDate(today)}&token=`;
      })(),
      apiKeyUrl: 'https://finnhub.io/register',
      apiKeyPlaceholder: 'YOUR_FINNHUB_TOKEN',
      freeQuota: '免费：60次/分钟',
    },
  ],
  regulation: [
    {
      name: 'Federal Register API',
      description: '美国联邦法规公告，完全免费',
      baseUrl:
        'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=semiconductor',
      apiKeyUrl:
        'https://www.federalregister.gov/developers/documentation/api/v1',
      apiKeyPlaceholder: '无需API Key',
      freeQuota: '免费：无限制',
    },
    {
      name: 'BIS Export Administration',
      description: '美国出口管制条例',
      baseUrl:
        'https://www.bis.doc.gov/index.php/regulations/export-administration-regulations-ear',
      apiKeyUrl: 'https://www.bis.doc.gov',
      apiKeyPlaceholder: '网页数据源，无API',
      freeQuota: '公开数据',
    },
    {
      name: 'EU EUR-Lex',
      description: '欧盟法规数据库API',
      baseUrl: 'https://eur-lex.europa.eu/eurlex-ws/rest/search',
      apiKeyUrl:
        'https://eur-lex.europa.eu/content/help/eurlex-content/webservices.html',
      apiKeyPlaceholder: '无需API Key',
      freeQuota: '免费：有速率限制',
    },
  ],
};

const DEFAULT_SIMULATION_API_CATEGORIES: SimulationAPICategory[] = [
  {
    id: 'market',
    name: 'Market & Pricing',
    nameZh: '市场与定价',
    description: 'GPU/芯片/云算力价格、供需关系、交付周期',
    icon: 'TrendingUp',
    gradientFrom: 'blue-500',
    gradientTo: 'cyan-500',
    providers: [],
  },
  {
    id: 'finance',
    name: 'Finance & Filings',
    nameZh: '财经与公告',
    description: '财报、投融资、公告、专利/备案等公司公开信息',
    icon: 'Wallet',
    gradientFrom: 'green-500',
    gradientTo: 'emerald-500',
    providers: [],
  },
  {
    id: 'news',
    name: 'News & Sentiment',
    nameZh: '新闻与舆情',
    description: '行业新闻、媒体报道、社交媒体情绪',
    icon: 'Sparkles',
    gradientFrom: 'orange-500',
    gradientTo: 'amber-500',
    providers: [],
  },
  {
    id: 'regulation',
    name: 'Regulation & Policy',
    nameZh: '监管与政策',
    description: '政策法规、出口管制、能耗标准、合规要求',
    icon: 'AlertTriangle',
    gradientFrom: 'red-500',
    gradientTo: 'pink-500',
    providers: [],
  },
];

export default function ExternalAPISettings() {
  // Search config state
  const [searchConfig, setSearchConfig] = useState<SearchConfig>({
    provider: 'tavily',
    enabled: true,
    perplexity: { apiKey: null, hasApiKey: false },
    tavily: { apiKey: null, hasApiKey: false },
    serper: { apiKey: null, hasApiKey: false },
    duckduckgo: { apiKey: null, hasApiKey: true, noKeyRequired: true },
  });
  // 单 Key（perplexity）+ 多 Key（tavily, serper）
  const [searchApiKeys, setSearchApiKeys] = useState<Record<string, string>>({
    perplexity: '',
  });
  // ★ 多 Key 支持
  const [tavilyApiKeys, setTavilyApiKeys] = useState<string[]>(['']);
  const [serperApiKeys, setSerperApiKeys] = useState<string[]>(['']);

  // Extraction config state
  const [extractionConfig, setExtractionConfig] = useState<ExtractionConfig>({
    enabled: true,
    jina: { apiKey: null, hasApiKey: false },
    firecrawl: { apiKey: null, hasApiKey: false },
    tavily: { apiKey: null, hasApiKey: false },
  });
  const [extractionApiKeys, setExtractionApiKeys] = useState<
    Record<string, string>
  >({
    jina: '',
    firecrawl: '',
    tavily: '',
  });

  // YouTube config state
  const [youtubeConfig, setYoutubeConfig] = useState<YouTubeConfig>({
    enabled: true,
    provider: 'supadata',
    supadata: { apiKey: null, hasApiKey: false },
  });
  const [youtubeApiKeys, setYoutubeApiKeys] = useState<Record<string, string>>({
    supadata: '',
  });

  // TTS config state
  const [ttsConfig, setTtsConfig] = useState<TTSConfig>({
    enabled: true,
    provider: 'elevenlabs',
    elevenlabs: { apiKey: null, hasApiKey: false },
    google: { apiKey: null, hasApiKey: false },
  });
  const [ttsApiKeys, setTtsApiKeys] = useState<Record<string, string>>({
    elevenlabs: '',
    google: '',
  });

  // SkillsMP config state
  const [skillsmpConfig, setSkillsmpConfig] = useState<SkillsMPConfig>({
    enabled: true,
    apiKey: null,
    hasApiKey: false,
    syncInterval: 'daily',
  });
  const [skillsmpApiKey, setSkillsmpApiKey] = useState('');

  // Simulation APIs state
  const [simulationAPICategories, setSimulationAPICategories] = useState<
    SimulationAPICategory[]
  >(DEFAULT_SIMULATION_API_CATEGORIES);

  // Balance info state
  const [balances, setBalances] = useState<Record<string, BalanceInfo>>({});
  const [checkingBalance, setCheckingBalance] = useState<string | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<
    Record<string, { success: boolean; message: string }>
  >({});
  const [message, setMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [activeTab, setActiveTab] = useState<
    'search' | 'extraction' | 'simulation' | 'youtube' | 'tts' | 'skillsmp'
  >('search');
  const [visibleApiKeys, setVisibleApiKeys] = useState<Record<string, boolean>>(
    {}
  );

  const toggleApiKeyVisibility = (key: string) => {
    setVisibleApiKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const loadConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const [
        searchRes,
        extractionRes,
        providersRes,
        youtubeRes,
        ttsRes,
        skillsmpRes,
      ] = await Promise.all([
        fetch(`${config.apiUrl}/admin/search-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/extraction-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/external-providers`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/youtube-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/tts-config`, {
          headers: { ...getAuthHeader() },
        }),
        fetch(`${config.apiUrl}/admin/skillsmp-config`, {
          headers: { ...getAuthHeader() },
        }),
      ]);

      if (searchRes.ok) {
        const result = await searchRes.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setSearchConfig(data);
      }

      if (extractionRes.ok) {
        const result = await extractionRes.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setExtractionConfig(data);
      }

      if (youtubeRes.ok) {
        const result = await youtubeRes.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setYoutubeConfig(data);
      }

      if (ttsRes.ok) {
        const result = await ttsRes.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setTtsConfig(data);
      }

      if (skillsmpRes.ok) {
        const result = await skillsmpRes.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setSkillsmpConfig(data);
        // Populate API key input with masked value if configured
        if (data.apiKey) {
          setSkillsmpApiKey(data.apiKey);
        }
      }

      if (providersRes.ok) {
        const providersResult = await providersRes.json();
        // Handle wrapped API response { success: true, data: T }
        const providers: BackendProvider[] =
          providersResult?.data ?? providersResult;
        logger.debug('[ExternalAPI] Loaded providers from backend:', providers);

        // Group providers by category - ONLY include providers with valid data
        if (Array.isArray(providers) && providers.length > 0) {
          const categorized = DEFAULT_SIMULATION_API_CATEGORIES.map((cat) => {
            const categoryProviders = providers
              .filter((p) => {
                // Filter by category
                if (p.category !== cat.id) return false;

                // CRITICAL: Only include providers with actual configuration
                // Must have name AND (baseUrl OR apiKey)
                const hasName = p.name?.trim();
                const hasBaseUrl = p.baseUrl?.trim();
                const hasApiKey = !!p.apiKey?.trim();

                const isValid = hasName && (hasBaseUrl || hasApiKey);

                if (!isValid) {
                  logger.warn(
                    `[ExternalAPI] Skipping invalid provider for ${cat.id}:`,
                    {
                      name: p.name,
                      hasBaseUrl: !!hasBaseUrl,
                      hasApiKey: hasApiKey,
                    }
                  );
                }

                return isValid;
              })
              .map((p) => ({
                id: p.id.replace(`${cat.id}-`, ''),
                name: p.name,
                baseUrl: p.baseUrl || '',
                apiKey: p.apiKey || '', // Show full API key (admin only page)
                headers: p.headers || '',
                enabled: p.enabled ?? false,
                isDefault: p.isDefault ?? false,
              }));

            logger.debug(
              `[ExternalAPI] Category ${cat.id} has ${categoryProviders.length} valid providers`
            );

            return {
              ...cat,
              providers: categoryProviders,
            };
          });
          logger.debug('[ExternalAPI] Final categorized:', categorized);
          setSimulationAPICategories(categorized);
        } else {
          logger.debug(
            '[ExternalAPI] No providers saved, using default empty state'
          );
          // No saved providers - keep default empty state
          setSimulationAPICategories(DEFAULT_SIMULATION_API_CATEGORIES);
        }
      }
    } catch (err) {
      logger.error('Failed to load configs:', err);
      setMessage({ type: 'error', text: '加载配置失败' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfigs();
  }, [loadConfigs]);

  const handleSaveSearch = async () => {
    setSaving(true);
    setMessage(null);

    // ★ 过滤有效的 API Keys
    const validTavilyKeys = tavilyApiKeys.filter((k) => k.trim() !== '');
    const validSerperKeys = serperApiKeys.filter((k) => k.trim() !== '');

    try {
      const res = await fetch(`${config.apiUrl}/admin/search-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          provider: searchConfig.provider,
          enabled: searchConfig.enabled,
          perplexityApiKey: searchApiKeys.perplexity || undefined,
          // ★ 使用新的多 Key 格式
          tavilyApiKeys:
            validTavilyKeys.length > 0 ? validTavilyKeys : undefined,
          serperApiKeys:
            validSerperKeys.length > 0 ? validSerperKeys : undefined,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setSearchConfig(data);
        setSearchApiKeys({ perplexity: '' });
        setTavilyApiKeys(['']);
        setSerperApiKeys(['']);
        setMessage({ type: 'success', text: '搜索配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      logger.error('Failed to save search config:', err);
      setMessage({ type: 'error', text: '保存配置失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveExtraction = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${config.apiUrl}/admin/extraction-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          enabled: extractionConfig.enabled,
          jinaApiKey: extractionApiKeys.jina || undefined,
          firecrawlApiKey: extractionApiKeys.firecrawl || undefined,
          tavilyApiKey: extractionApiKeys.tavily || undefined,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setExtractionConfig(data);
        setExtractionApiKeys({ jina: '', firecrawl: '', tavily: '' });
        setMessage({ type: 'success', text: '内容提取配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      logger.error('Failed to save extraction config:', err);
      setMessage({ type: 'error', text: '保存配置失败' });
    } finally {
      setSaving(false);
    }
  };

  // YouTube config handlers
  const handleSaveYoutube = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${config.apiUrl}/admin/youtube-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          enabled: youtubeConfig.enabled,
          provider: youtubeConfig.provider,
          supadataApiKey: youtubeApiKeys.supadata || undefined,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setYoutubeConfig(data);
        setYoutubeApiKeys({ supadata: '' });
        setMessage({ type: 'success', text: 'YouTube 字幕配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      logger.error('Failed to save YouTube config:', err);
      setMessage({ type: 'error', text: '保存配置失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestYoutube = async (providerId: string) => {
    setTesting(`youtube-${providerId}`);
    setTestResults((prev) => ({
      ...prev,
      [`youtube-${providerId}`]: { success: false, message: '' },
    }));

    try {
      const providerConfig = youtubeConfig[
        providerId as keyof YouTubeConfig
      ] as { hasApiKey: boolean } | undefined;
      const apiKey =
        youtubeApiKeys[providerId] ||
        (providerConfig?.hasApiKey ? '***use-saved***' : '');

      if (!apiKey) {
        setTestResults((prev) => ({
          ...prev,
          [`youtube-${providerId}`]: {
            success: false,
            message: '请先输入API Key',
          },
        }));
        setTesting(null);
        return;
      }

      if (apiKey === '***use-saved***') {
        setTestResults((prev) => ({
          ...prev,
          [`youtube-${providerId}`]: {
            success: true,
            message: 'API Key已配置（已保存）',
          },
        }));
        setTesting(null);
        return;
      }

      const res = await fetch(`${config.apiUrl}/admin/youtube-config/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setTestResults((prev) => ({
        ...prev,
        [`youtube-${providerId}`]: data,
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [`youtube-${providerId}`]: {
          success: false,
          message: (err as Error).message || '测试失败',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const getYoutubeProviderStatus = (providerId: string) => {
    const providerConfig = youtubeConfig[providerId as keyof YouTubeConfig] as
      | { hasApiKey: boolean }
      | undefined;
    return providerConfig?.hasApiKey || false;
  };

  // TTS config handlers
  const handleSaveTTS = async () => {
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${config.apiUrl}/admin/tts-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({
          enabled: ttsConfig.enabled,
          provider: ttsConfig.provider,
          elevenLabsApiKey: ttsApiKeys.elevenlabs || undefined,
          googleTTSApiKey: ttsApiKeys.google || undefined,
        }),
      });

      if (res.ok) {
        const result = await res.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setTtsConfig(data);
        setTtsApiKeys({ elevenlabs: '', google: '' });
        setMessage({ type: 'success', text: 'TTS 配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      logger.error('Failed to save TTS config:', err);
      setMessage({ type: 'error', text: '保存配置失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestTTS = async (providerId: string) => {
    setTesting(`tts-${providerId}`);
    setTestResults((prev) => ({
      ...prev,
      [`tts-${providerId}`]: { success: false, message: '' },
    }));

    try {
      const providerConfig = ttsConfig[providerId as keyof TTSConfig] as
        | { hasApiKey: boolean }
        | undefined;
      const apiKey =
        ttsApiKeys[providerId] ||
        (providerConfig?.hasApiKey ? '***use-saved***' : '');

      if (!apiKey) {
        setTestResults((prev) => ({
          ...prev,
          [`tts-${providerId}`]: {
            success: false,
            message: '请先输入 API Key',
          },
        }));
        setTesting(null);
        return;
      }

      const res = await fetch(`${config.apiUrl}/admin/tts-config/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setTestResults((prev) => ({
        ...prev,
        [`tts-${providerId}`]: data,
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [`tts-${providerId}`]: {
          success: false,
          message: (err as Error).message || '测试失败',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const getTTSProviderStatus = (providerId: string) => {
    const providerConfig = ttsConfig[providerId as keyof TTSConfig] as
      | { hasApiKey: boolean }
      | undefined;
    return providerConfig?.hasApiKey || false;
  };

  // Test external provider API
  const testSimulationAPIProvider = async (
    categoryId: string,
    provider: SimulationAPIProvider
  ) => {
    const fullProviderId = `${categoryId}-${provider.id}`;
    setTesting(fullProviderId);

    // Clear previous result
    setTestResults((prev) => {
      const newResults = { ...prev };
      delete newResults[fullProviderId];
      return newResults;
    });

    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/external-data/test`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            id: fullProviderId,
            name: provider.name,
            category: categoryId,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey || undefined,
            headers: provider.headers,
            enabled: provider.enabled,
          }),
        }
      );

      const result = await res.json();

      setTestResults((prev) => ({
        ...prev,
        [fullProviderId]: {
          success: result.ok,
          message: result.ok ? '连接成功' : result.error || '测试失败',
        },
      }));
    } catch (err) {
      logger.error('Test provider failed:', err);
      setTestResults((prev) => ({
        ...prev,
        [fullProviderId]: {
          success: false,
          message: err instanceof Error ? err.message : '网络错误',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  // Simulation APIs Management Functions
  const handleSaveSimulationAPIs = async () => {
    setSaving(true);
    setMessage(null);

    try {
      // Flatten all providers from all categories - only save providers with valid data
      const allProviders: BackendProvider[] = [];
      simulationAPICategories.forEach((category) => {
        logger.debug(
          `[Save] Processing category ${category.id} with ${category.providers.length} providers`
        );

        category.providers.forEach((provider) => {
          // Only save provider if it has a name AND (baseUrl OR apiKey)
          const hasApiKey = !!provider.apiKey?.trim();
          const hasValidData =
            provider.name?.trim() && (provider.baseUrl?.trim() || hasApiKey);

          logger.debug(
            `[Save] Provider "${provider.name}": hasValidData=${hasValidData}, baseUrl="${provider.baseUrl}", hasApiKey=${hasApiKey}`
          );

          if (hasValidData) {
            const providerToSave = {
              id: `${category.id}-${provider.id}`,
              name: provider.name,
              description: category.description,
              category: category.id,
              enabled: provider.enabled,
              baseUrl: provider.baseUrl?.trim() || '',
              headers: provider.headers?.trim() || undefined,
              apiKey: provider.apiKey?.trim() || '',
              isDefault: provider.isDefault,
            };
            logger.debug('[Save] Adding provider:', providerToSave);
            allProviders.push(providerToSave);
          }
        });
      });

      logger.debug(
        `[Save] Total providers to save: ${allProviders.length}`,
        allProviders
      );

      const res = await fetch(`${config.apiUrl}/admin/external-providers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ providers: allProviders }),
      });

      if (res.ok) {
        setMessage({ type: 'success', text: 'Simulation APIs 配置保存成功' });
        // Reload configs to show saved data
        await loadConfigs();
        setTimeout(() => setMessage(null), 3000);
      } else {
        const errorData = await res.json().catch(() => ({}));
        setMessage({
          type: 'error',
          text: `保存配置失败: ${errorData.message || res.statusText}`,
        });
      }
    } catch (err) {
      logger.error('Failed to save Simulation APIs config:', err);
      setMessage({ type: 'error', text: '保存配置失败' });
    } finally {
      setSaving(false);
    }
  };

  // 模板选择状态
  const [showTemplateModal, setShowTemplateModal] = useState<string | null>(
    null
  );

  const addSimulationAPIProvider = (categoryId: string) => {
    setSimulationAPICategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          const newProviderId = `provider-${Date.now()}`;
          return {
            ...cat,
            providers: [
              ...cat.providers,
              {
                id: newProviderId,
                name: `Provider ${cat.providers.length + 1}`,
                baseUrl: '',
                apiKey: '',
                enabled: false,
                isDefault: cat.providers.length === 0,
              },
            ],
          };
        }
        return cat;
      })
    );
  };

  // 使用模板添加Provider
  const addProviderFromTemplate = (
    categoryId: string,
    template: APITemplate
  ) => {
    setSimulationAPICategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          const newProviderId = `${categoryId}-provider-${Date.now()}`;
          return {
            ...cat,
            providers: [
              ...cat.providers,
              {
                id: newProviderId,
                name: template.name,
                baseUrl: template.baseUrl,
                apiKey: '',
                headers: template.headers || '',
                enabled: true,
                isDefault: cat.providers.length === 0,
              },
            ],
          };
        }
        return cat;
      })
    );
    setShowTemplateModal(null);
  };

  const updateSimulationAPIProvider = (
    categoryId: string,
    providerId: string,
    updates: Partial<SimulationAPIProvider>
  ) => {
    setSimulationAPICategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            providers: cat.providers.map((provider) => {
              if (provider.id === providerId) {
                // If setting as default, unset others
                if (updates.isDefault) {
                  cat.providers.forEach((p) => (p.isDefault = false));
                }
                return { ...provider, ...updates };
              }
              return provider;
            }),
          };
        }
        return cat;
      })
    );
  };

  const removeSimulationAPIProvider = (
    categoryId: string,
    providerId: string
  ) => {
    setSimulationAPICategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          const newProviders = cat.providers.filter((p) => p.id !== providerId);
          // If removed provider was default, set first provider as default
          if (
            newProviders.length > 0 &&
            !newProviders.some((p) => p.isDefault)
          ) {
            newProviders[0].isDefault = true;
          }
          return { ...cat, providers: newProviders };
        }
        return cat;
      })
    );
  };

  const handleTestSearch = async (providerId: string) => {
    setTesting(providerId);
    setTestResults((prev) => ({
      ...prev,
      [providerId]: { success: false, message: '' },
    }));

    try {
      const providerConfig = searchConfig[providerId as keyof SearchConfig] as {
        hasApiKey: boolean;
      };
      const apiKey =
        searchApiKeys[providerId] ||
        (providerConfig?.hasApiKey ? '***use-saved***' : '');

      if (!apiKey) {
        setTestResults((prev) => ({
          ...prev,
          [providerId]: { success: false, message: '请先输入API Key' },
        }));
        setTesting(null);
        return;
      }

      if (apiKey === '***use-saved***') {
        setTestResults((prev) => ({
          ...prev,
          [providerId]: { success: true, message: 'API Key已配置（已保存）' },
        }));
        setTesting(null);
        return;
      }

      const res = await fetch(`${config.apiUrl}/admin/search-config/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setTestResults((prev) => ({ ...prev, [providerId]: data }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: {
          success: false,
          message: (err as Error).message || '测试失败',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const handleTestExtraction = async (providerId: string) => {
    setTesting(`extraction-${providerId}`);
    setTestResults((prev) => ({
      ...prev,
      [`extraction-${providerId}`]: { success: false, message: '' },
    }));

    try {
      const providerConfig = extractionConfig[
        providerId as keyof ExtractionConfig
      ] as { hasApiKey: boolean };
      const apiKey =
        extractionApiKeys[providerId] ||
        (providerConfig?.hasApiKey ? '***use-saved***' : '');

      if (!apiKey) {
        setTestResults((prev) => ({
          ...prev,
          [`extraction-${providerId}`]: {
            success: false,
            message: '请先输入API Key',
          },
        }));
        setTesting(null);
        return;
      }

      if (apiKey === '***use-saved***') {
        setTestResults((prev) => ({
          ...prev,
          [`extraction-${providerId}`]: {
            success: true,
            message: 'API Key已配置（已保存）',
          },
        }));
        setTesting(null);
        return;
      }

      const res = await fetch(`${config.apiUrl}/admin/extraction-config/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setTestResults((prev) => ({
        ...prev,
        [`extraction-${providerId}`]: data,
      }));
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [`extraction-${providerId}`]: {
          success: false,
          message: (err as Error).message || '测试失败',
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  const checkBalance = async (
    type: 'search' | 'extraction',
    providerId: string
  ) => {
    const key = `${type}-${providerId}`;
    setCheckingBalance(key);

    try {
      const res = await fetch(
        `${config.apiUrl}/admin/api-balance/${type}/${providerId}`,
        {
          headers: { ...getAuthHeader() },
        }
      );

      if (res.ok) {
        const result = await res.json();
        // Handle wrapped API response { success: true, data: T }
        const data = result?.data ?? result;
        setBalances((prev) => ({ ...prev, [key]: data }));
      }
    } catch (err) {
      logger.error('Failed to check balance:', err);
      setBalances((prev) => ({
        ...prev,
        [key]: { provider: providerId, hasBalance: false, error: '查询失败' },
      }));
    } finally {
      setCheckingBalance(null);
    }
  };

  const setAsDefault = (providerId: string) => {
    setSearchConfig((prev) => ({ ...prev, provider: providerId }));
  };

  const getSearchProviderStatus = (providerId: string) => {
    const providerConfig = searchConfig[providerId as keyof SearchConfig] as
      | { hasApiKey: boolean }
      | undefined;
    return providerConfig?.hasApiKey || false;
  };

  const getExtractionProviderStatus = (providerId: string) => {
    const providerConfig = extractionConfig[
      providerId as keyof ExtractionConfig
    ] as { hasApiKey: boolean } | undefined;
    return providerConfig?.hasApiKey || false;
  };

  const renderBalanceInfo = (
    type: 'search' | 'extraction',
    providerId: string
  ) => {
    const key = `${type}-${providerId}`;
    const balance = balances[key];
    const isChecking = checkingBalance === key;
    const isConfigured =
      type === 'search'
        ? getSearchProviderStatus(providerId)
        : getExtractionProviderStatus(providerId);

    if (!isConfigured) return null;

    return (
      <div className="mt-2 flex items-center justify-between rounded-lg bg-gray-50 p-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-gray-500" />
          <span className="text-xs text-gray-600">余额/配额:</span>
        </div>
        <div className="flex items-center gap-2">
          {isChecking ? (
            <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
          ) : balance ? (
            <span
              className={`text-xs font-medium ${
                balance.hasBalance ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {balance.error || balance.balance || 'Unknown'}
              {balance.quota && (
                <span className="ml-1 text-gray-500">
                  ({balance.quota.used}/{balance.quota.limit})
                </span>
              )}
            </span>
          ) : (
            <span className="text-xs text-gray-400">未查询</span>
          )}
          <button
            onClick={() => checkBalance(type, providerId)}
            disabled={isChecking}
            className="rounded p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            title="查询余额"
          >
            <TrendingUp className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-purple-600 border-t-transparent"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            External API Configuration
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            配置第三方API，为AI提供搜索和内容提取能力
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={loadConfigs}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-3 rounded-lg p-4 ${
            message.type === 'success'
              ? 'bg-green-50 text-green-700'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="h-5 w-5" />
          ) : (
            <AlertTriangle className="h-5 w-5" />
          )}
          <span>{message.text}</span>
          <button
            onClick={() => setMessage(null)}
            className="ml-auto opacity-50 hover:opacity-100"
          >
            &times;
          </button>
        </div>
      )}

      {/* Category Dropdown Selector */}
      <div className="flex items-center gap-4 border-b border-gray-200 px-4 py-3">
        <label className="text-sm font-medium text-gray-700">Category:</label>
        <select
          value={activeTab}
          onChange={(e) =>
            setActiveTab(
              e.target.value as
                | 'search'
                | 'extraction'
                | 'simulation'
                | 'youtube'
                | 'tts'
                | 'skillsmp'
            )
          }
          className="min-w-[200px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:border-gray-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20"
        >
          <option value="search">Web Search API</option>
          <option value="extraction">Content Extraction API</option>
          <option value="simulation">Simulation Data Sources</option>
          <option value="youtube">YouTube Transcript API</option>
          <option value="tts">Text-to-Speech (TTS)</option>
          <option value="skillsmp">AI Skills (SkillsMP)</option>
        </select>
        <span className="text-xs text-gray-500">
          {activeTab === 'search' &&
            'Configure web search providers for AI research'}
          {activeTab === 'extraction' &&
            'Configure content extraction from URLs'}
          {activeTab === 'simulation' &&
            'Configure external data sources for simulation'}
          {activeTab === 'youtube' && 'Configure YouTube transcript extraction'}
          {activeTab === 'tts' && 'Configure text-to-speech synthesis'}
          {activeTab === 'skillsmp' &&
            'Connect to SkillsMP marketplace for AI skills'}
        </span>
      </div>

      {/* Search API Tab */}
      {activeTab === 'search' && (
        <div className="space-y-6">
          {/* Global Search Toggle */}
          <div className="rounded-xl border border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 shadow-lg">
                  <Search className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Web Search</h3>
                  <p className="text-sm text-gray-600">
                    允许AI模型进行网络搜索获取实时信息
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setSearchConfig((prev) => ({
                    ...prev,
                    enabled: !prev.enabled,
                  }))
                }
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                  searchConfig.enabled ? 'bg-purple-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                    searchConfig.enabled ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Provider Cards Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {SEARCH_PROVIDERS.map((provider) => {
              const isConfigured = getSearchProviderStatus(provider.id);
              const isDefault = searchConfig.provider === provider.id;
              const testResult = testResults[provider.id];

              return (
                <div
                  key={provider.id}
                  className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md ${
                    isDefault
                      ? 'border-purple-400 ring-2 ring-purple-100'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Header */}
                  <div className={`bg-gradient-to-r ${provider.color} p-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                          <Globe className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white">
                              {provider.name}
                            </h3>
                            {isDefault && (
                              <span className="rounded-full bg-white/30 px-2 py-0.5 text-xs font-medium text-white">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/80">
                            {provider.description}
                          </p>
                        </div>
                      </div>
                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="space-y-4 p-4">
                    {/* Features */}
                    <div className="flex flex-wrap gap-2">
                      {provider.features.map((feature) => (
                        <span
                          key={feature}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${provider.bgColor} ${provider.textColor}`}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <span className="text-sm text-gray-600">API Key:</span>
                      {'noKeyRequired' in provider && provider.noKeyRequired ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          免费使用
                        </span>
                      ) : isConfigured ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          已配置
                          {/* ★ 显示 Key 数量 */}
                          {provider.id === 'tavily' &&
                            searchConfig.tavily.keyCount !== undefined &&
                            searchConfig.tavily.keyCount > 1 && (
                              <span className="ml-1 text-xs text-gray-500">
                                ({searchConfig.tavily.keyCount} keys)
                              </span>
                            )}
                          {provider.id === 'serper' &&
                            searchConfig.serper.keyCount !== undefined &&
                            searchConfig.serper.keyCount > 1 && (
                              <span className="ml-1 text-xs text-gray-500">
                                ({searchConfig.serper.keyCount} keys)
                              </span>
                            )}
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                          <XCircle className="h-4 w-4" />
                          未配置
                        </span>
                      )}
                    </div>

                    {/* Balance Info */}
                    {renderBalanceInfo('search', provider.id)}

                    {/* API Key Input - only show if key is required */}
                    {'noKeyRequired' in provider && provider.noKeyRequired ? (
                      <div className="rounded-lg bg-green-50 p-3 text-center text-sm text-green-700">
                        无需配置 API Key，可直接使用
                      </div>
                    ) : provider.id === 'tavily' || provider.id === 'serper' ? (
                      /* ★ 多 Key 输入（Tavily / Serper） */
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-gray-500">
                            支持多个 API Key（自动轮换）
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (provider.id === 'tavily') {
                                setTavilyApiKeys((prev) => [...prev, '']);
                              } else {
                                setSerperApiKeys((prev) => [...prev, '']);
                              }
                            }}
                            className="flex items-center gap-1 rounded px-2 py-1 text-xs text-purple-600 hover:bg-purple-50"
                          >
                            <Plus className="h-3 w-3" />
                            添加 Key
                          </button>
                        </div>
                        {(provider.id === 'tavily'
                          ? tavilyApiKeys
                          : serperApiKeys
                        ).map((key, index) => (
                          <div key={index} className="flex gap-2">
                            <div className="relative flex-1">
                              <input
                                type={
                                  visibleApiKeys[
                                    `search-${provider.id}-${index}`
                                  ]
                                    ? 'text'
                                    : 'password'
                                }
                                value={key}
                                onChange={(e) => {
                                  if (provider.id === 'tavily') {
                                    setTavilyApiKeys((prev) => {
                                      const newKeys = [...prev];
                                      newKeys[index] = e.target.value;
                                      return newKeys;
                                    });
                                  } else {
                                    setSerperApiKeys((prev) => {
                                      const newKeys = [...prev];
                                      newKeys[index] = e.target.value;
                                      return newKeys;
                                    });
                                  }
                                }}
                                placeholder={
                                  isConfigured && index === 0
                                    ? '••••••••••••••••'
                                    : `API Key ${index + 1}`
                                }
                                className="font-mono w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                              />
                              <button
                                type="button"
                                onClick={() =>
                                  toggleApiKeyVisibility(
                                    `search-${provider.id}-${index}`
                                  )
                                }
                                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                              >
                                {visibleApiKeys[
                                  `search-${provider.id}-${index}`
                                ] ? (
                                  <EyeOff className="h-4 w-4" />
                                ) : (
                                  <Eye className="h-4 w-4" />
                                )}
                              </button>
                            </div>
                            {(provider.id === 'tavily'
                              ? tavilyApiKeys
                              : serperApiKeys
                            ).length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (provider.id === 'tavily') {
                                    setTavilyApiKeys((prev) =>
                                      prev.filter((_, i) => i !== index)
                                    );
                                  } else {
                                    setSerperApiKeys((prev) =>
                                      prev.filter((_, i) => i !== index)
                                    );
                                  }
                                }}
                                className="rounded-lg border border-gray-300 p-2 text-gray-400 hover:border-red-300 hover:bg-red-50 hover:text-red-500"
                                title="删除此 Key"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* 单 Key 输入（Perplexity） */
                      <div className="space-y-2">
                        <div className="relative">
                          <input
                            type={
                              visibleApiKeys[`search-${provider.id}`]
                                ? 'text'
                                : 'password'
                            }
                            value={searchApiKeys[provider.id] || ''}
                            onChange={(e) =>
                              setSearchApiKeys((prev) => ({
                                ...prev,
                                [provider.id]: e.target.value,
                              }))
                            }
                            placeholder={
                              isConfigured
                                ? '••••••••••••••••'
                                : provider.placeholder
                            }
                            className="font-mono w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              toggleApiKeyVisibility(`search-${provider.id}`)
                            }
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                            title={
                              visibleApiKeys[`search-${provider.id}`]
                                ? '隐藏'
                                : '显示'
                            }
                          >
                            {visibleApiKeys[`search-${provider.id}`] ? (
                              <EyeOff className="h-4 w-4" />
                            ) : (
                              <Eye className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Test Result */}
                    {testResult && (
                      <div
                        className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
                          testResult.success
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {testResult.success ? (
                          <CheckCircle className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="truncate">{testResult.message}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTestSearch(provider.id)}
                        disabled={
                          testing === provider.id ||
                          (!(
                            'noKeyRequired' in provider &&
                            provider.noKeyRequired
                          ) &&
                            !searchApiKeys[provider.id] &&
                            !isConfigured)
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {testing === provider.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        测试
                      </button>
                      {!isDefault && (
                        <button
                          onClick={() => setAsDefault(provider.id)}
                          className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isConfigured ||
                            ('noKeyRequired' in provider &&
                              provider.noKeyRequired)
                              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                              : 'cursor-not-allowed bg-gray-100 text-gray-400'
                          }`}
                          disabled={
                            !isConfigured &&
                            !(
                              'noKeyRequired' in provider &&
                              provider.noKeyRequired
                            )
                          }
                        >
                          <Sparkles className="h-4 w-4" />
                          设为默认
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveSearch}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-purple-500/25 hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存搜索配置
            </button>
          </div>

          {/* Current Default Info */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
                <Sparkles className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  当前默认搜索引擎:{' '}
                  <span className="text-purple-600">
                    {SEARCH_PROVIDERS.find(
                      (p) => p.id === searchConfig.provider
                    )?.name || searchConfig.provider}
                  </span>
                </p>
                <p className="text-xs text-gray-500">
                  AI模型将使用此搜索引擎进行网络搜索
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Extraction API Tab */}
      {activeTab === 'extraction' && (
        <div className="space-y-6">
          {/* Global Extraction Toggle */}
          <div className="rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-amber-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg">
                  <FileText className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Content Extraction
                  </h3>
                  <p className="text-sm text-gray-600">
                    增强URL内容提取能力，支持复杂网页和深度研究
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setExtractionConfig((prev) => ({
                    ...prev,
                    enabled: !prev.enabled,
                  }))
                }
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                  extractionConfig.enabled ? 'bg-orange-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                    extractionConfig.enabled ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Provider Cards Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {EXTRACTION_PROVIDERS.map((provider) => {
              const isConfigured = getExtractionProviderStatus(provider.id);
              const testResult = testResults[`extraction-${provider.id}`];

              return (
                <div
                  key={provider.id}
                  className="relative overflow-hidden rounded-xl border-2 border-gray-200 bg-white shadow-sm transition-all hover:shadow-md"
                >
                  {/* Header */}
                  <div className={`bg-gradient-to-r ${provider.color} p-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                          <FileText className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <h3 className="font-bold text-white">
                            {provider.name}
                          </h3>
                          <p className="text-xs text-white/80">
                            {provider.description}
                          </p>
                        </div>
                      </div>
                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="space-y-4 p-4">
                    {/* Features */}
                    <div className="flex flex-wrap gap-2">
                      {provider.features.map((feature) => (
                        <span
                          key={feature}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${provider.bgColor} ${provider.textColor}`}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <span className="text-sm text-gray-600">API Key:</span>
                      {isConfigured ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          已配置
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                          <XCircle className="h-4 w-4" />
                          未配置
                        </span>
                      )}
                    </div>

                    {/* Balance Info */}
                    {renderBalanceInfo('extraction', provider.id)}

                    {/* API Key Input */}
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type={
                            visibleApiKeys[`extraction-${provider.id}`]
                              ? 'text'
                              : 'password'
                          }
                          value={extractionApiKeys[provider.id]}
                          onChange={(e) =>
                            setExtractionApiKeys((prev) => ({
                              ...prev,
                              [provider.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            isConfigured
                              ? '••••••••••••••••'
                              : provider.placeholder
                          }
                          className="font-mono w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            toggleApiKeyVisibility(`extraction-${provider.id}`)
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                          title={
                            visibleApiKeys[`extraction-${provider.id}`]
                              ? '隐藏'
                              : '显示'
                          }
                        >
                          {visibleApiKeys[`extraction-${provider.id}`] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                      <div
                        className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
                          testResult.success
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {testResult.success ? (
                          <CheckCircle className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="truncate">{testResult.message}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTestExtraction(provider.id)}
                        disabled={
                          testing === `extraction-${provider.id}` ||
                          (!extractionApiKeys[provider.id] && !isConfigured)
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {testing === `extraction-${provider.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        测试连接
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveExtraction}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-orange-600 to-amber-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-orange-500/25 hover:from-orange-700 hover:to-amber-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存内容提取配置
            </button>
          </div>

          {/* Info */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-100">
                <FileText className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  内容提取优先级
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  1. <strong>Jina AI Reader</strong> -
                  免费高质量，优先使用（无需API Key也可使用，但有速率限制）
                  <br />
                  2. <strong>Firecrawl</strong> -
                  当Jina内容过短时自动使用，支持JS渲染
                  <br />
                  3. <strong>Tavily</strong> - 用于深度研究和多源内容综合
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Simulation APIs Tab */}
      {activeTab === 'simulation' && (
        <SimulationAPITab
          categories={simulationAPICategories}
          onUpdateCategories={setSimulationAPICategories}
          onSave={handleSaveSimulationAPIs}
          saving={saving}
          testResults={testResults}
          testing={testing}
          onTestProvider={testSimulationAPIProvider}
        />
      )}

      {/* YouTube API Tab */}
      {activeTab === 'youtube' && (
        <div className="space-y-6">
          {/* Global YouTube Toggle */}
          <div className="rounded-xl border border-red-200 bg-gradient-to-r from-red-50 to-rose-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-red-500 to-rose-600 shadow-lg">
                  <Youtube className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    YouTube Transcript API
                  </h3>
                  <p className="text-sm text-gray-600">
                    配置第三方 API 获取 YouTube 字幕，解决服务器 IP 封锁问题
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setYoutubeConfig((prev) => ({
                    ...prev,
                    enabled: !prev.enabled,
                  }))
                }
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                  youtubeConfig.enabled ? 'bg-red-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                    youtubeConfig.enabled ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Provider Cards Grid */}
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {YOUTUBE_PROVIDERS.map((provider) => {
              const isConfigured = getYoutubeProviderStatus(provider.id);
              const isDefault = youtubeConfig.provider === provider.id;
              const testResult = testResults[`youtube-${provider.id}`];

              return (
                <div
                  key={provider.id}
                  className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md ${
                    isDefault
                      ? 'border-red-400 ring-2 ring-red-100'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Header */}
                  <div className={`bg-gradient-to-r ${provider.color} p-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                          <Youtube className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white">
                              {provider.name}
                            </h3>
                            {isDefault && (
                              <span className="rounded-full bg-white/30 px-2 py-0.5 text-xs font-medium text-white">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/80">
                            {provider.description}
                          </p>
                        </div>
                      </div>
                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="space-y-4 p-4">
                    {/* Features */}
                    <div className="flex flex-wrap gap-2">
                      {provider.features.map((feature) => (
                        <span
                          key={feature}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${provider.bgColor} ${provider.textColor}`}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>

                    {/* Pricing Info */}
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">定价:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {provider.pricing}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm text-gray-600">免费额度:</span>
                        <span className="text-sm font-medium text-green-600">
                          {provider.freeQuota}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <span className="text-sm text-gray-600">API Key:</span>
                      {isConfigured ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          已配置
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                          <XCircle className="h-4 w-4" />
                          未配置
                        </span>
                      )}
                    </div>

                    {/* API Key Input */}
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type={
                            visibleApiKeys[`youtube-${provider.id}`]
                              ? 'text'
                              : 'password'
                          }
                          value={youtubeApiKeys[provider.id]}
                          onChange={(e) =>
                            setYoutubeApiKeys((prev) => ({
                              ...prev,
                              [provider.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            isConfigured
                              ? '••••••••••••••••'
                              : provider.placeholder
                          }
                          className="font-mono w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            toggleApiKeyVisibility(`youtube-${provider.id}`)
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                          title={
                            visibleApiKeys[`youtube-${provider.id}`]
                              ? '隐藏'
                              : '显示'
                          }
                        >
                          {visibleApiKeys[`youtube-${provider.id}`] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <a
                        href={provider.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-700"
                      >
                        <ExternalLink className="h-3 w-3" />
                        获取 API Key
                      </a>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                      <div
                        className={`flex items-center gap-2 rounded-lg p-2 text-sm ${
                          testResult.success
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-700'
                        }`}
                      >
                        {testResult.success ? (
                          <CheckCircle className="h-4 w-4 flex-shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 flex-shrink-0" />
                        )}
                        <span className="truncate">{testResult.message}</span>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleTestYoutube(provider.id)}
                        disabled={
                          testing === `youtube-${provider.id}` ||
                          (!youtubeApiKeys[provider.id] && !isConfigured)
                        }
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {testing === `youtube-${provider.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        测试连接
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveYoutube}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-red-600 to-rose-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-red-500/25 hover:from-red-700 hover:to-rose-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存 YouTube 配置
            </button>
          </div>

          {/* Info */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-100">
                <Youtube className="h-5 w-5 text-red-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  为什么需要配置第三方 API？
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  YouTube 会封锁云服务器（如 Railway、AWS、Vercel）的 IP
                  地址，导致无法直接获取字幕。
                  <br />
                  通过配置 <strong>Supadata</strong> 等第三方
                  API，可以绕过这一限制，稳定获取 YouTube 视频字幕。
                  <br />
                  <strong>Supadata</strong> 每月提供 100
                  次免费请求，适合个人使用。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TTS API Tab */}
      {activeTab === 'tts' && (
        <div className="space-y-6">
          {/* Global TTS Toggle */}
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    Text-to-Speech API
                  </h3>
                  <p className="text-sm text-gray-600">
                    配置语音合成 API，用于 AI Studio 音频概述功能
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setTtsConfig((prev) => ({
                    ...prev,
                    enabled: !prev.enabled,
                  }))
                }
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                  ttsConfig.enabled ? 'bg-indigo-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                    ttsConfig.enabled ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Provider Cards Grid */}
          <div className="grid gap-6 md:grid-cols-2">
            {TTS_PROVIDERS.map((provider) => {
              const isConfigured = getTTSProviderStatus(provider.id);
              const isDefault = ttsConfig.provider === provider.id;
              const testResult = testResults[`tts-${provider.id}`];

              return (
                <div
                  key={provider.id}
                  className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md ${
                    isDefault
                      ? 'border-indigo-400 ring-2 ring-indigo-100'
                      : 'border-gray-200'
                  }`}
                >
                  {/* Header */}
                  <div className={`bg-gradient-to-r ${provider.color} p-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20 backdrop-blur">
                          <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-white">
                              {provider.name}
                            </h3>
                            {isDefault && (
                              <span className="rounded-full bg-white/30 px-2 py-0.5 text-xs font-medium text-white">
                                Default
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/80">
                            {provider.description}
                          </p>
                        </div>
                      </div>
                      <a
                        href={provider.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg bg-white/20 p-2 text-white hover:bg-white/30"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    </div>
                  </div>

                  {/* Body */}
                  <div className="space-y-4 p-4">
                    {/* Features */}
                    <div className="flex flex-wrap gap-2">
                      {provider.features.map((feature) => (
                        <span
                          key={feature}
                          className={`rounded-full px-2.5 py-1 text-xs font-medium ${provider.bgColor} ${provider.textColor}`}
                        >
                          {feature}
                        </span>
                      ))}
                    </div>

                    {/* Pricing Info */}
                    <div className="rounded-lg bg-gray-50 p-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600">定价:</span>
                        <span className="text-sm font-medium text-gray-900">
                          {provider.pricing}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="text-sm text-gray-600">免费额度:</span>
                        <span className="text-sm font-medium text-green-600">
                          {provider.freeQuota}
                        </span>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="flex items-center justify-between rounded-lg bg-gray-50 p-3">
                      <span className="text-sm text-gray-600">API Key:</span>
                      {isConfigured ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
                          <CheckCircle className="h-4 w-4" />
                          已配置
                        </span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-gray-400">
                          <XCircle className="h-4 w-4" />
                          未配置
                        </span>
                      )}
                    </div>

                    {/* API Key Input */}
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type={
                            visibleApiKeys[`tts-${provider.id}`]
                              ? 'text'
                              : 'password'
                          }
                          value={ttsApiKeys[provider.id]}
                          onChange={(e) =>
                            setTtsApiKeys((prev) => ({
                              ...prev,
                              [provider.id]: e.target.value,
                            }))
                          }
                          placeholder={
                            isConfigured
                              ? '••••••••••••••••'
                              : provider.placeholder
                          }
                          className="font-mono w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            toggleApiKeyVisibility(`tts-${provider.id}`)
                          }
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                          title={
                            visibleApiKeys[`tts-${provider.id}`]
                              ? '隐藏'
                              : '显示'
                          }
                        >
                          {visibleApiKeys[`tts-${provider.id}`] ? (
                            <EyeOff className="h-4 w-4" />
                          ) : (
                            <Eye className="h-4 w-4" />
                          )}
                        </button>
                      </div>
                      <a
                        href={provider.signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-700"
                      >
                        <ExternalLink className="h-3 w-3" />
                        获取 API Key
                      </a>
                    </div>

                    {/* Test Result */}
                    {testResult && (
                      <div
                        className={`rounded-lg p-3 ${
                          testResult.success
                            ? 'bg-green-50 text-green-800'
                            : 'bg-red-50 text-red-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 text-sm">
                          {testResult.success ? (
                            <CheckCircle className="h-4 w-4" />
                          ) : (
                            <XCircle className="h-4 w-4" />
                          )}
                          {testResult.message}
                        </div>
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestTTS(provider.id)}
                        disabled={testing === `tts-${provider.id}`}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${provider.bgColor} ${provider.textColor} border-current hover:opacity-80 disabled:opacity-50`}
                      >
                        {testing === `tts-${provider.id}` ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Zap className="h-4 w-4" />
                        )}
                        测试连接
                      </button>
                      {!isDefault && (
                        <button
                          onClick={() =>
                            setTtsConfig((prev) => ({
                              ...prev,
                              provider: provider.id,
                            }))
                          }
                          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          设为默认
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSaveTTS}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存 TTS 配置
            </button>
          </div>

          {/* Info */}
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100">
                <Sparkles className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900">
                  什么是语音合成 TTS？
                </p>
                <p className="mt-1 text-xs text-gray-500">
                  TTS (Text-to-Speech) 用于将文本转换为语音。AI Studio
                  使用此功能生成音频概述。
                  <br />
                  <strong>ElevenLabs</strong> 提供高质量的 AI
                  语音，支持多种声音和情感表达。
                  <br />
                  <strong>Google Cloud TTS</strong> 支持 40+ 种语言，每月有 400
                  万字符的免费额度。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SkillsMP Tab */}
      {activeTab === 'skillsmp' && (
        <div className="space-y-6">
          {/* Global Toggle */}
          <div className="rounded-xl border border-violet-200 bg-gradient-to-r from-violet-50 to-purple-50 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg">
                  <Zap className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    SkillsMP Integration
                  </h3>
                  <p className="text-sm text-gray-600">
                    Agent Skills Marketplace - 同步 66,000+ 技能到本地
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  setSkillsmpConfig((prev) => ({
                    ...prev,
                    enabled: !prev.enabled,
                  }))
                }
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors ${
                  skillsmpConfig.enabled ? 'bg-violet-600' : 'bg-gray-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                    skillsmpConfig.enabled ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* SkillsMP Provider Card */}
          <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-2">
            <div
              className={`relative overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-all hover:shadow-md ${
                skillsmpConfig.hasApiKey
                  ? 'border-violet-500 ring-2 ring-violet-500/20'
                  : 'border-gray-200'
              }`}
            >
              {/* Header */}
              <div
                className={`bg-gradient-to-r ${SKILLSMP_PROVIDER.color} p-4`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/20">
                      <Zap className="h-5 w-5 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white">
                        {SKILLSMP_PROVIDER.name}
                      </h3>
                      <p className="text-xs text-white/80">
                        {SKILLSMP_PROVIDER.description}
                      </p>
                    </div>
                  </div>
                  {skillsmpConfig.hasApiKey && (
                    <CheckCircle className="h-5 w-5 text-white" />
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="space-y-4 p-4">
                {/* Features */}
                <div className="flex flex-wrap gap-2">
                  {SKILLSMP_PROVIDER.features.map((feature) => (
                    <span
                      key={feature}
                      className={`rounded-full px-2.5 py-1 text-xs font-medium ${SKILLSMP_PROVIDER.bgColor} ${SKILLSMP_PROVIDER.textColor}`}
                    >
                      {feature}
                    </span>
                  ))}
                </div>

                {/* Pricing */}
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className="flex items-center gap-1">
                    <Wallet className="h-3.5 w-3.5" />
                    {SKILLSMP_PROVIDER.pricing}
                  </span>
                  <span className="flex items-center gap-1">
                    <Zap className="h-3.5 w-3.5" />
                    {SKILLSMP_PROVIDER.freeQuota}
                  </span>
                </div>

                {/* API Key Input */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    API Key
                  </label>
                  <div className="relative">
                    <input
                      type={visibleApiKeys['skillsmp'] ? 'text' : 'password'}
                      value={skillsmpApiKey}
                      onChange={(e) => setSkillsmpApiKey(e.target.value)}
                      placeholder={SKILLSMP_PROVIDER.placeholder}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-20 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    />
                    <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
                      <button
                        onClick={() => toggleApiKeyVisibility('skillsmp')}
                        className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      >
                        {visibleApiKeys['skillsmp'] ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between">
                    <a
                      href={SKILLSMP_PROVIDER.signupUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-violet-600 hover:underline"
                    >
                      获取 API Key
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {skillsmpConfig.hasApiKey && (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle className="h-3.5 w-3.5" />
                        已配置
                      </span>
                    )}
                  </div>
                </div>

                {/* Sync Interval */}
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-gray-700">
                    同步频率
                  </label>
                  <select
                    value={skillsmpConfig.syncInterval}
                    onChange={(e) =>
                      setSkillsmpConfig((prev) => ({
                        ...prev,
                        syncInterval: e.target.value as
                          | 'daily'
                          | 'weekly'
                          | 'manual',
                      }))
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                  >
                    <option value="daily">每天自动同步</option>
                    <option value="weekly">每周自动同步</option>
                    <option value="manual">手动同步</option>
                  </select>
                </div>

                {/* Last Sync Info */}
                {skillsmpConfig.lastSync && (
                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                    <span className="font-medium">上次同步：</span>
                    <ClientDate
                      date={skillsmpConfig.lastSync}
                      format="datetime"
                    />
                  </div>
                )}

                {/* Test Result */}
                {testResults['skillsmp'] && (
                  <div
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-xs ${
                      testResults['skillsmp'].success
                        ? 'bg-green-50 text-green-600'
                        : 'bg-red-50 text-red-600'
                    }`}
                  >
                    {testResults['skillsmp'].success ? (
                      <CheckCircle className="h-4 w-4" />
                    ) : (
                      <XCircle className="h-4 w-4" />
                    )}
                    {testResults['skillsmp'].message}
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setTesting('skillsmp');
                      try {
                        const res = await fetch(
                          `${config.apiUrl}/admin/skillsmp-config/test`,
                          {
                            method: 'POST',
                            headers: {
                              'Content-Type': 'application/json',
                              ...getAuthHeader(),
                            },
                            body: JSON.stringify({ apiKey: skillsmpApiKey }),
                          }
                        );
                        const result = await res.json();
                        // Handle wrapped API response { success: true, data: T }
                        const data = result?.data ?? result;
                        setTestResults((prev) => ({
                          ...prev,
                          skillsmp: {
                            success: data.success,
                            message:
                              data.message ||
                              (data.success ? '连接成功' : '连接失败'),
                          },
                        }));
                      } catch {
                        setTestResults((prev) => ({
                          ...prev,
                          skillsmp: { success: false, message: '测试请求失败' },
                        }));
                      }
                      setTesting(null);
                    }}
                    disabled={testing === 'skillsmp' || !skillsmpApiKey}
                    className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${SKILLSMP_PROVIDER.bgColor} ${SKILLSMP_PROVIDER.textColor} border-current hover:opacity-80 disabled:opacity-50`}
                  >
                    {testing === 'skillsmp' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Zap className="h-4 w-4" />
                    )}
                    测试连接
                  </button>
                  <button
                    onClick={async () => {
                      setTesting('skillsmp-sync');
                      try {
                        const res = await fetch(
                          `${config.apiUrl}/admin/skillsmp-config/sync`,
                          {
                            method: 'POST',
                            headers: {
                              ...getAuthHeader(),
                            },
                          }
                        );
                        const result = await res.json();
                        // Handle wrapped API response { success: true, data: T }
                        const data = result?.data ?? result;
                        if (data.success) {
                          setSkillsmpConfig((prev) => ({
                            ...prev,
                            lastSync: new Date().toISOString(),
                          }));
                          setMessage({ type: 'success', text: '同步成功' });
                        } else {
                          setMessage({
                            type: 'error',
                            text: data.message || '同步失败',
                          });
                        }
                      } catch {
                        setMessage({ type: 'error', text: '同步请求失败' });
                      }
                      setTesting(null);
                    }}
                    disabled={
                      testing === 'skillsmp-sync' || !skillsmpConfig.hasApiKey
                    }
                    className="flex items-center gap-2 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {testing === 'skillsmp-sync' ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                    立即同步
                  </button>
                </div>
              </div>
            </div>

            {/* Info Card */}
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-100">
                  <Zap className="h-5 w-5 text-violet-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    什么是 SkillsMP？
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    <strong>SkillsMP</strong> 是 Agent Skills 市场，包含 66,000+
                    开源技能。
                    <br />
                    <br />
                    这些技能可以增强 Claude Code、Codex CLI、ChatGPT 等 AI
                    工具的能力。 所有技能都使用开放的 <strong>
                      SKILL.md
                    </strong>{' '}
                    标准。
                    <br />
                    <br />
                    配置 API Key 后，系统将自动同步最新的热门技能到{' '}
                    <strong>AI Skills</strong> 页面供浏览和使用。
                  </p>
                  <div className="mt-3 flex items-center gap-3">
                    <a
                      href="https://skillsmp.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-violet-600 hover:underline"
                    >
                      访问 SkillsMP
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    <a
                      href="https://skillsmp.com/docs/api"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-violet-600 hover:underline"
                    >
                      API 文档
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={async () => {
                setSaving(true);
                try {
                  const res = await fetch(
                    `${config.apiUrl}/admin/skillsmp-config`,
                    {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json',
                        ...getAuthHeader(),
                      },
                      body: JSON.stringify({
                        enabled: skillsmpConfig.enabled,
                        apiKey: skillsmpApiKey || undefined,
                        syncInterval: skillsmpConfig.syncInterval,
                      }),
                    }
                  );
                  if (res.ok) {
                    const result = await res.json();
                    // Handle wrapped API response { success: true, data: T }
                    const data = result?.data ?? result;
                    setSkillsmpConfig(data);
                    // Update API key input with masked value from response
                    if (data.apiKey) {
                      setSkillsmpApiKey(data.apiKey);
                    }
                    setMessage({
                      type: 'success',
                      text: 'SkillsMP 配置已保存',
                    });
                  } else {
                    setMessage({ type: 'error', text: '保存失败' });
                  }
                } catch {
                  setMessage({ type: 'error', text: '保存请求失败' });
                }
                setSaving(false);
              }}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-purple-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-violet-500/20 hover:from-violet-700 hover:to-purple-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存 SkillsMP 配置
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
