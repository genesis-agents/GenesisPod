'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Send } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useMyKeyRequests } from '@/hooks/features/useByokUser';

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI (GPT-4o, o1)' },
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'google', label: 'Google (Gemini)' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'deepseek', label: 'DeepSeek' },
  { value: 'qwen', label: 'Qwen' },
  { value: 'groq', label: 'Groq' },
];

export default function RequestKeyPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const { submit } = useMyKeyRequests();

  const [provider, setProvider] = useState('openai');
  const [reason, setReason] = useState('');
  const [estimated, setEstimated] = useState<'LIGHT' | 'MEDIUM' | 'HEAVY'>(
    'MEDIUM'
  );
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && !user) {
    router.push('/');
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <Link
          href="/settings/api-keys"
          className="mb-6 inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="h-4 w-4" />
          返回 API Keys
        </Link>

        <h1 className="text-2xl font-semibold text-gray-900">申请使用模型</h1>
        <p className="mt-1 text-sm text-gray-500">
          管理员审批后会授权你使用该 provider 下的一个具体模型。通常 24
          小时内处理。
        </p>

        <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-6">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Provider *
            </label>
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              {PROVIDERS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              使用目的 *
            </label>
            <textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="例如：毕业设计需要使用 GPT-4o 做文献综述"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              预计月度用量 *
            </label>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { v: 'LIGHT', label: '轻度 < $5' },
                  { v: 'MEDIUM', label: '中度 $5-20' },
                  { v: 'HEAVY', label: '重度 > $20' },
                ] as const
              ).map((o) => (
                <label
                  key={o.v}
                  className={`cursor-pointer rounded-md border px-3 py-2 text-center text-sm ${
                    estimated === o.v
                      ? 'border-blue-500 bg-blue-50 font-medium text-blue-700'
                      : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="radio"
                    className="sr-only"
                    checked={estimated === o.v}
                    onChange={() => setEstimated(o.v)}
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">
              备注（可选）
            </label>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <button
            disabled={submitting || !reason.trim()}
            onClick={async () => {
              setSubmitting(true);
              const created = await submit({
                provider,
                reason: reason.trim() || undefined,
                estimatedUsage: estimated,
                note: note.trim() || undefined,
              });
              setSubmitting(false);
              if (created) {
                router.push('/settings/api-keys?tab=requests');
              }
            }}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            {submitting ? '提交中...' : '提交申请'}
          </button>
        </div>
      </div>
    </div>
  );
}
