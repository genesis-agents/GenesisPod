'use client';

import Link from 'next/link';
import {
  Users,
  Key,
  Database,
  Settings,
  ArrowRight,
  type LucideIcon,
} from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils/common';

/**
 * /me — 用户端的"我的中心"入口（Wave 5 骨架）。
 *
 * 镜像 admin L1 的 4 实体结构（用户/密钥/数据/系统），每张卡链接到既有
 * 用户端路由（不重复造页面）：
 *
 *   用户管理 → /profile           （资料、积分、通知偏好）
 *   密钥管理 → /me/ai             （我的 API Keys / BYOK）
 *   数据管理 → /library           （我的资源库 / RAG）
 *   系统管理 → /notifications     （我的通知 + /feedback）
 *
 * 后续完善：每张卡显示与该用户相关的 stats（积分余额 / 密钥数量 / 存储用量等），
 * 需要后端 stats API 加 `?scope=self` 参数支持。
 */

interface HubCard {
  id: string;
  titleKey: string;
  descriptionKey: string;
  href: string;
  icon: LucideIcon;
  /** Tailwind color stem matching admin L1 domain palette */
  color: 'blue' | 'amber' | 'emerald' | 'slate';
}

const CARDS: HubCard[] = [
  {
    id: 'profile',
    titleKey: 'me.cards.profile.title',
    descriptionKey: 'me.cards.profile.description',
    href: '/profile',
    icon: Users,
    color: 'blue',
  },
  {
    id: 'keys',
    titleKey: 'me.cards.keys.title',
    descriptionKey: 'me.cards.keys.description',
    href: '/me/ai',
    icon: Key,
    color: 'amber',
  },
  {
    id: 'library',
    titleKey: 'me.cards.library.title',
    descriptionKey: 'me.cards.library.description',
    href: '/library',
    icon: Database,
    color: 'emerald',
  },
  {
    id: 'notifications',
    titleKey: 'me.cards.notifications.title',
    descriptionKey: 'me.cards.notifications.description',
    href: '/notifications',
    icon: Settings,
    color: 'slate',
  },
];

const COLOR_STYLES: Record<
  HubCard['color'],
  { bg: string; text: string; bgHover: string; borderHover: string }
> = {
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    bgHover: 'group-hover:bg-blue-100',
    borderHover: 'hover:border-blue-300',
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-600',
    bgHover: 'group-hover:bg-amber-100',
    borderHover: 'hover:border-amber-300',
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-600',
    bgHover: 'group-hover:bg-emerald-100',
    borderHover: 'hover:border-emerald-300',
  },
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-600',
    bgHover: 'group-hover:bg-slate-200',
    borderHover: 'hover:border-slate-400',
  },
};

export default function MeHubPage() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto bg-gray-50/50">
        <div className="mx-auto max-w-5xl px-6 py-8">
          {/* Header */}
          <header className="mb-8">
            <h1 className="text-2xl font-bold text-gray-900">
              {t('me.title')}
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              {user?.email
                ? t('me.subtitleWithEmail').replace('{email}', user.email)
                : t('me.subtitle')}
            </p>
          </header>

          {/* 4 cards mirroring L1 admin structure */}
          <div className="grid gap-4 sm:grid-cols-2">
            {CARDS.map((card) => {
              const Icon = card.icon;
              const styles = COLOR_STYLES[card.color];
              return (
                <Link
                  key={card.id}
                  href={card.href}
                  className={cn(
                    'group block rounded-xl border border-gray-200 bg-white p-6 shadow-sm transition-all',
                    styles.borderHover,
                    'hover:shadow-md'
                  )}
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-xl transition-colors',
                        styles.bg,
                        styles.text,
                        styles.bgHover
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h2 className="font-semibold text-gray-900">
                        {t(card.titleKey)}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-sm text-gray-500">
                        {t(card.descriptionKey)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-end text-sm font-medium text-gray-500 opacity-0 transition-opacity group-hover:opacity-100">
                    <span>{t('common.open')}</span>
                    <ArrowRight className="ml-1 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
