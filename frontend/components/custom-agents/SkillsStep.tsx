'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Step 3 — Skills 白/黑名单
 *
 * 来自 ai-engine SkillRegistry（含 SKILL.md 桥接的 prompt skills）。
 * 按 domain 分组展示，多选切换白名单。
 */
import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import type { CustomAgentOptions, CustomAgentSkillsConfig } from './types';

export function SkillsStep({
  value,
  onChange,
  options,
}: {
  value: CustomAgentSkillsConfig;
  onChange: (next: CustomAgentSkillsConfig) => void;
  options: CustomAgentOptions['skills'];
}) {
  const [filter, setFilter] = useState('');
  const allowed = new Set(value.allowedSkillIds ?? []);

  const grouped = useMemo(() => {
    const f = filter.toLowerCase();
    const matched = options.filter(
      (s) =>
        !f ||
        s.id.toLowerCase().includes(f) ||
        s.name.toLowerCase().includes(f) ||
        s.description.toLowerCase().includes(f) ||
        s.domain.toLowerCase().includes(f)
    );
    const map = new Map<string, typeof options>();
    for (const s of matched) {
      const arr = map.get(s.domain) ?? [];
      arr.push(s);
      map.set(s.domain, arr);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [options, filter]);

  const toggle = (id: string) => {
    const next = new Set(allowed);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange({ ...value, allowedSkillIds: Array.from(next) });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <div>
          已选 <strong>{allowed.size}</strong> / {options.length} 个 skill
        </div>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-gray-400" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="rounded border border-gray-300 py-1 pl-7 pr-2 text-xs"
            placeholder="搜索 skill"
          />
        </div>
      </div>

      {options.length === 0 ? (
        <p className="rounded border border-dashed border-gray-300 p-4 text-center text-xs text-gray-500">
          后端 SkillRegistry 为空（启动时未加载到 skill）。请先重启 backend。
        </p>
      ) : (
        <div className="max-h-[420px] overflow-y-auto rounded border border-gray-200">
          {grouped.map(([domain, skills]) => (
            <div key={domain}>
              <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-100 px-3 py-1 text-xs font-medium text-gray-700">
                {domain}{' '}
                <span className="text-gray-400">({skills.length})</span>
              </div>
              {skills.map((s) => {
                const checked = allowed.has(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-start gap-2 border-b border-gray-100 px-3 py-2 hover:bg-gray-50 ${
                      checked ? 'bg-blue-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(s.id)}
                      className="mt-1"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                        <code className="rounded bg-gray-100 px-1 py-0.5 text-xs">
                          {s.id}
                        </code>
                        <span className="truncate">{s.name}</span>
                        <span className="ml-auto rounded bg-gray-200 px-1.5 py-0.5 text-[10px] text-gray-600">
                          {s.layer}
                        </span>
                      </div>
                      {s.description && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
                          {s.description}
                        </p>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
