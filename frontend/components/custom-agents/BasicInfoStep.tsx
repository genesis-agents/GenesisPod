'use client';

/**
 * E R4 Phase 2 (PR-E1, 2026-05-05): Custom Agent 5 步向导第 1 步
 *
 * 后续 PR-E2 加 Step 2-5（topic schema / skills / pipeline / integration / review）
 */
import { useState } from 'react';
import { apiClient } from '@/lib/api/client';

export interface BasicInfo {
  slug: string;
  displayName: string;
  description: string;
  language: 'zh' | 'en';
  audience: 'general' | 'executive' | 'technical' | 'academic';
  purpose: string;
}

export function BasicInfoStep({
  initial,
  onSaved,
}: {
  initial?: Partial<BasicInfo & { id: string }>;
  onSaved: (id: string) => void;
}) {
  const [form, setForm] = useState<BasicInfo>({
    slug: initial?.slug || '',
    displayName: initial?.displayName || '',
    description: initial?.description || '',
    language: (initial?.language as BasicInfo['language']) || 'zh',
    audience: (initial?.audience as BasicInfo['audience']) || 'general',
    purpose: initial?.purpose || '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!/^[a-z0-9-]+$/.test(form.slug)) {
      setError('slug 必须 kebab-case');
      return;
    }
    if (!form.displayName) {
      setError('显示名必填');
      return;
    }
    setSubmitting(true);
    try {
      if (initial?.id) {
        await apiClient.patch(`/user/custom-agents/${initial.id}`, {
          displayName: form.displayName,
          description: form.description,
          config: { basicInfo: form },
        });
        onSaved(initial.id);
      } else {
        const created = await apiClient.post<{ id: string }>(
          '/user/custom-agents',
          {
            slug: form.slug,
            displayName: form.displayName,
            description: form.description,
            config: { basicInfo: form },
          }
        );
        onSaved(created.id);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">第 1 步 · 基础信息</h2>
      <p className="text-sm text-gray-500">
        后续 4 步：Topic Schema → Skills → Pipeline → Integration →
        Review。本步保存后可继续。
      </p>

      <div>
        <label className="mb-1 block text-sm font-medium">Slug *</label>
        <input
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          disabled={!!initial?.id}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
          placeholder="e.g. my-research-agent"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">显示名 *</label>
        <input
          value={form.displayName}
          onChange={(e) => setForm({ ...form, displayName: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">描述</label>
        <textarea
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">语言</label>
          <select
            value={form.language}
            onChange={(e) =>
              setForm({
                ...form,
                language: e.target.value as BasicInfo['language'],
              })
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">受众</label>
          <select
            value={form.audience}
            onChange={(e) =>
              setForm({
                ...form,
                audience: e.target.value as BasicInfo['audience'],
              })
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="general">一般</option>
            <option value="executive">高管</option>
            <option value="technical">技术</option>
            <option value="academic">学术</option>
          </select>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">用途</label>
        <input
          value={form.purpose}
          onChange={(e) => setForm({ ...form, purpose: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. 分析竞品定价策略"
        />
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={submit}
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '保存中...' : '保存并下一步'}
        </button>
      </div>
    </div>
  );
}
