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
} from 'lucide-react';

interface SearchConfig {
  provider: string;
  enabled: boolean;
  perplexity: { apiKey: string | null; hasApiKey: boolean };
  tavily: { apiKey: string | null; hasApiKey: boolean };
  serper: { apiKey: string | null; hasApiKey: boolean };
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
      headers: '{"User-Agent": "DeepDive Research support@example.com"}',
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
  });
  const [searchApiKeys, setSearchApiKeys] = useState<Record<string, string>>({
    perplexity: '',
    tavily: '',
    serper: '',
  });

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
    'search' | 'extraction' | 'simulation' | 'youtube'
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
      const [searchRes, extractionRes, providersRes, youtubeRes] =
        await Promise.all([
          fetch(`${config.apiUrl}/admin/search-config`, {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }),
          fetch(`${config.apiUrl}/admin/extraction-config`, {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }),
          fetch(`${config.apiUrl}/admin/external-providers`, {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }),
          fetch(`${config.apiUrl}/admin/youtube-config`, {
            headers: { ...getAuthHeader() },
            credentials: 'include',
          }),
        ]);

      if (searchRes.ok) {
        const data = await searchRes.json();
        setSearchConfig(data);
      }

      if (extractionRes.ok) {
        const data = await extractionRes.json();
        setExtractionConfig(data);
      }

      if (youtubeRes.ok) {
        const data = await youtubeRes.json();
        setYoutubeConfig(data);
      }

      if (providersRes.ok) {
        const providers = await providersRes.json();
        console.log('[ExternalAPI] Loaded providers from backend:', providers);

        // Group providers by category - ONLY include providers with valid data
        if (Array.isArray(providers) && providers.length > 0) {
          const categorized = DEFAULT_SIMULATION_API_CATEGORIES.map((cat) => {
            const categoryProviders = providers
              .filter((p: any) => {
                // Filter by category
                if (p.category !== cat.id) return false;

                // CRITICAL: Only include providers with actual configuration
                // Must have name AND (baseUrl OR apiKey)
                const hasName = p.name?.trim();
                const hasBaseUrl = p.baseUrl?.trim();
                const hasApiKey = !!p.apiKey?.trim();

                const isValid = hasName && (hasBaseUrl || hasApiKey);

                if (!isValid) {
                  console.warn(
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
              .map((p: any) => ({
                id: p.id.replace(`${cat.id}-`, ''),
                name: p.name,
                baseUrl: p.baseUrl || '',
                apiKey: p.apiKey || '', // Show full API key (admin only page)
                headers: p.headers || '',
                enabled: p.enabled ?? false,
                isDefault: p.isDefault ?? false,
              }));

            console.log(
              `[ExternalAPI] Category ${cat.id} has ${categoryProviders.length} valid providers`
            );

            return {
              ...cat,
              providers: categoryProviders,
            };
          });
          console.log('[ExternalAPI] Final categorized:', categorized);
          setSimulationAPICategories(categorized);
        } else {
          console.log(
            '[ExternalAPI] No providers saved, using default empty state'
          );
          // No saved providers - keep default empty state
          setSimulationAPICategories(DEFAULT_SIMULATION_API_CATEGORIES);
        }
      }
    } catch (err) {
      console.error('Failed to load configs:', err);
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

    try {
      const res = await fetch(`${config.apiUrl}/admin/search-config`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          provider: searchConfig.provider,
          enabled: searchConfig.enabled,
          perplexityApiKey: searchApiKeys.perplexity || undefined,
          tavilyApiKey: searchApiKeys.tavily || undefined,
          serperApiKey: searchApiKeys.serper || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSearchConfig(data);
        setSearchApiKeys({ perplexity: '', tavily: '', serper: '' });
        setMessage({ type: 'success', text: '搜索配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      console.error('Failed to save search config:', err);
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
        credentials: 'include',
        body: JSON.stringify({
          enabled: extractionConfig.enabled,
          jinaApiKey: extractionApiKeys.jina || undefined,
          firecrawlApiKey: extractionApiKeys.firecrawl || undefined,
          tavilyApiKey: extractionApiKeys.tavily || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setExtractionConfig(data);
        setExtractionApiKeys({ jina: '', firecrawl: '', tavily: '' });
        setMessage({ type: 'success', text: '内容提取配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      console.error('Failed to save extraction config:', err);
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
        credentials: 'include',
        body: JSON.stringify({
          enabled: youtubeConfig.enabled,
          provider: youtubeConfig.provider,
          supadataApiKey: youtubeApiKeys.supadata || undefined,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setYoutubeConfig(data);
        setYoutubeApiKeys({ supadata: '' });
        setMessage({ type: 'success', text: 'YouTube 字幕配置保存成功' });
        setTimeout(() => setMessage(null), 3000);
      } else {
        setMessage({ type: 'error', text: '保存配置失败' });
      }
    } catch (err) {
      console.error('Failed to save YouTube config:', err);
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
        credentials: 'include',
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [`youtube-${providerId}`]: data,
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [`youtube-${providerId}`]: {
          success: false,
          message: err.message || '测试失败',
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
          credentials: 'include',
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
      console.error('Test provider failed:', err);
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
      const allProviders: any[] = [];
      simulationAPICategories.forEach((category) => {
        console.log(
          `[Save] Processing category ${category.id} with ${category.providers.length} providers`
        );

        category.providers.forEach((provider) => {
          // Only save provider if it has a name AND (baseUrl OR apiKey)
          const hasApiKey = !!provider.apiKey?.trim();
          const hasValidData =
            provider.name?.trim() && (provider.baseUrl?.trim() || hasApiKey);

          console.log(
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
              apiKey: provider.apiKey?.trim() || undefined,
              isDefault: provider.isDefault,
            };
            console.log('[Save] Adding provider:', providerToSave);
            allProviders.push(providerToSave);
          }
        });
      });

      console.log(
        `[Save] Total providers to save: ${allProviders.length}`,
        allProviders
      );

      const res = await fetch(`${config.apiUrl}/admin/external-providers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
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
      console.error('Failed to save Simulation APIs config:', err);
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
        credentials: 'include',
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const data = await res.json();
      setTestResults((prev) => ({ ...prev, [providerId]: data }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [providerId]: { success: false, message: err.message || '测试失败' },
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
        credentials: 'include',
        body: JSON.stringify({ provider: providerId, apiKey }),
      });

      const data = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [`extraction-${providerId}`]: data,
      }));
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [`extraction-${providerId}`]: {
          success: false,
          message: err.message || '测试失败',
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
          credentials: 'include',
        }
      );

      if (res.ok) {
        const data = await res.json();
        setBalances((prev) => ({ ...prev, [key]: data }));
      }
    } catch (err) {
      console.error('Failed to check balance:', err);
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

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setActiveTab('search')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'search'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Search className="h-4 w-4" />
          搜索 API
        </button>
        <button
          onClick={() => setActiveTab('extraction')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'extraction'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <FileText className="h-4 w-4" />
          内容提取 API
        </button>
        <button
          onClick={() => setActiveTab('simulation')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'simulation'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <TrendingUp className="h-4 w-4" />
          推演数据源 API
        </button>
        <button
          onClick={() => setActiveTab('youtube')}
          className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
            activeTab === 'youtube'
              ? 'border-purple-600 text-purple-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Youtube className="h-4 w-4" />
          YouTube 字幕 API
        </button>
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
                    {renderBalanceInfo('search', provider.id)}

                    {/* API Key Input */}
                    <div className="space-y-2">
                      <div className="relative">
                        <input
                          type={
                            visibleApiKeys[`search-${provider.id}`]
                              ? 'text'
                              : 'password'
                          }
                          value={searchApiKeys[provider.id]}
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
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 font-mono text-sm focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500"
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
                          (!searchApiKeys[provider.id] && !isConfigured)
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
                            isConfigured
                              ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                              : 'cursor-not-allowed bg-gray-100 text-gray-400'
                          }`}
                          disabled={!isConfigured}
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
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 font-mono text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
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

      {/* Simulation APIs Tab - Card-Based Design */}
      {activeTab === 'simulation' && (
        <div className="space-y-6">
          <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
                  <TrendingUp className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">
                    推演数据源 API
                  </h3>
                  <p className="text-sm text-gray-600">
                    为 AI Simulation 配置真实数据源，支持多 Provider
                    并设置默认值
                  </p>
                  <p className="mt-1 text-xs text-indigo-600">
                    每个类别可配置多个 Provider，设置默认
                    Provider，默认不可用时自动切换备用
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Category Cards */}
          <div className="grid gap-6 md:grid-cols-2">
            {simulationAPICategories.map((category) => (
              <div
                key={category.id}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <div className="mb-4 flex items-start gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-${category.gradientFrom} to-${category.gradientTo} text-white`}
                  >
                    {category.id === 'market' && (
                      <TrendingUp className="h-5 w-5" />
                    )}
                    {category.id === 'finance' && (
                      <Wallet className="h-5 w-5" />
                    )}
                    {category.id === 'news' && <Sparkles className="h-5 w-5" />}
                    {category.id === 'regulation' && (
                      <AlertTriangle className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">
                      {category.name}
                    </h4>
                    <p className="text-xs text-gray-600">{category.nameZh}</p>
                    <p className="mt-1 text-xs text-gray-500">
                      {category.description}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  {/* Only show provider cards if they exist */}
                  {category.providers.length > 0 &&
                    category.providers.map((provider) => (
                      <div
                        key={provider.id}
                        className="rounded-lg border border-gray-100 bg-gray-50 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <input
                            type="text"
                            value={provider.name}
                            onChange={(e) =>
                              updateSimulationAPIProvider(
                                category.id,
                                provider.id,
                                {
                                  name: e.target.value,
                                }
                              )
                            }
                            className="flex-1 rounded border-0 bg-transparent text-sm font-medium text-gray-700 focus:outline-none focus:ring-0"
                            placeholder="Provider 名称"
                          />
                          <div className="flex gap-2">
                            {provider.isDefault && (
                              <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                                默认
                              </span>
                            )}
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                provider.enabled && provider.baseUrl
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {provider.enabled && provider.baseUrl
                                ? '已配置'
                                : '未配置'}
                            </span>
                            <button
                              onClick={() =>
                                removeSimulationAPIProvider(
                                  category.id,
                                  provider.id
                                )
                              }
                              className="text-red-500 hover:text-red-700"
                              title="删除"
                            >
                              ×
                            </button>
                          </div>
                        </div>
                        <input
                          type="text"
                          value={provider.baseUrl}
                          onChange={(e) =>
                            updateSimulationAPIProvider(
                              category.id,
                              provider.id,
                              {
                                baseUrl: e.target.value,
                              }
                            )
                          }
                          placeholder="Base URL (https://api.example.com)"
                          className="mb-2 w-full rounded-md border border-gray-200 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="mb-2">
                          <div className="relative">
                            <input
                              type={
                                visibleApiKeys[
                                  `sim-${category.id}-${provider.id}`
                                ]
                                  ? 'text'
                                  : 'password'
                              }
                              value={provider.apiKey}
                              onChange={(e) =>
                                updateSimulationAPIProvider(
                                  category.id,
                                  provider.id,
                                  {
                                    apiKey: e.target.value,
                                  }
                                )
                              }
                              placeholder="API Key"
                              className="w-full rounded-md border border-gray-200 px-3 py-1.5 pr-10 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                toggleApiKeyVisibility(
                                  `sim-${category.id}-${provider.id}`
                                )
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                              title={
                                visibleApiKeys[
                                  `sim-${category.id}-${provider.id}`
                                ]
                                  ? '隐藏'
                                  : '显示'
                              }
                            >
                              {visibleApiKeys[
                                `sim-${category.id}-${provider.id}`
                              ] ? (
                                <EyeOff className="h-4 w-4" />
                              ) : (
                                <Eye className="h-4 w-4" />
                              )}
                            </button>
                          </div>
                          {/* 显示获取API Key的链接 */}
                          {API_TEMPLATES[category.id]?.find(
                            (t) => t.name === provider.name
                          ) && (
                            <div className="mt-1 flex items-center gap-2 text-xs">
                              <a
                                href={
                                  API_TEMPLATES[category.id].find(
                                    (t) => t.name === provider.name
                                  )?.apiKeyUrl
                                }
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-indigo-600 hover:text-indigo-800 hover:underline"
                              >
                                → 获取 API Key
                              </a>
                              <span className="text-green-600">
                                {
                                  API_TEMPLATES[category.id].find(
                                    (t) => t.name === provider.name
                                  )?.freeQuota
                                }
                              </span>
                            </div>
                          )}
                        </div>
                        <textarea
                          value={provider.headers || ''}
                          onChange={(e) =>
                            updateSimulationAPIProvider(
                              category.id,
                              provider.id,
                              {
                                headers: e.target.value,
                              }
                            )
                          }
                          placeholder='Headers (JSON): {"X-API-KEY": "..."}'
                          rows={2}
                          className="mb-2 w-full rounded-md border border-gray-200 px-3 py-1.5 font-mono text-xs focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 text-xs text-gray-600">
                            <input
                              type="checkbox"
                              checked={provider.enabled}
                              onChange={(e) =>
                                updateSimulationAPIProvider(
                                  category.id,
                                  provider.id,
                                  {
                                    enabled: e.target.checked,
                                  }
                                )
                              }
                              className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            启用
                          </label>
                          <div className="flex gap-2">
                            <button
                              onClick={() =>
                                testSimulationAPIProvider(category.id, provider)
                              }
                              disabled={
                                testing === `${category.id}-${provider.id}`
                              }
                              className="text-xs text-blue-600 hover:text-blue-700 disabled:opacity-50"
                              title="测试此 Provider"
                            >
                              {testing === `${category.id}-${provider.id}`
                                ? '测试中...'
                                : '🔧 测试'}
                            </button>
                            {!provider.isDefault && (
                              <button
                                onClick={() =>
                                  updateSimulationAPIProvider(
                                    category.id,
                                    provider.id,
                                    {
                                      isDefault: true,
                                    }
                                  )
                                }
                                className="text-xs text-indigo-600 hover:text-indigo-700"
                              >
                                设为默认
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Test Result - Show inline like AI Models */}
                        {testResults[`${category.id}-${provider.id}`] && (
                          <div
                            className={`mt-2 rounded border px-2 py-1 text-xs ${
                              testResults[`${category.id}-${provider.id}`]
                                .success
                                ? 'border-green-200 bg-green-50 text-green-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                            }`}
                          >
                            {testResults[`${category.id}-${provider.id}`]
                              .success
                              ? '✅ '
                              : '❌ '}
                            {
                              testResults[`${category.id}-${provider.id}`]
                                .message
                            }
                          </div>
                        )}
                      </div>
                    ))}

                  {/* 推荐API模板 - 即使有provider也显示 */}
                  <div className="rounded-lg border border-indigo-100 bg-indigo-50/50 p-3">
                    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-700">
                      <Sparkles className="h-3.5 w-3.5" />
                      推荐数据源（点击快速添加）
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {API_TEMPLATES[category.id]?.map((template) => {
                        const isAlreadyAdded = category.providers.some(
                          (p) => p.name === template.name
                        );
                        return (
                          <button
                            key={template.name}
                            onClick={() =>
                              !isAlreadyAdded &&
                              addProviderFromTemplate(category.id, template)
                            }
                            disabled={isAlreadyAdded}
                            className={`group relative rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                              isAlreadyAdded
                                ? 'cursor-not-allowed border-gray-200 bg-gray-100 text-gray-400'
                                : 'border-indigo-200 bg-white text-indigo-700 hover:border-indigo-400 hover:bg-indigo-100'
                            }`}
                            title={template.description}
                          >
                            {isAlreadyAdded ? '✓ ' : '+ '}
                            {template.name}
                            {template.freeQuota && !isAlreadyAdded && (
                              <span className="ml-1 text-green-600">
                                ({template.freeQuota.split('：')[0]})
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Empty state message if no providers */}
                  {category.providers.length === 0 && (
                    <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-amber-800">
                        <AlertTriangle className="h-4 w-4" />
                        尚未配置数据源
                      </div>
                      <p className="text-xs text-amber-700">
                        请点击上方推荐数据源快速添加，或手动添加自定义
                        Provider。
                        推演时如无可用数据源，将以"数据不足"模式继续。
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => addSimulationAPIProvider(category.id)}
                    className="w-full rounded-lg border-2 border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                  >
                    + 手动添加 Provider
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={() => void handleSaveSimulationAPIs()}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/20 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              保存推演数据源配置
            </button>
          </div>
        </div>
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
                          className="w-full rounded-lg border border-gray-300 px-3 py-2 pr-10 font-mono text-sm focus:border-red-500 focus:outline-none focus:ring-1 focus:ring-red-500"
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
    </div>
  );
}
