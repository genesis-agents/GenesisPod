'use client';

import { Sun, Moon, Monitor, type LucideIcon } from 'lucide-react';
import { useThemeStore, type Appearance } from '@/stores';
import { useTranslation } from '@/lib/i18n';
import { SettingsSectionCard } from '@/components/common/cards/SettingsSectionCard';
import { PersonalizationSection } from './PersonalizationSection';

/**
 * 通用 /me/general — 外观主题 + 聊天样式 + 兴趣标签（个性化已合并进来）。
 * 外观主题写 themeStore.appearance，由 ThemeApplier 落到 <html class="dark">，即时生效并持久化。
 * 语言切换不在此处（见头像菜单），与设计 §3.1 / §9.1 一致。
 */
const OPTIONS: { value: Appearance; labelKey: string; icon: LucideIcon }[] = [
  { value: 'light', labelKey: 'me.general.light', icon: Sun },
  { value: 'dark', labelKey: 'me.general.dark', icon: Moon },
  { value: 'system', labelKey: 'me.general.system', icon: Monitor },
];

export function GeneralSection() {
  const { t } = useTranslation();
  const appearance = useThemeStore((s) => s.appearance);
  const setAppearance = useThemeStore((s) => s.setAppearance);

  return (
    <div className="space-y-6">
      <SettingsSectionCard
        title={t('me.general.appearance')}
        description={t('me.general.appearanceDesc')}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {OPTIONS.map((opt) => {
            const Icon = opt.icon;
            const selected = appearance === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setAppearance(opt.value)}
                className={`flex items-center gap-3 rounded-lg border p-4 text-left transition-colors ${
                  selected
                    ? 'border-violet-500 bg-violet-50 ring-1 ring-violet-500'
                    : 'border-gray-200 hover:bg-gray-50'
                }`}
              >
                <Icon
                  className={`h-5 w-5 ${selected ? 'text-violet-600' : 'text-gray-500'}`}
                />
                <span
                  className={`text-sm font-medium ${
                    selected ? 'text-violet-700' : 'text-gray-700'
                  }`}
                >
                  {t(opt.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      </SettingsSectionCard>

      {/* 个性化已合并进通用：聊天样式 + 兴趣标签 */}
      <PersonalizationSection />
    </div>
  );
}
