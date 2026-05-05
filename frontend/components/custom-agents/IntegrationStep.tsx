'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Step 5 — 集成（tools / models / 默认参数）
 *
 * allowed models 至少 1 个（publish 校验）；tools 可空表示走默认全集。
 * defaultDepth/Length/Budget 是 mission 启动时的默认值（PR-E3 翻译）。
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CustomAgentIntegrationConfig, CustomAgentOptions } from './types';

export function IntegrationStep({
  value,
  onChange,
  options,
}: {
  value: CustomAgentIntegrationConfig;
  onChange: (next: CustomAgentIntegrationConfig) => void;
  options: CustomAgentOptions;
}) {
  const [toolFilter, setToolFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');

  const allowedTools = new Set(value.allowedTools ?? []);
  const allowedModels = new Set(value.allowedModels ?? []);

  const toolsByCat = useMemo(() => {
    const f = toolFilter.toLowerCase();
    const matched = options.tools.filter(
      (t) =>
        !f || t.id.toLowerCase().includes(f) || t.name.toLowerCase().includes(f)
    );
    const map = new Map<string, typeof options.tools>();
    for (const t of matched) {
      const arr = map.get(t.category) ?? [];
      arr.push(t);
      map.set(t.category, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [options.tools, toolFilter]);

  const modelsFiltered = useMemo(() => {
    const f = modelFilter.toLowerCase();
    return options.models.filter(
      (m) =>
        !f ||
        m.provider.toLowerCase().includes(f) ||
        m.modelType.toLowerCase().includes(f) ||
        m.patterns.some((p) => p.toLowerCase().includes(f))
    );
  }, [options.models, modelFilter]);

  const toggleTool = (id: string) => {
    const next = new Set(allowedTools);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, allowedTools: Array.from(next) });
  };

  const toggleModel = (id: string) => {
    const next = new Set(allowedModels);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, allowedModels: Array.from(next) });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
          <div>
            <strong>Models</strong> 已选 {allowedModels.size} /{' '}
            {options.models.length}
            （至少 1 个）
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <input
              value={modelFilter}
              onChange={(e) => setModelFilter(e.target.value)}
              className="rounded border border-gray-300 py-1 pl-7 pr-2 text-xs"
              placeholder="搜索 model"
            />
          </div>
        </div>
        <div className="max-h-[260px] overflow-y-auto rounded border border-gray-200">
          {modelsFiltered.map((m) => {
            const id = `${m.provider}:${m.modelType}`;
            const checked = allowedModels.has(id);
            return (
              <label
                key={id}
                className={`flex cursor-pointer items-start gap-2 border-b border-gray-100 px-3 py-2 text-xs hover:bg-gray-50 ${
                  checked ? 'bg-blue-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleModel(id)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <span className="font-mono">{m.provider}</span>
                  <span className="text-gray-400"> · </span>
                  <span className="text-gray-700">{m.modelType}</span>
                  <span className="ml-2 rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                    {m.source}
                  </span>
                  <div className="mt-0.5 text-gray-500">
                    {m.patterns.join(', ')}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between text-xs text-gray-600">
          <div>
            <strong>Tools</strong> 已选 {allowedTools.size} /{' '}
            {options.tools.length}
            （留空 = 默认全集）
          </div>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
            <input
              value={toolFilter}
              onChange={(e) => setToolFilter(e.target.value)}
              className="rounded border border-gray-300 py-1 pl-7 pr-2 text-xs"
              placeholder="搜索 tool"
            />
          </div>
        </div>
        <div className="max-h-[260px] overflow-y-auto rounded border border-gray-200">
          {toolsByCat.map(([cat, tools]) => (
            <div key={cat}>
              <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {cat} <span className="text-gray-400">({tools.length})</span>
              </div>
              {tools.map((t) => {
                const checked = allowedTools.has(t.id);
                return (
                  <label
                    key={t.id}
                    className={`flex cursor-pointer items-start gap-2 border-b border-gray-100 px-3 py-1.5 text-xs hover:bg-gray-50 ${
                      checked ? 'bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleTool(t.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <code className="rounded bg-gray-100 px-1 py-0.5 text-[11px]">
                        {t.id}
                      </code>
                      <span className="ml-2 text-gray-700">{t.name}</span>
                      {t.description && (
                        <p className="mt-0.5 line-clamp-1 text-gray-500">
                          {t.description}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-gray-200 pt-4">
        <div>
          <label className="mb-1 block text-sm font-medium">默认 depth</label>
          <select
            value={value.defaultDepth ?? 'standard'}
            onChange={(e) =>
              onChange({
                ...value,
                defaultDepth: e.target.value as 'quick' | 'standard' | 'deep',
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {options.enums.depths.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">默认 length</label>
          <select
            value={value.defaultLength ?? 'standard'}
            onChange={(e) =>
              onChange({
                ...value,
                defaultLength: e.target
                  .value as CustomAgentIntegrationConfig['defaultLength'],
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {options.enums.lengthProfiles.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">默认 budget</label>
          <select
            value={value.defaultBudget ?? 'medium'}
            onChange={(e) =>
              onChange({
                ...value,
                defaultBudget: e.target
                  .value as CustomAgentIntegrationConfig['defaultBudget'],
              })
            }
            className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
          >
            {options.enums.budgetProfiles.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
