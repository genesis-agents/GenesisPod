'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Step 4 — Pipeline primitive 序列
 *
 * 当前 mission 14-stage 是固定 hard-wire（playground.config.ts），所以本 step
 * 配置仅作为元信息记录用户意图；PR-E3 后会做翻译，未来若 dispatcher 支持
 * 自定义 pipeline 再让本 step 真正生效。
 */
import { Plus, Trash2 } from 'lucide-react';
import { EmptyState } from '@/components/ui/states/EmptyState';
import type {
  CustomAgentOptions,
  CustomAgentPipelineConfig,
  CustomAgentPrimitive,
} from './types';

export function PipelineStep({
  value,
  onChange,
  primitives,
}: {
  value: CustomAgentPipelineConfig;
  onChange: (next: CustomAgentPipelineConfig) => void;
  primitives: CustomAgentOptions['primitives'];
}) {
  const steps = value.steps ?? [];

  const update = (
    idx: number,
    patch: Partial<{
      id: string;
      primitive: CustomAgentPrimitive;
      roleId: string;
    }>
  ) => {
    const next = steps.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ ...value, steps: next });
  };

  const add = () => {
    onChange({
      ...value,
      steps: [
        ...steps,
        {
          id: `step-${steps.length + 1}`,
          primitive: 'plan' as CustomAgentPrimitive,
        },
      ],
    });
  };

  const remove = (idx: number) => {
    onChange({ ...value, steps: steps.filter((_, i) => i !== idx) });
  };

  const move = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= steps.length) return;
    const next = [...steps];
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange({ ...value, steps: next });
  };

  return (
    <div className="space-y-4">
      <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
        当前 mission 是固定 14-stage pipeline（playground.config）。本 step
        配置作为元信息记录意图，后续会切到自定义 pipeline 时启用。
      </div>

      <div className="flex items-center justify-between">
        <label className="text-sm font-medium">Pipeline Steps</label>
        <button
          onClick={add}
          type="button"
          className="inline-flex items-center gap-1 rounded border border-gray-300 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50"
        >
          <Plus className="h-3 w-3" /> 添加 step
        </button>
      </div>

      {steps.length === 0 ? (
        <EmptyState title="至少配置 1 个 step 才能 publish。" size="sm" />
      ) : (
        <div className="space-y-2">
          {steps.map((s, idx) => (
            <div
              key={idx}
              className="flex items-start gap-2 rounded border border-gray-200 bg-white p-2"
            >
              <div className="flex flex-col text-gray-400">
                <button
                  onClick={() => move(idx, -1)}
                  type="button"
                  disabled={idx === 0}
                  className="px-1 text-xs hover:text-gray-700 disabled:opacity-30"
                >
                  ↑
                </button>
                <button
                  onClick={() => move(idx, 1)}
                  type="button"
                  disabled={idx === steps.length - 1}
                  className="px-1 text-xs hover:text-gray-700 disabled:opacity-30"
                >
                  ↓
                </button>
              </div>
              <div className="grid flex-1 grid-cols-3 gap-2">
                <input
                  value={s.id}
                  onChange={(e) => update(idx, { id: e.target.value })}
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                  placeholder="step id"
                />
                <select
                  value={s.primitive}
                  onChange={(e) =>
                    update(idx, {
                      primitive: e.target.value as CustomAgentPrimitive,
                    })
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                >
                  {primitives.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} — {p.description}
                    </option>
                  ))}
                </select>
                <input
                  value={s.roleId ?? ''}
                  onChange={(e) =>
                    update(idx, { roleId: e.target.value || undefined })
                  }
                  className="rounded border border-gray-300 px-2 py-1 text-xs"
                  placeholder="role id (optional)"
                />
              </div>
              <button
                onClick={() => remove(idx)}
                type="button"
                className="text-red-500 hover:text-red-700"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">备注</label>
        <textarea
          value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={2}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="为什么这样组织 pipeline"
        />
      </div>
    </div>
  );
}
