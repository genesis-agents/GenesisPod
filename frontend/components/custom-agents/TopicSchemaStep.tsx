'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Step 2 — 话题维度
 *
 * Leader 在 S2 plan 时仍然自己规划 dimensions；这里配置作为 hint
 * 注入到 mission topic 后缀（PR-E3 翻译时拼接）。
 */
import { Plus, Trash2 } from 'lucide-react';
import type { CustomAgentTopicSchema } from './types';
import { EmptyState } from '@/components/ui/states/EmptyState';

export function TopicSchemaStep({
  value,
  onChange,
}: {
  value: CustomAgentTopicSchema;
  onChange: (next: CustomAgentTopicSchema) => void;
}) {
  const dims = value.dimensions ?? [];

  const updateDim = (
    idx: number,
    patch: Partial<{ name: string; description: string }>
  ) => {
    const next = dims.map((d, i) => (i === idx ? { ...d, ...patch } : d));
    onChange({ ...value, dimensions: next });
  };

  const addDim = () => {
    onChange({
      ...value,
      dimensions: [...dims, { name: '', description: '' }],
    });
  };

  const removeDim = (idx: number) => {
    onChange({
      ...value,
      dimensions: dims.filter((_, i) => i !== idx),
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">目标模板</label>
        <textarea
          value={value.goalTemplate ?? ''}
          onChange={(e) => onChange({ ...value, goalTemplate: e.target.value })}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. 聚焦该话题的市场规模、增速、头部玩家与监管风险"
        />
        <p className="mt-1 text-xs text-gray-500">
          启动 mission 时拼接到 topic 后："{'{user_topic}'}（聚焦：
          {'{goalTemplate}'}）"
        </p>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <label className="text-sm font-medium">研究维度</label>
          <button
            onClick={addDim}
            type="button"
            className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
          >
            <Plus className="h-3 w-3" /> 添加维度
          </button>
        </div>
        {dims.length === 0 ? (
          <EmptyState
            title="尚未配置维度"
            description="至少 1 个维度才能 publish。"
            size="sm"
          />
        ) : (
          <div className="space-y-2">
            {dims.map((d, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 p-2"
              >
                <div className="flex-1 space-y-1">
                  <input
                    value={d.name}
                    onChange={(e) => updateDim(idx, { name: e.target.value })}
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-sm"
                    placeholder="维度名（如：市场规模）"
                  />
                  <input
                    value={d.description ?? ''}
                    onChange={(e) =>
                      updateDim(idx, { description: e.target.value })
                    }
                    className="w-full rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-700"
                    placeholder="（可选）维度描述"
                  />
                </div>
                <button
                  onClick={() => removeDim(idx)}
                  type="button"
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
