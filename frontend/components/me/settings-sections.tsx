import {
  User,
  SlidersHorizontal,
  Key,
  Wand2,
  Bot,
  Blocks,
  Bell,
  CreditCard,
  type LucideIcon,
} from 'lucide-react';
import { UserApiKeysTab } from '@/components/me/api-keys/UserApiKeysTab';
import { UserModelsManagement } from '@/components/me/models/UserModelsManagement';
import { MyAgentsTab } from '@/components/custom-agents/MyAgentsTab';
import { NotificationPreferencesView } from '@/components/me/notifications/NotificationPreferencesView';
import { AccountSection } from '@/components/me/sections/AccountSection';
import { GeneralSection } from '@/components/me/sections/GeneralSection';
import { BillingSection } from '@/components/me/sections/BillingSection';
import { IntegrationsSection } from '@/components/me/sections/IntegrationsSection';

export type SettingsGroup = 'profile' | 'ai' | 'billing';

export interface SettingsSection {
  /** 路由 section 段，对应 /me/[id] */
  id: string;
  /** i18n key（禁硬编码文案） */
  labelKey: string;
  /** Lucide 图标（禁 emoji） */
  icon: LucideIcon;
  /** 左导航分组 */
  group: SettingsGroup;
  /** section 内容组件 */
  component: React.ComponentType;
}

const NotificationsSection = () => (
  <NotificationPreferencesView showHeader={false} />
);

/** 分组顺序 + 组标题 i18n key */
export const SETTINGS_GROUPS: { group: SettingsGroup; labelKey: string }[] = [
  { group: 'profile', labelKey: 'me.nav.groupProfile' },
  { group: 'ai', labelKey: 'me.nav.groupAi' },
  { group: 'billing', labelKey: 'me.nav.groupBilling' },
];

/** 全部 section（顺序即左导航内顺序） */
export const SETTINGS_SECTIONS: SettingsSection[] = [
  // 个人
  {
    id: 'account',
    labelKey: 'me.nav.account',
    icon: User,
    group: 'profile',
    component: AccountSection,
  },
  {
    id: 'general',
    labelKey: 'me.nav.general',
    icon: SlidersHorizontal,
    group: 'profile',
    component: GeneralSection,
  },
  // API 与模型
  {
    id: 'api-keys',
    labelKey: 'me.nav.apiKeys',
    icon: Key,
    group: 'ai',
    component: UserApiKeysTab,
  },
  {
    id: 'models',
    labelKey: 'me.nav.models',
    icon: Wand2,
    group: 'ai',
    component: UserModelsManagement,
  },
  {
    id: 'agents',
    labelKey: 'me.nav.agents',
    icon: Bot,
    group: 'ai',
    component: MyAgentsTab,
  },
  // 资源与计费
  {
    id: 'integrations',
    labelKey: 'me.nav.integrations',
    icon: Blocks,
    group: 'billing',
    component: IntegrationsSection,
  },
  {
    id: 'notifications',
    labelKey: 'me.nav.notifications',
    icon: Bell,
    group: 'billing',
    component: NotificationsSection,
  },
  {
    id: 'billing',
    labelKey: 'me.nav.billing',
    icon: CreditCard,
    group: 'billing',
    component: BillingSection,
  },
];

export const SETTINGS_SECTION_IDS = SETTINGS_SECTIONS.map((s) => s.id);

export function getSettingsSection(id: string): SettingsSection | undefined {
  return SETTINGS_SECTIONS.find((s) => s.id === id);
}
