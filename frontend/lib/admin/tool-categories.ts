/**
 * Tool Categories —— 工具/能力分类共享真源
 *
 * 2026-05-11 W3r4：恢复昨天 (commit ddaeb49e7~1) capability-mapping.ts 的
 *   13 类分类 + 中文 label + 颜色主题，作为两个 tab 共享真源：
 *   - 内置工具 tab (BuiltinToolsTable): implemented:true
 *   - API 服务工具 tab (APIServicesTable): implemented:false
 *
 * 设计要点：
 *   - tool toolId → category 反向索引由各 category 的 toolIds 列表派生
 *   - toolIds 列表必须含所有变体（backend BaseTool id + DB seed provider id），
 *     如 'arxiv' (provider) 和 'arxiv-search' (BaseTool) 同属 academic
 *   - industry-report / industry-report-search 不归任何 category（专属第三方信源 tab）
 *   - 未命中走 'other' 桶 + 灰色主题
 */

export interface ToolCategoryTheme {
  border: string;
  headerBg: string;
  headerText: string;
  badge: string;
}

export interface ToolCategoryDef {
  id: string;
  label: string; // 中文 label（与昨天 capability-mapping 对齐）
  order: number;
  toolIds: string[]; // 归属此 category 的所有 toolId 变体
  theme: ToolCategoryTheme;
}

/**
 * 13 类工具分类，顺序对齐昨天 CATEGORY_CONFIG。
 * 每类颜色主题独立，仿 MCP 工具市场的彩色卡片风格。
 */
export const TOOL_CATEGORIES: ToolCategoryDef[] = [
  {
    id: 'search',
    label: '搜索',
    order: 1,
    toolIds: [
      // capabilities
      'web-search',
      'hackernews-search',
      // providers (DB rows)
      'tavily',
      'perplexity',
      'serper',
      'duckduckgo',
      'brave-search',
      'hackernews',
    ],
    theme: {
      border: 'border-blue-200',
      headerBg: 'bg-blue-50',
      headerText: 'text-blue-800',
      badge: 'bg-blue-100 text-blue-700',
    },
  },
  {
    id: 'academic',
    label: '学术研究',
    order: 2,
    toolIds: [
      'arxiv',
      'arxiv-search',
      'semantic-scholar',
      'pubmed',
      'openalex',
      'openalex-search',
    ],
    theme: {
      border: 'border-purple-200',
      headerBg: 'bg-purple-50',
      headerText: 'text-purple-800',
      badge: 'bg-purple-100 text-purple-700',
    },
  },
  {
    id: 'extraction',
    label: '内容提取',
    order: 3,
    toolIds: [
      'web-scraper',
      'youtube-transcript',
      // providers
      'jina',
      'firecrawl',
      'tavilyExtract',
      'tavily-extract',
      'supadata',
    ],
    theme: {
      border: 'border-emerald-200',
      headerBg: 'bg-emerald-50',
      headerText: 'text-emerald-800',
      badge: 'bg-emerald-100 text-emerald-700',
    },
  },
  {
    id: 'generation',
    label: '内容生成',
    order: 4,
    toolIds: [
      'audio-generation',
      'video-generation',
      'image-generation',
      'text-generation',
      'code-generation',
      'structured-output',
      // providers
      'elevenlabs',
      'googleTts',
      'google-tts',
    ],
    theme: {
      border: 'border-indigo-200',
      headerBg: 'bg-indigo-50',
      headerText: 'text-indigo-800',
      badge: 'bg-indigo-100 text-indigo-700',
    },
  },
  {
    id: 'processing',
    label: '数据处理',
    order: 5,
    toolIds: [
      'file-parser',
      'document-diff',
      'file-conversion',
      'template-render',
      'data-validation',
      'data-cleaning',
      'data-analysis',
    ],
    theme: {
      border: 'border-teal-200',
      headerBg: 'bg-teal-50',
      headerText: 'text-teal-800',
      badge: 'bg-teal-100 text-teal-700',
    },
  },
  {
    id: 'execution',
    label: '执行环境',
    order: 6,
    toolIds: ['sql-executor', 'container-executor', 'ocr-recognition'],
    theme: {
      border: 'border-orange-200',
      headerBg: 'bg-orange-50',
      headerText: 'text-orange-800',
      badge: 'bg-orange-100 text-orange-700',
    },
  },
  {
    id: 'collaboration',
    label: '协作编排',
    order: 7,
    toolIds: [
      'consensus-mechanism',
      'agent-handoff',
      'agent-communication',
      'task-delegation',
      'workflow-orchestration',
      'human-approval',
    ],
    theme: {
      border: 'border-violet-200',
      headerBg: 'bg-violet-50',
      headerText: 'text-violet-800',
      badge: 'bg-violet-100 text-violet-700',
    },
  },
  {
    id: 'integration',
    label: '外部集成',
    order: 8,
    toolIds: [
      'email-sender',
      'github-integration',
      'cloud-storage',
      'message-push',
      'webhook-trigger',
      'calendar-integration',
    ],
    theme: {
      border: 'border-slate-200',
      headerBg: 'bg-slate-50',
      headerText: 'text-slate-800',
      badge: 'bg-slate-100 text-slate-700',
    },
  },
  {
    id: 'export',
    label: '文档导出',
    order: 9,
    toolIds: ['export-docx', 'export-pdf', 'export-image', 'export-pptx'],
    theme: {
      border: 'border-stone-200',
      headerBg: 'bg-stone-50',
      headerText: 'text-stone-800',
      badge: 'bg-stone-100 text-stone-700',
    },
  },
  {
    id: 'finance',
    label: '金融数据',
    order: 10,
    toolIds: ['finance-api', 'alpha-vantage'],
    theme: {
      border: 'border-amber-200',
      headerBg: 'bg-amber-50',
      headerText: 'text-amber-800',
      badge: 'bg-amber-100 text-amber-700',
    },
  },
  {
    id: 'weather',
    label: '天气数据',
    order: 11,
    toolIds: ['weather-api', 'openweathermap'],
    theme: {
      border: 'border-sky-200',
      headerBg: 'bg-sky-50',
      headerText: 'text-sky-800',
      badge: 'bg-sky-100 text-sky-700',
    },
  },
  {
    id: 'image-search',
    label: '图像搜索',
    order: 12,
    toolIds: [
      'image-search',
      'serpapi-image-search',
      'bing-image-search',
      'google-image-search',
      'serpapi',
    ],
    theme: {
      border: 'border-pink-200',
      headerBg: 'bg-pink-50',
      headerText: 'text-pink-800',
      badge: 'bg-pink-100 text-pink-700',
    },
  },
  {
    id: 'policy',
    label: '政策研究',
    order: 13,
    toolIds: ['federal-register', 'congress-gov', 'whitehouse-news'],
    theme: {
      border: 'border-rose-200',
      headerBg: 'bg-rose-50',
      headerText: 'text-rose-800',
      badge: 'bg-rose-100 text-rose-700',
    },
  },
  {
    id: 'devtools',
    label: '开发工具',
    order: 14,
    toolIds: ['github-search', 'github', 'gitlab'],
    theme: {
      border: 'border-gray-300',
      headerBg: 'bg-gray-100',
      headerText: 'text-gray-800',
      badge: 'bg-gray-200 text-gray-700',
    },
  },
  {
    id: 'jobs',
    label: '招聘信息',
    order: 15,
    toolIds: ['job-search'],
    theme: {
      border: 'border-cyan-200',
      headerBg: 'bg-cyan-50',
      headerText: 'text-cyan-800',
      badge: 'bg-cyan-100 text-cyan-700',
    },
  },
];

/**
 * "其他" 桶——未命中以上 14 类的 fallback。
 */
export const OTHER_CATEGORY: ToolCategoryDef = {
  id: 'other',
  label: '其他',
  order: 999,
  toolIds: [],
  theme: {
    border: 'border-gray-200',
    headerBg: 'bg-gray-50',
    headerText: 'text-gray-700',
    badge: 'bg-gray-100 text-gray-600',
  },
};

/**
 * 第三方信源 tab 专属——不应在内置/API 服务工具 tab 出现的 toolId。
 *
 * industry-report 是抓取源能力，UI 在 admin/tools 第三方信源 tab 直接管理
 * config.sources，不需要在另两个 tab 重复露出。
 */
export const EXCLUDED_FROM_GENERAL_TABS = new Set<string>([
  'industry-report',
  'industry-report-search',
]);

/**
 * toolId → category 反向索引，启动时构建一次。
 */
const TOOL_ID_TO_CATEGORY: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const cat of TOOL_CATEGORIES) {
    for (const id of cat.toolIds) {
      map.set(id.toLowerCase(), cat.id);
    }
  }
  return map;
})();

/**
 * 把任意 toolId 分到 14 类之一或 'other'。
 *
 * @param toolId tool 唯一 id（不区分大小写）
 * @param fallbackBackendCategory tool 的 backend `category` 字段，作为兜底
 *   关键字匹配（如 'search' / 'extraction'）。仍未命中走 'other'。
 */
export function classifyToolId(
  toolId: string,
  fallbackBackendCategory?: string | null
): string {
  const direct = TOOL_ID_TO_CATEGORY.get(toolId.toLowerCase());
  if (direct) return direct;
  if (fallbackBackendCategory) {
    const cat = fallbackBackendCategory.toLowerCase();
    // 直接按 category id 命中
    if (TOOL_CATEGORIES.some((c) => c.id === cat)) return cat;
  }
  return 'other';
}

export function getCategoryById(id: string): ToolCategoryDef {
  return TOOL_CATEGORIES.find((c) => c.id === id) ?? OTHER_CATEGORY;
}

/**
 * 用于 UI <select> 的 options 列表，含"其他"。
 */
export const CATEGORY_FILTER_OPTIONS = [
  ...TOOL_CATEGORIES.map((c) => ({ value: c.id, label: c.label })),
  { value: OTHER_CATEGORY.id, label: OTHER_CATEGORY.label },
];

export const CATEGORY_ORDER_KEYS = [
  ...TOOL_CATEGORIES.map((c) => c.id),
  OTHER_CATEGORY.id,
];
