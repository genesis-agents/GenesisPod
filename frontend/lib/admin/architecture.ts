/**
 * Admin Architecture Diagram Configuration
 *
 * Four-layer architecture visualization:
 * Layer 4: Open API Layer (External Interfaces)
 * Layer 3: AI Apps Layer (Business Applications - Read-only)
 * Layer 2: AI Engine Layer (Core Capabilities)
 * Layer 1: Infrastructure Layer (Foundation)
 */

import {
  Bot,
  UsersRound,
  Wrench,
  Database,
  Shield,
  Sparkles,
  Users,
  Key,
  Globe,
  Mail,
  HardDrive,
  MessageSquare,
  Compass,
  BookOpen,
  Image,
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
  type LucideIcon,
} from 'lucide-react';

// Architecture card type
export interface ArchitectureCard {
  id: string;
  i18nKey: string; // i18n key for the label
  descriptionKey?: string; // i18n key for description
  href?: string; // Route for clickable cards
  icon: LucideIcon;
  clickable: boolean;
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
  level: 1 | 2 | 3 | 4; // Layer level for styling
  cards?: ArchitectureCard[];
  groups?: CardGroup[]; // For grouped cards (AI Apps layer)
}

// Layer 4: Open API Layer (External Interfaces)
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
    },
    {
      id: 'webhooks',
      i18nKey: 'admin.architecture.cards.webhooks',
      descriptionKey: 'admin.architecture.cards.webhooksDesc',
      icon: Webhook,
      clickable: false,
    },
  ],
};

// Layer 3: AI Apps Layer (Business Applications - Read-only from main sidebar)
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
        },
        {
          id: 'myLibrary',
          i18nKey: 'nav.myLibrary',
          icon: BookOpen,
          clickable: false,
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
        },
        {
          id: 'aiResearch',
          i18nKey: 'nav.aiResearch',
          icon: FileSearch,
          clickable: false,
        },
        {
          id: 'aiReports',
          i18nKey: 'nav.aiReports',
          icon: FileText,
          clickable: false,
        },
        {
          id: 'myTeams',
          i18nKey: 'nav.myTeams',
          icon: UsersRound,
          clickable: false,
        },
      ],
    },
    {
      id: 'planningDecisionGroup',
      titleKey: 'nav.sections.planningDecision',
      cards: [
        {
          id: 'aiPlanning',
          i18nKey: 'nav.aiPlanning',
          icon: Lightbulb,
          clickable: false,
        },
        {
          id: 'aiSimulation',
          i18nKey: 'nav.aiSimulation',
          icon: Brain,
          clickable: false,
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
        },
        {
          id: 'aiImage',
          i18nKey: 'nav.aiImage',
          icon: Image,
          clickable: false,
        },
      ],
    },
    {
      id: 'toolStoreGroup',
      titleKey: 'nav.sections.toolStore',
      cards: [
        {
          id: 'aiTools',
          i18nKey: 'nav.aiTools',
          icon: Hammer,
          clickable: false,
        },
        {
          id: 'aiSkills',
          i18nKey: 'nav.aiSkills',
          icon: Lightbulb,
          clickable: false,
        },
      ],
    },
    {
      id: 'mainEntry',
      titleKey: 'nav.aiAsk',
      cards: [
        {
          id: 'aiAsk',
          i18nKey: 'nav.aiAsk',
          icon: MessageSquare,
          clickable: false,
        },
      ],
    },
  ],
};

// Layer 2: AI Engine Layer (Core Capabilities)
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
    },
    {
      id: 'teams',
      i18nKey: 'admin.nav.teams',
      href: '/admin/ai/teams',
      icon: UsersRound,
      clickable: true,
    },
    {
      id: 'skills',
      i18nKey: 'admin.nav.skills',
      href: '/admin/ai/skills',
      icon: Sparkles,
      clickable: true,
    },
    {
      id: 'tools',
      i18nKey: 'admin.nav.tools',
      href: '/admin/ai/tools',
      icon: Wrench,
      clickable: true,
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
        },
        {
          id: 'permissions',
          i18nKey: 'admin.nav.permissions',
          href: '/admin/access/permissions',
          icon: Shield,
          clickable: true,
        },
        {
          id: 'secrets',
          i18nKey: 'admin.nav.secrets',
          href: '/admin/access/secrets',
          icon: Key,
          clickable: true,
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
        },
        {
          id: 'billing',
          i18nKey: 'admin.nav.billing',
          href: '/admin/access/billing',
          icon: CreditCard,
          clickable: true,
        },
        {
          id: 'notifications',
          i18nKey: 'admin.nav.notifications',
          href: '/admin/system/notifications',
          icon: Bell,
          clickable: true,
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
        },
        {
          id: 'storage',
          i18nKey: 'admin.nav.storage',
          href: '/admin/system/storage',
          icon: HardDrive,
          clickable: true,
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
        },
        {
          id: 'logs',
          i18nKey: 'admin.nav.logs',
          href: '/admin/system/logs',
          icon: ScrollText,
          clickable: true,
        },
        {
          id: 'monitoring',
          i18nKey: 'admin.nav.monitoring',
          href: '/admin/system/monitoring',
          icon: Activity,
          clickable: true,
        },
        {
          id: 'feedback',
          i18nKey: 'admin.nav.feedback',
          href: '/admin/feedback',
          icon: MessageSquare,
          clickable: true,
        },
      ],
    },
  ],
};

// Export all layers in order (top to bottom)
export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  openApiLayer,
  aiAppsLayer,
  aiEngineLayer,
  infrastructureLayer,
];

// Layer styling configurations - enhanced visual design
export const LAYER_STYLES = {
  4: {
    // Open API - Orange theme (top layer)
    badge: 'bg-orange-100 text-orange-700',
    border: 'border-orange-200',
    accent: 'text-orange-600',
    bg: 'bg-gradient-to-br from-orange-50/80 to-amber-50/50',
    accentBar: 'bg-gradient-to-b from-orange-500 to-amber-600',
    iconBg: 'bg-orange-100 text-orange-600',
    hoverBorder: 'hover:border-orange-300',
  },
  3: {
    // AI Apps - Purple theme (top layer)
    badge: 'bg-violet-100 text-violet-700',
    border: 'border-violet-200',
    accent: 'text-violet-600',
    bg: 'bg-gradient-to-br from-violet-50/80 to-purple-50/50',
    accentBar: 'bg-gradient-to-b from-violet-500 to-purple-600',
    iconBg: 'bg-violet-100 text-violet-600',
    hoverBorder: 'hover:border-violet-300',
  },
  2: {
    // AI Engine - Blue theme (middle layer)
    badge: 'bg-blue-100 text-blue-700',
    border: 'border-blue-200',
    accent: 'text-blue-600',
    bg: 'bg-gradient-to-br from-blue-50/80 to-cyan-50/50',
    accentBar: 'bg-gradient-to-b from-blue-500 to-cyan-600',
    iconBg: 'bg-blue-100 text-blue-600',
    hoverBorder: 'hover:border-blue-300',
  },
  1: {
    // Infrastructure - Green theme (bottom layer)
    badge: 'bg-emerald-100 text-emerald-700',
    border: 'border-emerald-200',
    accent: 'text-emerald-600',
    bg: 'bg-gradient-to-br from-emerald-50/80 to-teal-50/50',
    accentBar: 'bg-gradient-to-b from-emerald-500 to-teal-600',
    iconBg: 'bg-emerald-100 text-emerald-600',
    hoverBorder: 'hover:border-emerald-300',
  },
} as const;
