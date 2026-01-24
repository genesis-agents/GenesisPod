'use client';

import { useTranslation } from '@/lib/i18n';
import { useSocialCreateStore } from '@/stores';
import {
  useSocialConnections,
  SocialContentType,
} from '@/hooks/domain/useAISocial';
import { MessageCircle, BookOpen, ArrowLeft, Check, Clock } from 'lucide-react';

export function PlatformSelector() {
  const { t } = useTranslation();
  const { platform, setPlatform, setStep } = useSocialCreateStore();
  const { connections } = useSocialConnections();

  const platforms: {
    id: SocialContentType;
    icon: typeof MessageCircle;
    label: string;
    desc: string;
    features: string[];
    gradient: string;
    bgGradient: string;
    available: boolean;
  }[] = [
    {
      id: 'WECHAT_ARTICLE',
      icon: MessageCircle,
      label: t('aiSocial.contentTypes.wechat_article'),
      desc: t('aiSocial.create.wechatDesc') || 'HTML formatted articles',
      features: [
        t('aiSocial.create.richText') || 'Rich text styling',
        t('aiSocial.create.images') || 'Images support',
      ],
      gradient: 'from-green-500 to-emerald-600',
      bgGradient: 'from-green-50 to-emerald-50',
      available: true,
    },
    {
      id: 'XIAOHONGSHU_NOTE',
      icon: BookOpen,
      label: t('aiSocial.contentTypes.xiaohongshu_note'),
      desc: t('aiSocial.create.xiaohongshuDesc') || 'Visual notes',
      features: [
        t('aiSocial.create.emojis') || 'Emojis & hashtags',
        t('aiSocial.create.topics') || 'Topic tags',
      ],
      gradient: 'from-red-500 to-rose-600',
      bgGradient: 'from-red-50 to-rose-50',
      available: true,
    },
  ];

  const comingSoonPlatforms = [
    { label: '微博', gradient: 'from-orange-400 to-red-500' },
    { label: '抖音', gradient: 'from-gray-700 to-gray-900' },
    { label: 'B站', gradient: 'from-pink-400 to-blue-500' },
  ];

  // Count connected accounts per platform
  const getConnectionCount = (platformId: SocialContentType) => {
    // Map content type to platform type
    const platformMap: Record<SocialContentType, string> = {
      WECHAT_ARTICLE: 'WECHAT',
      XIAOHONGSHU_NOTE: 'XIAOHONGSHU',
    };
    const platformType = platformMap[platformId];
    return connections.filter((c) => c.platformType === platformType).length;
  };

  const handlePlatformSelect = (platformType: SocialContentType) => {
    setPlatform(platformType);
    setStep(3);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => setStep(1)}
          className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200"
        >
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </button>
        <div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('aiSocial.create.selectPlatform')}
          </h2>
          <p className="text-sm text-gray-500">
            {t('aiSocial.create.selectPlatformDesc') ||
              'Choose your target social media platform'}
          </p>
        </div>
      </div>

      {/* Available platforms */}
      <div className="grid gap-4 sm:grid-cols-2">
        {platforms.map((p) => {
          const Icon = p.icon;
          const connectionCount = getConnectionCount(p.id);
          const isSelected = platform === p.id;

          return (
            <button
              key={p.id}
              onClick={() => handlePlatformSelect(p.id)}
              disabled={!p.available}
              className={`group relative overflow-hidden rounded-2xl border-2 p-6 text-left transition-all ${
                isSelected
                  ? 'border-transparent ring-2 ring-rose-500'
                  : 'border-gray-200 hover:border-transparent hover:shadow-lg'
              } ${!p.available ? 'cursor-not-allowed opacity-50' : ''}`}
            >
              {/* Background gradient */}
              <div
                className={`absolute inset-0 bg-gradient-to-br ${p.bgGradient} ${
                  isSelected
                    ? 'opacity-100'
                    : 'opacity-0 group-hover:opacity-100'
                } transition-opacity`}
              />

              {/* Selected indicator */}
              {isSelected && (
                <div className="absolute right-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-rose-500">
                  <Check className="h-4 w-4 text-white" />
                </div>
              )}

              <div className="relative">
                <div
                  className={`mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br ${p.gradient}`}
                >
                  <Icon className="h-7 w-7 text-white" />
                </div>

                <h3 className="text-lg font-semibold text-gray-900">
                  {p.label}
                </h3>
                <p className="mt-1 text-sm text-gray-500">{p.desc}</p>

                {/* Features */}
                <div className="mt-3 space-y-1">
                  {p.features.map((feature, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm text-gray-600"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-500" />
                      {feature}
                    </div>
                  ))}
                </div>

                {/* Connection count */}
                <div className="mt-4 flex items-center gap-2 text-sm">
                  <div
                    className={`h-2 w-2 rounded-full ${
                      connectionCount > 0 ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className="text-gray-500">
                    {connectionCount > 0
                      ? `${connectionCount} ${t('aiSocial.create.accountsConnected') || 'accounts connected'}`
                      : t('aiSocial.create.noAccountsConnected') ||
                        'No accounts connected'}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Coming soon */}
      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-500">
          {t('aiSocial.create.comingSoon') || 'Coming soon'}:
        </p>
        <div className="flex flex-wrap gap-3">
          {comingSoonPlatforms.map((p) => (
            <div
              key={p.label}
              className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-400"
            >
              <div
                className={`h-4 w-4 rounded bg-gradient-to-br ${p.gradient}`}
              />
              <span>{p.label}</span>
              <Clock className="h-3.5 w-3.5" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
