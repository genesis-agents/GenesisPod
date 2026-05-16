'use client';

import { useState } from 'react';
import { Plus, Sparkles, Trash2, Power, AlertCircle } from 'lucide-react';
import {
  acceptRecommendedSources,
  createSource,
  deleteSource,
  recommendSources,
  updateSource,
} from '@/services/ai-radar/api';
import type {
  RadarSource,
  RadarSourceType,
  RecommendedSource,
} from '@/services/ai-radar/types';

interface Props {
  topicId: string;
  sources: RadarSource[];
  onReload: () => void;
}

const SOURCE_TYPE_LABEL: Record<RadarSourceType, string> = {
  X: 'X (Twitter)',
  YOUTUBE: 'YouTube',
  RSS: 'RSS',
  CUSTOM: '自定义',
};

const HEALTH_DOT: Record<RadarSource['health'], string> = {
  UNKNOWN: 'bg-gray-300',
  HEALTHY: 'bg-emerald-500',
  DEGRADED: 'bg-amber-500',
  FAILING: 'bg-red-500',
};

function relTime(iso: string | null): string {
  if (!iso) return '从未';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
}

export function RadarSourceList({ topicId, sources, onReload }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [recommendOpen, setRecommendOpen] = useState(false);
  const [recommending, setRecommending] = useState(false);
  const [candidates, setCandidates] = useState<RecommendedSource[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const handleRecommend = async () => {
    setRecommending(true);
    setRecommendOpen(true);
    try {
      const { candidates: cs } = await recommendSources(topicId, 4);
      setCandidates(cs);
      setSelected(new Set(cs.map((_, i) => i)));
    } catch (e) {
      alert('AI 推荐失败：' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRecommending(false);
    }
  };

  const handleAccept = async () => {
    const picked = candidates.filter((_, i) => selected.has(i));
    if (picked.length === 0) {
      setRecommendOpen(false);
      return;
    }
    try {
      await acceptRecommendedSources(topicId, picked);
      setRecommendOpen(false);
      onReload();
    } catch (e) {
      alert('入库失败：' + (e instanceof Error ? e.message : String(e)));
    }
  };

  const handleToggleEnable = async (s: RadarSource) => {
    await updateSource(s.id, { enabled: !s.enabled });
    onReload();
  };

  const handleDelete = async (s: RadarSource) => {
    if (!confirm(`删除数据源 ${s.label || s.identifier}？`)) return;
    await deleteSource(s.id);
    onReload();
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center justify-between border-b border-gray-100 px-3 py-2">
        <h3 className="text-sm font-medium text-gray-700">
          数据源 ({sources.length})
        </h3>
        <div className="flex gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2 py-1 text-[11px] text-cyan-700 hover:bg-cyan-100"
            onClick={handleRecommend}
          >
            <Sparkles className="h-3 w-3" />
            AI 推荐
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] text-gray-600 hover:bg-gray-50"
            onClick={() => setAddOpen(true)}
          >
            <Plus className="h-3 w-3" />
            添加
          </button>
        </div>
      </div>

      {sources.length === 0 ? (
        <div className="px-3 py-6 text-center text-xs text-gray-400">
          还没有数据源。点击「AI 推荐」让 AI 帮你列出候选，或点「添加」手动加。
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {sources.map((s) => (
            <li key={s.id} className="px-3 py-2">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 flex-shrink-0 rounded-full ${HEALTH_DOT[s.health]}`}
                  title={`health: ${s.health}`}
                />
                <span className="rounded bg-gray-50 px-1.5 py-0.5 text-[10px] font-medium text-gray-500">
                  {SOURCE_TYPE_LABEL[s.type]}
                </span>
                {s.isAiRecommended && (
                  <span className="rounded bg-cyan-50 px-1.5 py-0.5 text-[10px] text-cyan-700">
                    AI
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                  {s.label || s.identifier}
                </span>
                <span className="text-[10px] text-gray-400">
                  {relTime(s.lastFetchAt)}
                </span>
              </div>
              {s.lastError && (
                <div className="mt-1 flex items-start gap-1 text-[10px] text-red-600">
                  <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                  <span className="line-clamp-1">{s.lastError}</span>
                </div>
              )}
              <div className="mt-1 flex gap-2">
                <button
                  type="button"
                  className="text-[10px] text-gray-500 hover:text-gray-700"
                  onClick={() => handleToggleEnable(s)}
                >
                  <Power className="inline h-3 w-3" />{' '}
                  {s.enabled ? '禁用' : '启用'}
                </button>
                <button
                  type="button"
                  className="text-[10px] text-red-500 hover:text-red-700"
                  onClick={() => handleDelete(s)}
                >
                  <Trash2 className="inline h-3 w-3" /> 删除
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <AddSourceForm
          topicId={topicId}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            onReload();
          }}
        />
      )}

      {recommendOpen && (
        <RecommendDialog
          loading={recommending}
          candidates={candidates}
          selected={selected}
          onToggle={(i) => {
            const next = new Set(selected);
            if (next.has(i)) next.delete(i);
            else next.add(i);
            setSelected(next);
          }}
          onClose={() => setRecommendOpen(false)}
          onAccept={handleAccept}
        />
      )}
    </div>
  );
}

function AddSourceForm({
  topicId,
  onClose,
  onAdded,
}: {
  topicId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [type, setType] = useState<RadarSourceType>('RSS');
  const [identifier, setIdentifier] = useState('');
  const [label, setLabel] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    if (!identifier.trim()) {
      setError('请填写 identifier');
      return;
    }
    setSubmitting(true);
    try {
      await createSource(topicId, {
        type,
        identifier: identifier.trim(),
        label: label.trim() || undefined,
        enabled: true,
      });
      onAdded();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">添加数据源</h3>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-600">类型</label>
            <div className="mt-1 flex gap-1">
              {(['RSS', 'YOUTUBE', 'X', 'CUSTOM'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  className={`rounded-md border px-2.5 py-1 text-xs ${
                    type === t
                      ? 'border-cyan-300 bg-cyan-50 text-cyan-700'
                      : 'border-gray-200 text-gray-600'
                  }`}
                  onClick={() => setType(t)}
                >
                  {SOURCE_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-600">
              {type === 'X'
                ? 'X handle (@xxx 或 xxx)'
                : type === 'YOUTUBE'
                  ? 'channelId (UC...) 或 youtube.com URL'
                  : 'URL'}
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-600">
              显示名（可选）
            </label>
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
              {error}
            </div>
          )}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={submitting}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white disabled:opacity-60"
            onClick={submit}
          >
            {submitting ? '添加中...' : '添加'}
          </button>
        </div>
      </div>
    </div>
  );
}

function RecommendDialog({
  loading,
  candidates,
  selected,
  onToggle,
  onClose,
  onAccept,
}: {
  loading: boolean;
  candidates: RecommendedSource[];
  selected: Set<number>;
  onToggle: (i: number) => void;
  onClose: () => void;
  onAccept: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl bg-white">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-sm font-semibold text-gray-900">
            AI 推荐数据源（已勾选默认入库）
          </h3>
          <button
            type="button"
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
            onClick={onClose}
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="py-12 text-center text-sm text-gray-400">
              AI 正在生成候选...
            </div>
          ) : candidates.length === 0 ? (
            <div className="py-12 text-center text-sm text-gray-400">
              AI 暂未找到合适的候选源，请手动添加。
            </div>
          ) : (
            <ul className="space-y-2">
              {candidates.map((c, i) => (
                <li
                  key={`${c.type}-${c.identifier}`}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 ${
                    selected.has(i)
                      ? 'border-cyan-300 bg-cyan-50/50'
                      : 'border-gray-200'
                  }`}
                  onClick={() => onToggle(i)}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={selected.has(i)}
                    readOnly
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                        {SOURCE_TYPE_LABEL[c.type]}
                      </span>
                      <span className="text-xs font-medium text-gray-900">
                        {c.label}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        confidence {c.confidence}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-[11px] text-gray-500">
                      {c.identifier}
                    </div>
                    {c.rationale && (
                      <div className="mt-0.5 text-[11px] text-gray-600">
                        {c.rationale}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-600"
            onClick={onClose}
          >
            取消
          </button>
          <button
            type="button"
            disabled={loading || selected.size === 0}
            className="rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white disabled:opacity-60"
            onClick={onAccept}
          >
            添加选中 ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
