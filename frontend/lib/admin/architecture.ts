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
  level: 1 | 2 | 3 | 4 | 5; // Layer level for styling (5 = AI Harness L2.5 slot)
  /**
   * Badge label override. Defaults to `L${level}`. AI Harness 占用 L5 slot 但语义
   * 是 L2.5（位于 L2 AI Engine 和 L3 AI Apps 之间），所以显示 'L2.5' 而非 'L5'。
   */
  displayLevel?: string;
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
      href: '/admin/system?tab=settings',
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

// Layer 3: AI Apps (Business Applications)
//
// 2026-05-12 重构：从 5 组 × 多卡片 收成 4 张大卡，对齐 L1 Infrastructure "一卡一类"
// 范式。每张卡点开是该类目下 ai-app 模块的架构文档聚合页（/admin/ai-app/<category>）。
//
// 不在 L3 显示：Explore / Library（资料知识层）、byok / management / contracts /
// feedback（基础设施类，已在其他卡片体现）。
const aiAppsLayer: ArchitectureLayer = {
  id: 'aiApps',
  titleKey: 'admin.architecture.layers.aiApps',
  subtitleKey: 'admin.architecture.layers.aiAppsDesc',
  level: 3,
  cards: [
    {
      id: 'aiAppsInsights',
      i18nKey: 'admin.architecture.cards.aiAppsInsights',
      descriptionKey: 'admin.architecture.cards.aiAppsInsightsDesc',
      href: '/admin/ai-app/insights',
      icon: Lightbulb,
      clickable: true,
      stats: [
        { label: '主题', key: 'topics' },
        { label: '研究', key: 'researchMissions' },
      ],
    },
    {
      id: 'aiAppsPlanning',
      i18nKey: 'admin.architecture.cards.aiAppsPlanning',
      descriptionKey: 'admin.architecture.cards.aiAppsPlanningDesc',
      href: '/admin/ai-app/planning',
      icon: GitBranch,
      clickable: true,
      stats: [
        { label: '辩论', key: 'debateSessions' },
        { label: '推演', key: 'simRuns' },
      ],
    },
    {
      id: 'aiAppsContent',
      i18nKey: 'admin.architecture.cards.aiAppsContent',
      descriptionKey: 'admin.architecture.cards.aiAppsContentDesc',
      href: '/admin/ai-app/content',
      icon: PenTool,
      clickable: true,
      stats: [
        { label: '文档', key: 'officeDocuments' },
        { label: '内容', key: 'socialContent' },
      ],
    },
    {
      id: 'aiAppsLabs',
      i18nKey: 'admin.architecture.cards.aiAppsLabs',
      descriptionKey: 'admin.architecture.cards.aiAppsLabsDesc',
      href: '/admin/ai-app/labs',
      icon: Sparkles,
      clickable: true,
      stats: [
        { label: '工具', key: 'tools' },
        { label: '技能', key: 'skills' },
      ],
    },
  ],
};

// Layer 2.5: AI Harness (Agent Runtime Scaffold)
//
// Wave 5 重构（2026-05-11）：从 8 卡（facade/kernel/execution/memory/process/protocol/
// governance/runtime）合并为 4 张实体卡，对齐 AI Infra L1 的「一卡一实体」范式。
// 8 个原 page 暂保留作为 deep-link 兜底；下次迭代再做"合并页 + 子 Tab"内嵌。
//
// - harnessExecution（运行调度）：吸收原 kernel/execution/process/runtime
// - harnessMemory（记忆状态）  ：保留原 memory + 后续合并 event-store/journal
// - harnessGovernance（评估治理）：吸收原 governance/protocol 中的 tracing 视角
// - harnessInterop（互联协议） ：吸收原 facade/protocol/handoffs
const aiHarnessLayer: ArchitectureLayer = {
  id: 'aiHarness',
  titleKey: 'admin.architecture.layers.aiHarness',
  subtitleKey: 'admin.architecture.layers.aiHarnessDesc',
  level: 5,
  displayLevel: 'L2.5',
  cards: [
    {
      id: 'harnessExecution',
      i18nKey: 'admin.architecture.cards.harnessExecution',
      descriptionKey: 'admin.architecture.cards.harnessExecutionDesc',
      href: '/admin/ai/harness?tab=execution',
      icon: Workflow,
      clickable: true,
      stats: [
        { label: 'Running', key: 'kernelRunning' },
        { label: 'Traces', key: 'agentTraces' },
      ],
    },
    {
      id: 'harnessMemory',
      i18nKey: 'admin.architecture.cards.harnessMemory',
      descriptionKey: 'admin.architecture.cards.harnessMemoryDesc',
      href: '/admin/ai/harness?tab=memory',
      icon: MemoryStick,
      clickable: true,
      stats: [{ label: 'Memories', key: 'kernelMemories' }],
    },
    {
      id: 'harnessGovernance',
      i18nKey: 'admin.architecture.cards.harnessGovernance',
      descriptionKey: 'admin.architecture.cards.harnessGovernanceDesc',
      href: '/admin/ai/harness?tab=governance',
      icon: BarChart3,
      clickable: true,
      stats: [
        { label: 'Eval runs', key: 'harnessEvalRuns' },
        { label: 'Guardrails', key: 'guardrailRules' },
      ],
    },
    {
      id: 'harnessInterop',
      i18nKey: 'admin.architecture.cards.harnessInterop',
      descriptionKey: 'admin.architecture.cards.harnessInteropDesc',
      href: '/admin/ai/harness?tab=interop',
      icon: Network,
      clickable: true,
      stats: [{ label: 'Subscriptions', key: 'kernelSubscriptions' }],
    },
  ],
};

// Layer 2: AI Engine (Core Capabilities)
//
// 2026-05-11 重构（与 Infra Wave 4 同模式）：从 1 group × 7 卡 → 4 张大卡（无 sub-group），
// 对应 4 实体：模型 / 工具 / 技能 / 知识。每张卡 click 进入合并页（含子区 Tab）。
//
// 迁出（架构合规修正——这些本属 L2.5 Harness）：
//   - agents → /admin/ai/agents（sidebar 仍可达）
//   - teams → /admin/ai/teams
//   - guardrails → /admin/ai/guardrails
//   - rag 卡片合并到 knowledge（admin 视角的 KB 管理）
const aiEngineLayer: ArchitectureLayer = {
  id: 'aiEngine',
  titleKey: 'admin.architecture.layers.aiEngine',
  subtitleKey: 'admin.architecture.layers.aiEngineDesc',
  level: 2,
  cards: [
    {
      id: 'models',
      i18nKey: 'admin.nav.models',
      descriptionKey: 'admin.architecture.cards.engineModelsDesc',
      href: '/admin/ai/models',
      icon: Bot,
      clickable: true,
      stats: [{ label: '已配置', key: 'aiModels' }],
    },
    {
      id: 'tools',
      i18nKey: 'admin.nav.tools',
      descriptionKey: 'admin.architecture.cards.engineToolsDesc',
      href: '/admin/ai/tools',
      icon: Wrench,
      clickable: true,
      stats: [{ label: '工具', key: 'tools' }],
    },
    {
      id: 'skills',
      i18nKey: 'admin.nav.skills',
      descriptionKey: 'admin.architecture.cards.engineSkillsDesc',
      href: '/admin/ai/skills',
      icon: Sparkles,
      clickable: true,
      stats: [{ label: '技能', key: 'skills' }],
    },
    {
      id: 'knowledge',
      i18nKey: 'admin.nav.knowledge',
      descriptionKey: 'admin.architecture.cards.engineKnowledgeDesc',
      href: '/admin/ai/knowledge',
      icon: Brain,
      clickable: true,
      stats: [{ label: '知识库', key: 'knowledgeBases' }],
    },
  ],
};

// Layer 1: Infrastructure (Foundation)
//
// Wave 4 重构（2026-05-11）：从 4 group × 12 卡 → 4 张大卡（无 sub-group），
// 对应 4 实体：用户 / 密钥 / 数据 / 系统。每张卡 click 进入合并页（含子区 Tab）。
//
// 历史结构见 docs/_archive/2026-q2/prd/infra/core/admin-architecture-l1-groups.md
const infrastructureLayer: ArchitectureLayer = {
  id: 'infrastructure',
  titleKey: 'admin.architecture.layers.infrastructure',
  subtitleKey: 'admin.architecture.layers.infrastructureDesc',
  level: 1,
  cards: [
    {
      id: 'userManagement',
      i18nKey: 'admin.architecture.cards.infraUserManagement',
      descriptionKey: 'admin.architecture.cards.infraUserManagementDesc',
      href: '/admin/access/users',
      icon: Users,
      clickable: true,
      stats: [
        { label: '总用户', key: 'totalUsers' },
        { label: '活跃', key: 'activeUsers' },
      ],
    },
    {
      id: 'secretManagement',
      i18nKey: 'admin.architecture.cards.infraSecretManagement',
      descriptionKey: 'admin.architecture.cards.infraSecretManagementDesc',
      href: '/admin/access/secrets',
      icon: Key,
      clickable: true,
      stats: [
        { label: '密钥', key: 'secrets' },
        { label: '待审', key: 'pendingKeyRequests' },
      ],
    },
    {
      id: 'dataManagement',
      i18nKey: 'admin.architecture.cards.infraDataManagement',
      descriptionKey: 'admin.architecture.cards.infraDataManagementDesc',
      href: '/admin/data',
      icon: Database,
      clickable: true,
      stats: [
        { label: 'DB + R2', key: 'storageTotal' },
        { label: '无效', key: 'brokenResources' },
      ],
    },
    {
      id: 'systemManagement',
      i18nKey: 'admin.architecture.cards.infraSystemManagement',
      descriptionKey: 'admin.architecture.cards.infraSystemManagementDesc',
      href: '/admin/system',
      icon: Settings,
      clickable: true,
      stats: [
        { label: 'AI调用(24h)', key: 'kernelLLMCalls' },
        { label: '错误(24h)', key: 'monitoringErrors' },
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
