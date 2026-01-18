/**
 * Admin Architecture Diagram Configuration
 *
 * Four-layer architecture visualization:
 * Layer 4: API Layer (Access & Security)
 * Layer 3: AI Apps Layer (Business Applications - Read-only)
 * Layer 2: AI Engine Layer (Core Capabilities)
 * Layer 1: Infrastructure Layer (Foundation)
 */

import {
  Bot,
  UsersRound,
  Wrench,
  Plug,
  Database,
  Shield,
  Sparkles,
  Users,
  Key,
  ShieldCheck,
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

// Architecture layer type
export interface ArchitectureLayer {
  id: string;
  titleKey: string; // i18n key for layer title
  subtitleKey?: string; // i18n key for subtitle
  color: 'amber' | 'violet' | 'blue' | 'emerald'; // Layer color theme
  cards: ArchitectureCard[];
}

// Layer 4: API Layer (Access & Security)
const apiLayer: ArchitectureLayer = {
  id: 'api',
  titleKey: 'admin.architecture.layers.api',
  subtitleKey: 'admin.architecture.layers.apiDesc',
  color: 'amber',
  cards: [
    {
      id: 'security',
      i18nKey: 'admin.nav.security',
      href: '/admin/access/security',
      icon: ShieldCheck,
      clickable: true,
    },
    {
      id: 'secrets',
      i18nKey: 'admin.nav.secrets',
      href: '/admin/access/secrets',
      icon: Key,
      clickable: true,
    },
    {
      id: 'users',
      i18nKey: 'admin.nav.users',
      href: '/admin/access/users',
      icon: Users,
      clickable: true,
    },
    {
      id: 'whitelists',
      i18nKey: 'admin.nav.whitelists',
      href: '/admin/data/whitelists',
      icon: Shield,
      clickable: true,
    },
  ],
};

// Layer 3: AI Apps Layer (Business Applications - Read-only from main sidebar)
const aiAppsLayer: ArchitectureLayer = {
  id: 'aiApps',
  titleKey: 'admin.architecture.layers.aiApps',
  subtitleKey: 'admin.architecture.layers.aiAppsDesc',
  color: 'violet',
  cards: [
    {
      id: 'aiAsk',
      i18nKey: 'nav.aiAsk',
      icon: MessageSquare,
      clickable: false,
    },
    {
      id: 'aiExplore',
      i18nKey: 'nav.aiExplore',
      icon: Compass,
      clickable: false,
    },
    {
      id: 'myLibrary',
      i18nKey: 'nav.myLibrary',
      icon: BookOpen,
      clickable: false,
    },
    {
      id: 'aiImage',
      i18nKey: 'nav.aiImage',
      icon: Image,
      clickable: false,
    },
    {
      id: 'aiWriting',
      i18nKey: 'nav.aiWriting',
      icon: PenTool,
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
      id: 'aiSimulation',
      i18nKey: 'nav.aiSimulation',
      icon: Brain,
      clickable: false,
    },
    {
      id: 'myTeams',
      i18nKey: 'nav.myTeams',
      icon: UsersRound,
      clickable: false,
    },
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
};

// Layer 2: AI Engine Layer (Core Capabilities)
const aiEngineLayer: ArchitectureLayer = {
  id: 'aiEngine',
  titleKey: 'admin.architecture.layers.aiEngine',
  subtitleKey: 'admin.architecture.layers.aiEngineDesc',
  color: 'blue',
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
      id: 'capabilities',
      i18nKey: 'admin.nav.capabilities',
      href: '/admin/ai/capabilities',
      icon: Wrench,
      clickable: true,
    },
    {
      id: 'externalServices',
      i18nKey: 'admin.nav.externalServices',
      href: '/admin/ai/external-services',
      icon: Plug,
      clickable: true,
    },
  ],
};

// Layer 1: Infrastructure Layer (Foundation)
const infrastructureLayer: ArchitectureLayer = {
  id: 'infrastructure',
  titleKey: 'admin.architecture.layers.infrastructure',
  subtitleKey: 'admin.architecture.layers.infrastructureDesc',
  color: 'emerald',
  cards: [
    {
      id: 'collection',
      i18nKey: 'admin.nav.collection',
      href: '/admin/data/collection',
      icon: Database,
      clickable: true,
    },
    {
      id: 'quality',
      i18nKey: 'admin.nav.quality',
      href: '/admin/data/quality',
      icon: Sparkles,
      clickable: true,
    },
    {
      id: 'storage',
      i18nKey: 'admin.nav.storage',
      href: '/admin/system/storage',
      icon: HardDrive,
      clickable: true,
    },
    {
      id: 'email',
      i18nKey: 'admin.nav.email',
      href: '/admin/system/email',
      icon: Mail,
      clickable: true,
    },
    {
      id: 'site',
      i18nKey: 'admin.nav.site',
      href: '/admin/system/site',
      icon: Globe,
      clickable: true,
    },
  ],
};

// Export all layers in order (top to bottom)
export const ARCHITECTURE_LAYERS: ArchitectureLayer[] = [
  apiLayer,
  aiAppsLayer,
  aiEngineLayer,
  infrastructureLayer,
];

// Layer color configurations
export const LAYER_COLORS = {
  amber: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    headerBg: 'bg-amber-100/50',
    headerText: 'text-amber-800',
    headerBorder: 'border-amber-200',
    arrow: 'text-amber-400',
  },
  violet: {
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    headerBg: 'bg-violet-100/50',
    headerText: 'text-violet-800',
    headerBorder: 'border-violet-200',
    arrow: 'text-violet-400',
  },
  blue: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    headerBg: 'bg-blue-100/50',
    headerText: 'text-blue-800',
    headerBorder: 'border-blue-200',
    arrow: 'text-blue-400',
  },
  emerald: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    headerBg: 'bg-emerald-100/50',
    headerText: 'text-emerald-800',
    headerBorder: 'border-emerald-200',
    arrow: 'text-emerald-400',
  },
} as const;

// Card color configurations
export const CARD_COLORS = {
  clickable: {
    bg: 'bg-white',
    border: 'border-gray-200',
    hoverBg: 'hover:bg-gray-50',
    hoverBorder: 'hover:border-gray-300',
    text: 'text-gray-900',
    icon: 'text-gray-600',
    cursor: 'cursor-pointer',
  },
  readOnly: {
    bg: 'bg-gray-50/50',
    border: 'border-gray-100',
    hoverBg: '',
    hoverBorder: '',
    text: 'text-gray-500',
    icon: 'text-gray-400',
    cursor: 'cursor-default',
  },
} as const;
