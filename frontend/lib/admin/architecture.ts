/**
 * Admin Architecture Diagram Configuration
 *
 * Five-layer architecture visualization (matches backend modules/):
 * Layer 4: Open API               → modules/open-api/
 * Layer 3: AI Apps                → modules/ai-app/
 * Layer 2.5: AI Harness           → modules/ai-harness/
 *                                   (facade/kernel/execution/memory/process/
 *                                    protocol/governance/runtime)
 * Layer 2: AI Engine              → modules/ai-engine/
 *                                   (llm/tools/skills/rag/agents/teams/safety)
 * Layer 1: Infrastructure         → modules/ai-infra/
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
  BarChart3,
  Radio,
  Webhook,
  Share2,
  Cpu,
  Database,
  GitBranch,
  Network,
  Workflow,
  MemoryStick,
  Shuffle,
  Lock,
  Globe,
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

// Card group for layers that need sub-grouping
export interface CardGroup {
  id: string;
  titleKey: string;
  cards: ArchitectureCard[];
}

// Architecture layer type
// level 5 slot is repurposed for L2.5 AI Harness (Intent Gateway was deleted)
export interface ArchitectureLayer {
  id: string;
  titleKey: string; // i18n key for layer title
  subtitleKey?: string; // i18n key for subtitle
  level: 1 | 2 | 3 | 4 | 5; // Layer level for styling (5 = AI Harness / L2.5)
  cards?: ArchitectureCard[];
  groups?: CardGroup[]; // For grouped cards (AI Engine, AI Apps, Infrastructure)
}

// Layer 4: Open API (External access for agents and third parties)
const openApiLayer: ArchitectureLayer = {
  id: 'openApi',
  titleKey: 'admin.architecture.layers.openApi',
  subtitleKey: 'admin.architecture.layers.openApiDesc',
  level: 4,
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
    {
      id: 'publicApi',
      i18nKey: 'admin.architecture.cards.openApiPublic',
      descriptionKey: 'admin.architecture.cards.openApiPublicDesc',
      icon: Globe,
      clickable: false,
    },
    {
      id: 'admin',
      i18nKey: 'admin.architecture.cards.openApiAdmin',
      descriptionKey: 'admin.architecture.cards.openApiAdminDesc',
      icon: Lock,
      clickable: false,
    },
    {
      id: 'a2a',
      i18nKey: 'admin.architecture.cards.openApiA2A',
      descriptionKey: 'admin.architecture.cards.openApiA2ADesc',
      icon: Share2,
      clickable: false,
    },
  ],
};

// Layer 3: AI Apps (Business Applications - Read-only from main sidebar)
const aiAppsLayer: ArchitectureLayer = {
  id: 'aiApps',
  titleKey: 'admin.architecture.layers.aiApps',
  subtitleKey: 'admin.architecture.layers.aiAppsDesc',
  level: 3,
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
      ],
    },
    {
      id: 'researchAnalysisGroup',
      titleKey: 'nav.sections.researchAnalysis',
      cards: [
        {
          id: 'aiInsights',
          i18nKey: 'nav.aiInsights',
          href: '/admin/overview/dependencies/topic-insights',
          icon: Lightbulb,
          clickable: true,
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
      ],
    },
  ],
};

// Layer 2.5: AI Harness (Agent Runtime Scaffold)
// Uses level: 5 slot in LAYER_STYLES (freed up by deletion of Intent Gateway)
const aiHarnessLayer: ArchitectureLayer = {
  id: 'aiHarness',
  titleKey: 'admin.architecture.layers.aiHarness',
  subtitleKey: 'admin.architecture.layers.aiHarnessDesc',
  level: 5,
  cards: [
    {
      id: 'harnessFacade',
      i18nKey: 'admin.architecture.cards.harnessFacade',
      descriptionKey: 'admin.architecture.cards.harnessFacadeDesc',
      href: '/admin/ai/harness#facade',
      icon: Network,
      clickable: true,
    },
    {
      id: 'harnessKernel',
      i18nKey: 'admin.architecture.cards.harnessKernel',
      descriptionKey: 'admin.architecture.cards.harnessKernelDesc',
      href: '/admin/ai/harness#kernel',
      icon: Cpu,
      clickable: true,
      stats: [{ label: 'Running', key: 'kernelRunning' }],
    },
    {
      id: 'harnessExecution',
      i18nKey: 'admin.architecture.cards.harnessExecution',
      descriptionKey: 'admin.architecture.cards.harnessExecutionDesc',
      href: '/admin/ai/harness#execution',
      icon: Workflow,
      clickable: true,
      stats: [{ label: 'Traces', key: 'agentTraces' }],
    },
    {
      id: 'harnessMemory',
      i18nKey: 'admin.architecture.cards.harnessMemory',
      descriptionKey: 'admin.architecture.cards.harnessMemoryDesc',
      href: '/admin/ai/harness#memory',
      icon: MemoryStick,
      clickable: true,
      stats: [{ label: 'Memories', key: 'kernelMemories' }],
    },
    {
      id: 'harnessProcess',
      i18nKey: 'admin.architecture.cards.harnessProcess',
      descriptionKey: 'admin.architecture.cards.harnessProcessDesc',
      href: '/admin/ai/harness#process',
      icon: GitBranch,
      clickable: true,
      stats: [
        { label: 'Processes', key: 'kernelProcesses' },
        { label: 'Running', key: 'kernelRunning' },
      ],
    },
    {
      id: 'harnessProtocol',
      i18nKey: 'admin.architecture.cards.harnessProtocol',
      descriptionKey: 'admin.architecture.cards.harnessProtocolDesc',
      href: '/admin/ai/harness#protocol',
      icon: Radio,
      clickable: true,
      stats: [{ label: 'Subscriptions', key: 'kernelSubscriptions' }],
    },
    {
      id: 'harnessGovernance',
      i18nKey: 'admin.architecture.cards.harnessGovernance',
      descriptionKey: 'admin.architecture.cards.harnessGovernanceDesc',
      href: '/admin/ai/harness#governance',
      icon: BarChart3,
      clickable: true,
      stats: [{ label: 'Eval runs', key: 'harnessEvalRuns' }],
    },
    {
      id: 'harnessRuntime',
      i18nKey: 'admin.architecture.cards.harnessRuntime',
      descriptionKey: 'admin.architecture.cards.harnessRuntimeDesc',
      href: '/admin/ai/harness#runtime',
      icon: Shuffle,
      clickable: true,
      stats: [{ label: 'LLM calls', key: 'kernelLLMCalls' }],
    },
  ],
};

// Layer 2: AI Engine (Core Capabilities)
const aiEngineLayer: ArchitectureLayer = {
  id: 'aiEngine',
  titleKey: 'admin.architecture.layers.aiEngine',
  subtitleKey: 'admin.architecture.layers.aiEngineDesc',
  level: 2,
  groups: [
    {
      id: 'engineCore',
      titleKey: 'admin.architecture.groups.engineCore',
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
          id: 'tools',
          i18nKey: 'admin.nav.tools',
          href: '/admin/ai/tools',
          icon: Wrench,
          clickable: true,
          stats: [{ label: '工具', key: 'tools' }],
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
          id: 'rag',
          i18nKey: 'admin.nav.rag',
          descriptionKey: 'admin.architecture.cards.ragDesc',
          href: '/library/rag',
          icon: Brain,
          clickable: true,
          stats: [{ label: '知识库', key: 'knowledgeBases' }],
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
          id: 'guardrails',
          i18nKey: 'admin.nav.guardrails',
          descriptionKey: 'admin.architecture.cards.guardrailsDesc',
          href: '/admin/ai/guardrails',
          icon: Shield,
          clickable: true,
          stats: [{ label: '规则', key: 'guardrailRules' }],
        },
      ],
    },
  ],
};

// Layer 1: Infrastructure (Foundation)
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
          i18nKey: 'admin.architecture.cards.infraUsers',
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
          i18nKey: 'admin.architecture.cards.infraPermissions',
          href: '/admin/access/permissions',
          icon: Shield,
          clickable: true,
          stats: [{ label: '管理员', key: 'adminUsers' }],
        },
        {
          id: 'secrets',
          i18nKey: 'admin.architecture.cards.infraSecrets',
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
          i18nKey: 'admin.architecture.cards.infraCredits',
          href: '/admin/access/credits',
          icon: Coins,
          clickable: true,
          stats: [{ label: '账户', key: 'creditAccounts' }],
        },
        {
          id: 'billing',
          i18nKey: 'admin.architecture.cards.infraBilling',
          href: '/admin/access/billing',
          icon: CreditCard,
          clickable: true,
          stats: [{ label: '交易', key: 'creditTransactions' }],
        },
        {
          id: 'notifications',
          i18nKey: 'admin.architecture.cards.infraNotifications',
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
          id: 'storage',
          i18nKey: 'admin.architecture.cards.infraStorage',
          href: '/admin/storage',
          icon: HardDrive,
          clickable: true,
          stats: [{ label: 'DB + R2', key: 'storageTotal' }],
        },
        {
          id: 'dataManagement',
          i18nKey: 'admin.architecture.cards.infraDatabase',
          href: '/admin/data-management',
          icon: Layers,
          clickable: true,
          stats: [{ label: '表', key: 'dbTables' }],
        },
        {
          id: 'resourceManagement',
          i18nKey: 'admin.architecture.cards.infraResources',
          href: '/admin/resources',
          icon: Database,
          clickable: true,
          stats: [{ label: '无效', key: 'brokenResources' }],
        },
      ],
    },
    {
      id: 'systemOps',
      titleKey: 'admin.architecture.groups.systemOps',
      cards: [
        {
          id: 'system',
          i18nKey: 'admin.architecture.cards.infraSystem',
          href: '/admin/system',
          icon: Settings,
          clickable: true,
          stats: [{ label: '设置', key: 'systemSettings' }],
        },
        {
          id: 'logs',
          i18nKey: 'admin.architecture.cards.infraLogs',
          href: '/admin/system/logs',
          icon: ScrollText,
          clickable: true,
          stats: [{ label: '登录', key: 'totalLogins' }],
        },
        {
          id: 'monitoring',
          i18nKey: 'admin.architecture.cards.infraMonitoring',
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
  openApiLayer,
  aiAppsLayer,
  aiHarnessLayer,
  aiEngineLayer,
  infrastructureLayer,
];

// Layer styling configurations - enhanced visual design
export const LAYER_STYLES = {
  4: {
    // Open API - Orange theme
    badge: 'bg-orange-100 text-orange-700',
    border: 'border-orange-200',
    accent: 'text-orange-600',
    bg: 'bg-gradient-to-br from-orange-50 to-amber-50/80',
    accentBar: 'bg-gradient-to-b from-orange-500 to-amber-600',
    iconBg: 'bg-orange-100 text-orange-600',
    hoverBorder: 'hover:border-orange-300',
  },
  3: {
    // AI Apps - Purple theme
    badge: 'bg-violet-100 text-violet-700',
    border: 'border-violet-200',
    accent: 'text-violet-600',
    bg: 'bg-gradient-to-br from-violet-50 to-purple-50/80',
    accentBar: 'bg-gradient-to-b from-violet-500 to-purple-600',
    iconBg: 'bg-violet-100 text-violet-600',
    hoverBorder: 'hover:border-violet-300',
  },
  5: {
    // AI Harness (L2.5) - Teal/Indigo theme (distinct from L2 blue and L3 purple)
    badge: 'bg-teal-100 text-teal-700',
    border: 'border-teal-200',
    accent: 'text-teal-600',
    bg: 'bg-gradient-to-br from-teal-50 to-indigo-50/80',
    accentBar: 'bg-gradient-to-b from-teal-500 to-indigo-600',
    iconBg: 'bg-teal-100 text-teal-600',
    hoverBorder: 'hover:border-teal-300',
  },
  2: {
    // AI Engine (Core) - Blue theme
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
