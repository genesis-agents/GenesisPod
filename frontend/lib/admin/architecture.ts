/**
 * Admin Architecture Diagram Configuration
 *
 * Six-layer architecture visualization:
 * Layer 6: Agent Intent Gateway (Entry, Intent Routing, Traces)
 * Layer 5: External Agent Access (Open Interfaces)
 * Layer 4: Agent Apps (Business Applications - Read-only)
 * Layer 3: Agent Runtime (Process, Memory, IPC, Resources)
 * Layer 2: Agent Engine (Core Capabilities)
 * Layer 1: Infrastructure (Foundation)
 */

import {
  Bot,
  UsersRound,
  Wrench,
  Shield,
  Sparkles,
  Users,
  Key,
  HardDrive,
  MessageSquare,
  Compass,
  BookOpen,
  PenTool,
  FileSearch,
  FileText,
  Brain,
  Hammer,
  Lightbulb,
  Settings,
  Layers,
  Coins,
  CreditCard,
  Bell,
  ScrollText,
  Activity,
  Radio,
  Webhook,
  Share2,
  TrendingUp,
  Cpu,
  Clock,
  Database,
  GitBranch,
  Gauge,
  type LucideIcon,
} from 'lucide-react';

// Stat item shown on a card
export interface CardStat {
  label: string; // e.g. '资源', '研究任务'
  key: string; // key in the flat overview-stats response
}

// Architecture card type
export interface ArchitectureCard {
  id: string;
  i18nKey: string; // i18n key for the label
  descriptionKey?: string; // i18n key for description
  href?: string; // Route for clickable cards
  icon: LucideIcon;
  clickable: boolean;
  stats?: CardStat[]; // Optional stats to display on the card
}

// Card group for AI Apps layer
export interface CardGroup {
  id: string;
  titleKey: string;
  cards: ArchitectureCard[];
}

// Architecture layer type
export interface ArchitectureLayer {
  id: string;
  titleKey: string; // i18n key for layer title
  subtitleKey?: string; // i18n key for subtitle
  level: 1 | 2 | 3 | 4 | 5 | 6; // Layer level for styling
  cards?: ArchitectureCard[];
  groups?: CardGroup[]; // For grouped cards (AI Apps layer)
}

// Layer 6: Agent Intent Gateway (Entry, Intent Routing, Traces)
const agentOsLayer: ArchitectureLayer = {
  id: 'agentOs',
  titleKey: 'admin.architecture.layers.agentOs',
  subtitleKey: 'admin.architecture.layers.agentOsDesc',
  level: 6,
  cards: [
    {
      id: 'aiAskEntry',
      i18nKey: 'nav.aiAsk',
      descriptionKey: 'admin.architecture.cards.aiAskEntryDesc',
      icon: MessageSquare,
      clickable: false,
      stats: [{ label: '会话', key: 'askSessions' }],
    },
    {
      id: 'traces',
      i18nKey: 'admin.nav.traces',
      descriptionKey: 'admin.architecture.cards.tracesDesc',
      href: '/admin/ai/traces',
      icon: Activity,
      clickable: true,
      stats: [{ label: '追踪', key: 'agentTraces' }],
    },
    {
      id: 'intentRouter',
      i18nKey: 'admin.architecture.cards.intentRouter',
      descriptionKey: 'admin.architecture.cards.intentRouterDesc',
      icon: TrendingUp,
      clickable: false,
      stats: [{ label: '追踪', key: 'agentTraces' }],
    },
  ],
};

// Layer 5: External Agent Access
const openApiLayer: ArchitectureLayer = {
  id: 'openApi',
  titleKey: 'admin.architecture.layers.openApi',
  subtitleKey: 'admin.architecture.layers.openApiDesc',
  level: 5,
  cards: [
    {
      id: 'mcpServer',
      i18nKey: 'admin.nav.mcpServer',
      descriptionKey: 'admin.architecture.cards.mcpServerDesc',
      href: '/admin/system/mcp-server',
      icon: Radio,
      clickable: true,
      stats: [{ label: '已注册工具', key: 'mcpRegisteredTools' }],
    },
    {
      id: 'webhooks',
      i18nKey: 'admin.architecture.cards.webhooks',
      descriptionKey: 'admin.architecture.cards.webhooksDesc',
      icon: Webhook,
      clickable: false,
      stats: [{ label: '订阅', key: 'webhookSubscriptions' }],
    },
  ],
};

// Layer 4: Agent Apps (Business Applications - Read-only from main sidebar)
const aiAppsLayer: ArchitectureLayer = {
  id: 'aiApps',
  titleKey: 'admin.architecture.layers.aiApps',
  subtitleKey: 'admin.architecture.layers.aiAppsDesc',
  level: 4,
  groups: [
    {
      id: 'knowledge',
      titleKey: 'nav.sections.materialsKnowledge',
      cards: [
        {
          id: 'aiExplore',
          i18nKey: 'nav.aiExplore',
          descriptionKey: 'admin.tabDescriptions.collection',
          href: '/admin/data/collection',
          icon: Compass,
          clickable: true,
          stats: [{ label: '资源', key: 'resources' }],
        },
        {
          id: 'myLibrary',
          i18nKey: 'nav.myLibrary',
          icon: BookOpen,
          clickable: false,
          stats: [{ label: '收藏', key: 'bookmarkedResources' }],
        },
        {
          id: 'ragKnowledge',
          i18nKey: 'admin.architecture.cards.ragKnowledge',
          descriptionKey: 'admin.architecture.cards.ragKnowledgeDesc',
          href: '/library/rag',
          icon: Brain,
          clickable: true,
          stats: [{ label: '知识库', key: 'knowledgeBases' }],
        },
      ],
    },
    {
      id: 'researchAnalysisGroup',
      titleKey: 'nav.sections.researchAnalysis',
      cards: [
        {
          id: 'aiInsights',
          i18nKey: 'nav.aiInsights',
          icon: Lightbulb,
          clickable: false,
          stats: [{ label: '主题', key: 'topics' }],
        },
        {
          id: 'aiResearch',
          i18nKey: 'nav.aiResearch',
          icon: FileSearch,
          clickable: false,
          stats: [{ label: '研究', key: 'researchMissions' }],
        },
        {
          id: 'aiReports',
          i18nKey: 'nav.aiReports',
          icon: FileText,
          clickable: false,
          stats: [{ label: '文档', key: 'officeDocuments' }],
        },
      ],
    },
    {
      id: 'planningDecisionGroup',
      titleKey: 'nav.sections.planningDecision',
      cards: [
        {
          id: 'myTeams',
          i18nKey: 'nav.myTeams',
          icon: UsersRound,
          clickable: false,
          stats: [
            { label: '话题', key: 'topics' },
            { label: '辩论', key: 'debateSessions' },
          ],
        },
        {
          id: 'aiPlanning',
          i18nKey: 'nav.aiPlanning',
          icon: Hammer,
          clickable: false,
          stats: [{ label: '方案', key: 'researchMissions' }],
        },
        {
          id: 'aiSimulation',
          i18nKey: 'nav.aiSimulation',
          icon: Brain,
          clickable: false,
          stats: [
            { label: '场景', key: 'simScenarios' },
            { label: '推演', key: 'simRuns' },
          ],
        },
      ],
    },
    {
      id: 'creativeWritingGroup',
      titleKey: 'nav.sections.creativeWriting',
      cards: [
        {
          id: 'aiWriting',
          i18nKey: 'nav.aiWriting',
          icon: PenTool,
          clickable: false,
          stats: [{ label: '项目', key: 'writingProjects' }],
        },
        {
          id: 'aiSocial',
          i18nKey: 'nav.aiSocial',
          icon: Share2,
          clickable: false,
          stats: [{ label: '内容', key: 'socialContent' }],
        },
      ],
    },
    {
      id: 'toolStoreGroup',
      titleKey: 'nav.sections.toolStore',
      cards: [
        {
          id: 'aiStore',
          i18nKey: 'nav.aiStore',
          icon: Lightbulb,
          clickable: false,
          stats: [
            { label: '工具', key: 'tools' },
            { label: '技能', key: 'skills' },
          ],
        },
        {
          id: 'feedback',
          i18nKey: 'admin.nav.feedback',
          href: '/admin/feedback',
          icon: MessageSquare,
          clickable: true,
          stats: [{ label: '反馈', key: 'feedbackCount' }],
        },
      ],
    },
  ],
};

// Layer 3: Agent Runtime (Process, Memory, IPC, Resources)
const aiKernelLayer: ArchitectureLayer = {
  id: 'aiKernel',
  titleKey: 'admin.architecture.layers.aiKernel',
  subtitleKey: 'admin.architecture.layers.aiKernelDesc',
  level: 3,
  cards: [
    {
      id: 'kernelProcesses',
      i18nKey: 'admin.architecture.cards.kernelProcesses',
      descriptionKey: 'admin.architecture.cards.kernelProcessesDesc',
      href: '/admin/kernel/processes',
      icon: Cpu,
      clickable: true,
      stats: [{ label: '进程', key: 'kernelProcesses' }],
    },
    {
      id: 'kernelJournal',
      i18nKey: 'admin.architecture.cards.kernelJournal',
      descriptionKey: 'admin.architecture.cards.kernelJournalDesc',
      href: '/admin/kernel/journal',
      icon: ScrollText,
      clickable: true,
      stats: [{ label: '事件', key: 'kernelEvents' }],
    },
    {
      id: 'kernelMemory',
      i18nKey: 'admin.architecture.cards.kernelMemory',
      descriptionKey: 'admin.architecture.cards.kernelMemoryDesc',
      href: '/admin/kernel/memory',
      icon: Database,
      clickable: true,
      stats: [{ label: '条目', key: 'kernelMemories' }],
    },
    {
      id: 'kernelIPC',
      i18nKey: 'admin.architecture.cards.kernelIPC',
      descriptionKey: 'admin.architecture.cards.kernelIPCDesc',
      href: '/admin/kernel/ipc',
      icon: GitBranch,
      clickable: true,
      stats: [{ label: '订阅', key: 'kernelSubscriptions' }],
    },
    {
      id: 'kernelResources',
      i18nKey: 'admin.architecture.cards.kernelResources',
      descriptionKey: 'admin.architecture.cards.kernelResourcesDesc',
      href: '/admin/kernel/resources',
      icon: Gauge,
      clickable: true,
      stats: [{ label: '熔断器', key: 'kernelBreakers' }],
    },
    {
      id: 'kernelObservability',
      i18nKey: 'admin.architecture.cards.kernelObservability',
      descriptionKey: 'admin.architecture.cards.kernelObservabilityDesc',
      href: '/admin/kernel/observability',
      icon: Activity,
      clickable: true,
      stats: [{ label: 'LLM调用', key: 'kernelLLMCalls' }],
    },
    {
      id: 'kernelSecurity',
      i18nKey: 'admin.architecture.cards.kernelSecurity',
      descriptionKey: 'admin.architecture.cards.kernelSecurityDesc',
      href: '/admin/kernel/security',
      icon: Shield,
      clickable: true,
      stats: [{ label: '受控进程', key: 'kernelProcesses' }],
    },
    {
      id: 'kernelScheduler',
      i18nKey: 'admin.architecture.cards.kernelScheduler',
      descriptionKey: 'admin.architecture.cards.kernelSchedulerDesc',
      href: '/admin/kernel/scheduler',
      icon: Clock,
      clickable: true,
      stats: [{ label: '运行中', key: 'kernelRunning' }],
    },
  ],
};

// Layer 2: Agent Engine (Core Capabilities)
const aiEngineLayer: ArchitectureLayer = {
  id: 'aiEngine',
  titleKey: 'admin.architecture.layers.aiEngine',
  subtitleKey: 'admin.architecture.layers.aiEngineDesc',
  level: 2,
  cards: [
    {
      id: 'models',
      i18nKey: 'admin.nav.models',
      href: '/admin/ai/models',
      icon: Bot,
      clickable: true,
      stats: [{ label: '已配置', key: 'aiModels' }],
    },
    {
      id: 'agents',
      i18nKey: 'admin.nav.agents',
      descriptionKey: 'admin.architecture.cards.agentsDesc',
      href: '/admin/ai/agents',
      icon: Cpu,
      clickable: true,
      stats: [{ label: '已注册', key: 'agents' }],
    },
    {
      id: 'teams',
      i18nKey: 'admin.nav.teams',
      href: '/admin/ai/teams',
      icon: UsersRound,
      clickable: true,
      stats: [{ label: '辩论话题', key: 'topics' }],
    },
    {
      id: 'skills',
      i18nKey: 'admin.nav.skills',
      href: '/admin/ai/skills',
      icon: Sparkles,
      clickable: true,
      stats: [{ label: '技能', key: 'skills' }],
    },
    {
      id: 'tools',
      i18nKey: 'admin.nav.tools',
      href: '/admin/ai/tools',
      icon: Wrench,
      clickable: true,
      stats: [{ label: '工具', key: 'tools' }],
    },
    {
      id: 'rag',
      i18nKey: 'admin.nav.rag',
      descriptionKey: 'admin.architecture.cards.ragDesc',
      href: '/library/rag',
      icon: Brain,
      clickable: true,
      stats: [{ label: '知识库', key: 'knowledgeBases' }],
    },
    {
      id: 'mcpClients',
      i18nKey: 'admin.nav.mcpClients',
      descriptionKey: 'admin.architecture.cards.mcpClientsDesc',
      href: '/admin/ai/tools',
      icon: Share2,
      clickable: true,
      stats: [{ label: '服务器', key: 'mcpServers' }],
    },
    {
      id: 'guardrails',
      i18nKey: 'admin.nav.guardrails',
      descriptionKey: 'admin.architecture.cards.guardrailsDesc',
      href: '/admin/ai/guardrails',
      icon: Shield,
      clickable: true,
      stats: [{ label: '规则', key: 'guardrailRules' }],
    },
  ],
};

// Layer 1: Infrastructure Layer (Foundation)
// 12 modules in 4 groups: User & Access, Operations & Billing, Data & Storage, System Ops
const infrastructureLayer: ArchitectureLayer = {
  id: 'infrastructure',
  titleKey: 'admin.architecture.layers.infrastructure',
  subtitleKey: 'admin.architecture.layers.infrastructureDesc',
  level: 1,
  groups: [
    {
      id: 'userAccess',
      titleKey: 'admin.architecture.groups.userAccess',
      cards: [
        {
          id: 'users',
          i18nKey: 'admin.nav.users',
          href: '/admin/access/users',
          icon: Users,
          clickable: true,
          stats: [
            { label: '总用户', key: 'totalUsers' },
            { label: '活跃', key: 'activeUsers' },
          ],
        },
        {
          id: 'permissions',
          i18nKey: 'admin.nav.permissions',
          href: '/admin/access/permissions',
          icon: Shield,
          clickable: true,
          stats: [{ label: '管理员', key: 'adminUsers' }],
        },
        {
          id: 'secrets',
          i18nKey: 'admin.nav.secrets',
          href: '/admin/access/secrets',
          icon: Key,
          clickable: true,
          stats: [{ label: '密钥', key: 'secrets' }],
        },
      ],
    },
    {
      id: 'operationBilling',
      titleKey: 'admin.architecture.groups.operationBilling',
      cards: [
        {
          id: 'credits',
          i18nKey: 'admin.nav.credits',
          href: '/admin/access/credits',
          icon: Coins,
          clickable: true,
          stats: [{ label: '账户', key: 'creditAccounts' }],
        },
        {
          id: 'billing',
          i18nKey: 'admin.nav.billing',
          href: '/admin/access/billing',
          icon: CreditCard,
          clickable: true,
          stats: [{ label: '交易', key: 'creditTransactions' }],
        },
        {
          id: 'notifications',
          i18nKey: 'admin.nav.notifications',
          href: '/admin/system/notifications',
          icon: Bell,
          clickable: true,
          stats: [{ label: '通知', key: 'notifications' }],
        },
      ],
    },
    {
      id: 'dataStorage',
      titleKey: 'admin.architecture.groups.dataStorage',
      cards: [
        {
          id: 'dataManagement',
          i18nKey: 'admin.nav.dataManagement',
          href: '/admin/data-management',
          icon: Layers,
          clickable: true,
          stats: [{ label: '表', key: 'dbTables' }],
        },
        {
          id: 'storage',
          i18nKey: 'admin.nav.storage',
          href: '/admin/system/storage',
          icon: HardDrive,
          clickable: true,
          stats: [{ label: '配置', key: 'storageProviders' }],
        },
      ],
    },
    {
      id: 'systemOps',
      titleKey: 'admin.architecture.groups.systemOps',
      cards: [
        {
          id: 'system',
          i18nKey: 'admin.nav.systemManagement',
          href: '/admin/system',
          icon: Settings,
          clickable: true,
          stats: [{ label: '设置', key: 'systemSettings' }],
        },
        {
          id: 'logs',
          i18nKey: 'admin.nav.logs',
          href: '/admin/system/logs',
          icon: ScrollText,
          clickable: true,
          stats: [{ label: '登录', key: 'totalLogins' }],
        },
        {
          id: 'monitoring',
          i18nKey: 'admin.nav.monitoring',
          href: '/admin/system/monitoring',
          icon: Activity,
          clickable: true,
          stats: [
            { label: 'AI调用(24h)', key: 'kernelLLMCalls' },
            { label: '错误(24h)', key: 'monitoringErrors' },
          ],
        },
      ],
    },
  ],
};

// Export all layers in order (top to bottom)
export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  agentOsLayer,
  openApiLayer,
  aiAppsLayer,
  aiKernelLayer,
  aiEngineLayer,
  infrastructureLayer,
];

// Layer styling configurations - enhanced visual design
export const LAYER_STYLES = {
  6: {
    // Agent Intent Gateway - Cyan theme (top layer)
    badge: 'bg-cyan-100 text-cyan-700',
    border: 'border-cyan-200',
    accent: 'text-cyan-600',
    bg: 'bg-gradient-to-br from-cyan-50 to-sky-50/80',
    accentBar: 'bg-gradient-to-b from-cyan-500 to-sky-600',
    iconBg: 'bg-cyan-100 text-cyan-600',
    hoverBorder: 'hover:border-cyan-300',
  },
  5: {
    // External Agent Access - Orange theme
    badge: 'bg-orange-100 text-orange-700',
    border: 'border-orange-200',
    accent: 'text-orange-600',
    bg: 'bg-gradient-to-br from-orange-50 to-amber-50/80',
    accentBar: 'bg-gradient-to-b from-orange-500 to-amber-600',
    iconBg: 'bg-orange-100 text-orange-600',
    hoverBorder: 'hover:border-orange-300',
  },
  4: {
    // Agent Apps - Purple theme
    badge: 'bg-violet-100 text-violet-700',
    border: 'border-violet-200',
    accent: 'text-violet-600',
    bg: 'bg-gradient-to-br from-violet-50 to-purple-50/80',
    accentBar: 'bg-gradient-to-b from-violet-500 to-purple-600',
    iconBg: 'bg-violet-100 text-violet-600',
    hoverBorder: 'hover:border-violet-300',
  },
  3: {
    // Agent Runtime - Teal theme
    badge: 'bg-teal-100 text-teal-700',
    border: 'border-teal-200',
    accent: 'text-teal-600',
    bg: 'bg-gradient-to-br from-teal-50 to-slate-50/80',
    accentBar: 'bg-gradient-to-b from-teal-500 to-slate-600',
    iconBg: 'bg-teal-100 text-teal-600',
    hoverBorder: 'hover:border-teal-300',
  },
  2: {
    // Agent Engine - Blue theme
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-200',
    accent: 'text-blue-600',
    bg: 'bg-gradient-to-br from-blue-50 to-cyan-50/80',
    accentBar: 'bg-gradient-to-b from-blue-500 to-cyan-600',
    iconBg: 'bg-blue-100 text-blue-600',
    hoverBorder: 'hover:border-blue-300',
  },
  1: {
    // Infrastructure - Green theme (bottom layer)
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    accent: 'text-emerald-600',
    bg: 'bg-gradient-to-br from-emerald-50 to-teal-50/80',
    accentBar: 'bg-gradient-to-b from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-100 text-emerald-600',
    hoverBorder: 'hover:border-emerald-300',
  },
} as const;
