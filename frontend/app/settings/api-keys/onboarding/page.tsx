'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Key, Send, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useOnboardingStatus } from '@/hooks/features/useByokUser';
import { UserApiKeysTab } from '@/components/profile/UserApiKeysTab';

export default function ApiKeysOnboardingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { status, loading, complete } = useOnboardingStatus();
  const [choice, setChoice] = useState<'key' | 'request' | null>(null);

  if (!isLoading && !user) {
    router.push('/');
    return null;
  }
  if (!isLoading && user && user.role === 'ADMIN') {
    router.push('/');
    return null;
  }
  if (loading || !status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-sm text-gray-500">加载中...</div>
      </div>
    );
  }
  if (status.byokOnboardedAt) {
    // 已经完成过引导，避免回到 onboarding 卡住
    router.push('/settings/api-keys');
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-blue-100">
            <Sparkles className="h-7 w-7 text-blue-600" />
          </div>
          <h1 className="text-3xl font-semibold text-gray-900">
            欢迎使用 Genesis.ai
          </h1>
          <p className="mt-2 text-base text-gray-600">
            为了使用 AI 功能，你需要先配置一个 Provider 的 API
            Key，或向管理员申请分配。
          </p>
        </div>

        {choice === null && (
          <div className="grid gap-4 md:grid-cols-2">
            <OptionCard
              title="我有自己的 API Key"
              description="推荐方式：使用你自己的 OpenAI / Claude / Gemini 等 Key。成本由你自己承担，配额无限制。"
              icon={Key}
              accent="blue"
              onClick={() => setChoice('key')}
            />
            <OptionCard
              title="我没有 Key，请管理员分配"
              description="向管理员提交申请。通常 24 小时内处理。分配的 Key 有配额限制。"
              icon={Send}
              accent="emerald"
              onClick={() => setChoice('request')}
            />
          </div>
        )}

        {choice === 'key' && (
          <div className="space-y-4">
            <BackLink onClick={() => setChoice(null)} />
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <div className="mb-4 text-sm text-gray-600">
                在下面至少配置并保存一个 Provider 的
                Key，保存成功后会自动完成引导。
              </div>
              <UserApiKeysTab />
            </div>
          </div>
        )}

        {choice === 'request' && (
          <div className="space-y-4">
            <BackLink onClick={() => setChoice(null)} />
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <p className="mb-4 text-sm text-gray-600">
                点击下方按钮前往申请表单。在等待管理员处理期间，你仍可进入系统浏览，只是
                AI 调用会被拦截。
              </p>
              <Link
                href="/settings/api-keys/request"
                className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <Send className="h-4 w-4" />
                填写申请表单
              </Link>
              <button
                onClick={async () => {
                  const ok = await complete();
                  if (ok) router.push('/');
                }}
                className="ml-3 text-sm text-gray-600 hover:text-gray-900"
              >
                跳过，先进入系统
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function OptionCard({
  title,
  description,
  icon: Icon,
  accent,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: 'blue' | 'emerald';
  onClick: () => void;
}) {
  const colors =
    accent === 'blue'
      ? 'border-blue-200 hover:border-blue-400 bg-blue-50/50'
      : 'border-emerald-200 hover:border-emerald-400 bg-emerald-50/50';
  const iconColor =
    accent === 'blue'
      ? 'text-blue-600 bg-blue-100'
      : 'text-emerald-600 bg-emerald-100';
  return (
    <button
      onClick={onClick}
      className={`group rounded-xl border-2 p-6 text-left transition-all ${colors}`}
    >
      <div
        className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${iconColor}`}
      >
        <Icon className="h-6 w-6" />
      </div>
      <h3 className="mb-2 text-lg font-semibold text-gray-900">{title}</h3>
      <p className="text-sm text-gray-600">{description}</p>
    </button>
  );
}

function BackLink({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-sm text-gray-500 hover:text-gray-700"
    >
      ← 重新选择
    </button>
  );
}
