'use client';

import { useState } from 'react';
import { X, Plus } from 'lucide-react';
import { createTopic } from '@/services/ai-radar/api';
import type {
  CreateRadarTopicInput,
  RadarEntityType,
  RadarTopic,
} from '@/services/ai-radar/types';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (topic: RadarTopic) => void;
}

const ENTITY_TYPES: Array<{ value: RadarEntityType; label: string }> = [
  { value: 'topic', label: '话题' },
  { value: 'company', label: '公司' },
  { value: 'product', label: '产品' },
  { value: 'person', label: '人物' },
  { value: 'event', label: '事件' },
];

const CRON_PRESETS = [
  { value: '0 */6 * * *', label: '每 6 小时' },
  { value: '0 */12 * * *', label: '每 12 小时' },
  { value: '0 0 * * *', label: '每天 0 点' },
  { value: '0 */2 * * *', label: '每 2 小时（高频）' },
];

export function CreateRadarTopicModal({ open, onClose, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [entityType, setEntityType] = useState<RadarEntityType>('topic');
  const [keywordsRaw, setKeywordsRaw] = useState('');
  const [refreshCron, setRefreshCron] = useState('0 */6 * * *');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async () => {
    setError(null);
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      setError('主题名称至少 2 个字符');
      return;
    }
    const keywords = keywordsRaw
      .split(/[,，\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (keywords.length === 0) {
      setError('至少需要 1 个关键词');
      return;
    }
    const input: CreateRadarTopicInput = {
      name: trimmedName,
      description: description.trim() || undefined,
      entityType,
      keywords,
      refreshCron,
    };
    setSubmitting(true);
    try {
      const topic = await createTopic(input);
      onCreated(topic);
      setName('');
      setDescription('');
      setKeywordsRaw('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              创建 AI 雷达主题
            </h2>
            <p className="mt-1 text-xs text-gray-500">
              针对一个对象/话题/实体持续监控多源数据
            </p>
          </div>
          <button
            type="button"
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700">
              主题名称 *
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              placeholder="例：GPT-5 发布动态 / OpenAI 公司动态"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={160}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">
              对象类型
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {ENTITY_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    entityType === t.value
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => setEntityType(t.value)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">
              关键词 *（用空格 / 逗号分隔，≤20 个）
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              placeholder="GPT-5, OpenAI, Sam Altman"
              value={keywordsRaw}
              onChange={(e) => setKeywordsRaw(e.target.value)}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">
              详细描述（可选）
            </label>
            <textarea
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              rows={3}
              placeholder="希望关注的角度、排除项、目标用途等"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700">
              刷新频率
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {CRON_PRESETS.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    refreshCron === p.value
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => setRefreshCron(p.value)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700 disabled:opacity-60"
            onClick={handleSubmit}
          >
            <Plus className="h-4 w-4" />
            {submitting ? '创建中...' : '创建主题'}
          </button>
        </div>
      </div>
    </div>
  );
}
