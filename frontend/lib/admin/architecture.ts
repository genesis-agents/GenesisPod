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

// Card color theme
export type CardColorTheme =
  | 'amber'
  | 'orange'
  | 'rose'
  | 'pink'
  | 'violet'
  | 'purple'
  | 'indigo'
  | 'blue'
  | 'cyan'
  | 'teal'
  | 'emerald'
  | 'green'
  | 'lime'
  | 'slate';

// Architecture card type
export interface ArchitectureCard {
  id: string;
  i18nKey: string; // i18n key for the label
  descriptionKey?: string; // i18n key for description
  href?: string; // Route for clickable cards
  icon: LucideIcon;
  clickable: boolean;
  color?: CardColorTheme; // Individual card color
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
      color: 'amber',
    },
    {
      id: 'secrets',
      i18nKey: 'admin.nav.secrets',
      href: '/admin/access/secrets',
      icon: Key,
      clickable: true,
      color: 'orange',
    },
    {
      id: 'users',
      i18nKey: 'admin.nav.users',
      href: '/admin/access/users',
      icon: Users,
      clickable: true,
      color: 'rose',
    },
    {
      id: 'whitelists',
      i18nKey: 'admin.nav.whitelists',
      href: '/admin/data/whitelists',
      icon: Shield,
      clickable: true,
      color: 'pink',
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
      color: 'violet',
    },
    {
      id: 'aiExplore',
      i18nKey: 'nav.aiExplore',
      icon: Compass,
      clickable: false,
      color: 'purple',
    },
    {
      id: 'myLibrary',
      i18nKey: 'nav.myLibrary',
      icon: BookOpen,
      clickable: false,
      color: 'indigo',
    },
    {
      id: 'aiImage',
      i18nKey: 'nav.aiImage',
      icon: Image,
      clickable: false,
      color: 'pink',
    },
    {
      id: 'aiWriting',
      i18nKey: 'nav.aiWriting',
      icon: PenTool,
      clickable: false,
      color: 'rose',
    },
    {
      id: 'aiResearch',
      i18nKey: 'nav.aiResearch',
      icon: FileSearch,
      clickable: false,
      color: 'blue',
    },
    {
      id: 'aiReports',
      i18nKey: 'nav.aiReports',
      icon: FileText,
      clickable: false,
      color: 'cyan',
    },
    {
      id: 'aiSimulation',
      i18nKey: 'nav.aiSimulation',
      icon: Brain,
      clickable: false,
      color: 'teal',
    },
    {
      id: 'myTeams',
      i18nKey: 'nav.myTeams',
      icon: UsersRound,
      clickable: false,
      color: 'orange',
    },
    {
      id: 'aiTools',
      i18nKey: 'nav.aiTools',
      icon: Hammer,
      clickable: false,
      color: 'slate',
    },
    {
      id: 'aiSkills',
      i18nKey: 'nav.aiSkills',
      icon: Lightbulb,
      clickable: false,
      color: 'amber',
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
      color: 'blue',
    },
    {
      id: 'teams',
      i18nKey: 'admin.nav.teams',
      href: '/admin/ai/teams',
      icon: UsersRound,
      clickable: true,
      color: 'indigo',
    },
    {
      id: 'skills',
      i18nKey: 'admin.nav.skills',
      href: '/admin/ai/capabilities',
      icon: Sparkles,
      clickable: true,
      color: 'violet',
    },
    {
      id: 'tools',
      i18nKey: 'admin.nav.tools',
      href: '/admin/ai/external-services',
      icon: Wrench,
      clickable: true,
      color: 'cyan',
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
      color: 'emerald',
    },
    {
      id: 'quality',
      i18nKey: 'admin.nav.quality',
      href: '/admin/data/quality',
      icon: Sparkles,
      clickable: true,
      color: 'teal',
    },
    {
      id: 'storage',
      i18nKey: 'admin.nav.storage',
      href: '/admin/system/storage',
      icon: HardDrive,
      clickable: true,
      color: 'cyan',
    },
    {
      id: 'email',
      i18nKey: 'admin.nav.email',
      href: '/admin/system/email',
      icon: Mail,
      clickable: true,
      color: 'blue',
    },
    {
      id: 'site',
      i18nKey: 'admin.nav.site',
      href: '/admin/system/site',
      icon: Globe,
      clickable: true,
      color: 'green',
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

// Individual card color configurations for visual diversity
export const CARD_COLOR_SCHEMES: Record<
  CardColorTheme,
  {
    bg: string;
    bgHover: string;
    border: string;
    borderHover: string;
    iconBg: string;
    iconColor: string;
    text: string;
    shadow: string;
    ring: string;
  }
> = {
  amber: {
    bg: 'bg-amber-50/80',
    bgHover: 'hover:bg-amber-100/80',
    border: 'border-amber-200/60',
    borderHover: 'hover:border-amber-300',
    iconBg: 'bg-gradient-to-br from-amber-400 to-orange-500',
    iconColor: 'text-white',
    text: 'text-amber-900',
    shadow: 'shadow-amber-500/10',
    ring: 'ring-amber-500/20',
  },
  orange: {
    bg: 'bg-orange-50/80',
    bgHover: 'hover:bg-orange-100/80',
    border: 'border-orange-200/60',
    borderHover: 'hover:border-orange-300',
    iconBg: 'bg-gradient-to-br from-orange-400 to-red-500',
    iconColor: 'text-white',
    text: 'text-orange-900',
    shadow: 'shadow-orange-500/10',
    ring: 'ring-orange-500/20',
  },
  rose: {
    bg: 'bg-rose-50/80',
    bgHover: 'hover:bg-rose-100/80',
    border: 'border-rose-200/60',
    borderHover: 'hover:border-rose-300',
    iconBg: 'bg-gradient-to-br from-rose-400 to-pink-500',
    iconColor: 'text-white',
    text: 'text-rose-900',
    shadow: 'shadow-rose-500/10',
    ring: 'ring-rose-500/20',
  },
  pink: {
    bg: 'bg-pink-50/80',
    bgHover: 'hover:bg-pink-100/80',
    border: 'border-pink-200/60',
    borderHover: 'hover:border-pink-300',
    iconBg: 'bg-gradient-to-br from-pink-400 to-fuchsia-500',
    iconColor: 'text-white',
    text: 'text-pink-900',
    shadow: 'shadow-pink-500/10',
    ring: 'ring-pink-500/20',
  },
  violet: {
    bg: 'bg-violet-50/80',
    bgHover: 'hover:bg-violet-100/80',
    border: 'border-violet-200/60',
    borderHover: 'hover:border-violet-300',
    iconBg: 'bg-gradient-to-br from-violet-400 to-purple-500',
    iconColor: 'text-white',
    text: 'text-violet-900',
    shadow: 'shadow-violet-500/10',
    ring: 'ring-violet-500/20',
  },
  purple: {
    bg: 'bg-purple-50/80',
    bgHover: 'hover:bg-purple-100/80',
    border: 'border-purple-200/60',
    borderHover: 'hover:border-purple-300',
    iconBg: 'bg-gradient-to-br from-purple-400 to-indigo-500',
    iconColor: 'text-white',
    text: 'text-purple-900',
    shadow: 'shadow-purple-500/10',
    ring: 'ring-purple-500/20',
  },
  indigo: {
    bg: 'bg-indigo-50/80',
    bgHover: 'hover:bg-indigo-100/80',
    border: 'border-indigo-200/60',
    borderHover: 'hover:border-indigo-300',
    iconBg: 'bg-gradient-to-br from-indigo-400 to-blue-500',
    iconColor: 'text-white',
    text: 'text-indigo-900',
    shadow: 'shadow-indigo-500/10',
    ring: 'ring-indigo-500/20',
  },
  blue: {
    bg: 'bg-blue-50/80',
    bgHover: 'hover:bg-blue-100/80',
    border: 'border-blue-200/60',
    borderHover: 'hover:border-blue-300',
    iconBg: 'bg-gradient-to-br from-blue-400 to-cyan-500',
    iconColor: 'text-white',
    text: 'text-blue-900',
    shadow: 'shadow-blue-500/10',
    ring: 'ring-blue-500/20',
  },
  cyan: {
    bg: 'bg-cyan-50/80',
    bgHover: 'hover:bg-cyan-100/80',
    border: 'border-cyan-200/60',
    borderHover: 'hover:border-cyan-300',
    iconBg: 'bg-gradient-to-br from-cyan-400 to-teal-500',
    iconColor: 'text-white',
    text: 'text-cyan-900',
    shadow: 'shadow-cyan-500/10',
    ring: 'ring-cyan-500/20',
  },
  teal: {
    bg: 'bg-teal-50/80',
    bgHover: 'hover:bg-teal-100/80',
    border: 'border-teal-200/60',
    borderHover: 'hover:border-teal-300',
    iconBg: 'bg-gradient-to-br from-teal-400 to-emerald-500',
    iconColor: 'text-white',
    text: 'text-teal-900',
    shadow: 'shadow-teal-500/10',
    ring: 'ring-teal-500/20',
  },
  emerald: {
    bg: 'bg-emerald-50/80',
    bgHover: 'hover:bg-emerald-100/80',
    border: 'border-emerald-200/60',
    borderHover: 'hover:border-emerald-300',
    iconBg: 'bg-gradient-to-br from-emerald-400 to-green-500',
    iconColor: 'text-white',
    text: 'text-emerald-900',
    shadow: 'shadow-emerald-500/10',
    ring: 'ring-emerald-500/20',
  },
  green: {
    bg: 'bg-green-50/80',
    bgHover: 'hover:bg-green-100/80',
    border: 'border-green-200/60',
    borderHover: 'hover:border-green-300',
    iconBg: 'bg-gradient-to-br from-green-400 to-lime-500',
    iconColor: 'text-white',
    text: 'text-green-900',
    shadow: 'shadow-green-500/10',
    ring: 'ring-green-500/20',
  },
  lime: {
    bg: 'bg-lime-50/80',
    bgHover: 'hover:bg-lime-100/80',
    border: 'border-lime-200/60',
    borderHover: 'hover:border-lime-300',
    iconBg: 'bg-gradient-to-br from-lime-400 to-green-500',
    iconColor: 'text-white',
    text: 'text-lime-900',
    shadow: 'shadow-lime-500/10',
    ring: 'ring-lime-500/20',
  },
  slate: {
    bg: 'bg-slate-50/80',
    bgHover: 'hover:bg-slate-100/80',
    border: 'border-slate-200/60',
    borderHover: 'hover:border-slate-300',
    iconBg: 'bg-gradient-to-br from-slate-400 to-gray-500',
    iconColor: 'text-white',
    text: 'text-slate-900',
    shadow: 'shadow-slate-500/10',
    ring: 'ring-slate-500/20',
  },
} as const;

// Card color configurations (legacy - for backward compatibility)
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
