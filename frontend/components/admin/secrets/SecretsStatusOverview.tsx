'use client';

import { useState, useMemo } from 'react';
import {
  Search,
  RefreshCw,
  CheckCircle2,
  XCircle,
  CircleHelp,
  CirclePause,
} from 'lucide-react';
import {
  useAdminSecrets,
  type SecretCategory,
} from '@/hooks/domain/useAdminSecrets';

/**
 * 状态总览 TAB（设计文档 §4.5.0/§4.5.0b/§4.5.0c）
 *
 * 极简：仅显示 NAME / CATEGORY / STATUS（聚合徽章），无操作引导杂物。
 * 操作（Add/Edit/Delete/Rotate）全部在 KEY 管理 TAB 内。
 *
 * NB: 当前 STATUS 来自 Secret.isActive（旧字段）。P3 业务侧切到 SecretKey 后，
 *     这里聚合 SecretKey.testStatus 形成更细粒度状态。
 */

const CATEGORY_LABEL: Record<SecretCategory, string> = {
  AI_MODEL: 'AI Model',
  SEARCH: 'Search',
  EXTRACTION: 'Content Extraction',
  YOUTUBE: 'YouTube',
  TTS: 'Text-to-Speech',
  SKILLSMP: 'SkillsMP',
  POLICY: 'Policy Research',
  FINANCE: 'Finance Data',
  ACADEMIC: 'Academic',
  WEATHER: 'Weather',
  IMAGE_SEARCH: 'Image Search',
  DEV_TOOLS: 'Dev Tools',
  MCP: 'MCP Server',
  USER_DONATED: 'User Donated',
  OTHER: 'Other',
};

type StatusFilter = 'ALL' | 'active' | 'failed' | 'unknown' | 'disabled';

export function SecretsStatusOverview() {
  const {
    secrets,
    isRefreshing: listLoading,
    refreshSecrets,
  } = useAdminSecrets();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<SecretCategory | 'ALL'>(
    'ALL'
  );
  const [sortBy, setSortBy] = useState<'name' | 'status'>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const filtered = (secrets ?? []).filter((s) => {
      const matchSearch =
        s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.displayName.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory =
        categoryFilter === 'ALL' || s.category === categoryFilter;
      const status = s.isActive ? 'active' : 'disabled';
      const matchStatus = statusFilter === 'ALL' || statusFilter === status;
      return matchSearch && matchCategory && matchStatus;
    });

    const sorted = [...filtered].sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortBy === 'status') {
        const sa = a.isActive ? 0 : 1;
        const sb = b.isActive ? 0 : 1;
        if (sa !== sb) return (sa - sb) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    });
    return sorted;
  }, [secrets, searchTerm, statusFilter, categoryFilter, sortBy, sortDir]);

  const summary = useMemo(() => {
    const total = secrets?.length ?? 0;
    const active = (secrets ?? []).filter((s) => s.isActive).length;
    const disabled = total - active;
    return { total, active, disabled };
  }, [secrets]);

  const toggleSort = (col: 'name' | 'status') => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
  };

  const allSelected =
    rows.length > 0 && rows.every((r) => selectedIds.has(r.id));
  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allSelected) rows.forEach((r) => next.delete(r.id));
      else rows.forEach((r) => next.add(r.id));
      return next;
    });
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name…"
            className="w-full rounded-md border py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <select
          value={categoryFilter}
          onChange={(e) =>
            setCategoryFilter(e.target.value as SecretCategory | 'ALL')
          }
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="ALL">All categories</option>
          {Object.entries(CATEGORY_LABEL).map(([v, label]) => (
            <option key={v} value={v}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-md border px-3 py-2 text-sm"
        >
          <option value="ALL">All statuses</option>
          <option value="active">Active</option>
          <option value="disabled">Disabled</option>
        </select>
        <button
          onClick={() => void refreshSecrets()}
          disabled={listLoading}
          className="inline-flex items-center gap-1.5 rounded-md bg-gray-100 px-3 py-2 text-sm hover:bg-gray-200 disabled:opacity-50"
        >
          <RefreshCw
            className={`h-4 w-4 ${listLoading ? 'animate-spin' : ''}`}
          />
          Refresh
        </button>
      </div>

      <div className="overflow-x-auto rounded-md border border-gray-200">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-600">
            <tr>
              <th className="w-8 px-3 py-2">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleSelectAll}
                  aria-label="select all"
                />
              </th>
              <th
                className="cursor-pointer px-3 py-2 text-left hover:text-gray-900"
                onClick={() => toggleSort('name')}
              >
                Name {sortBy === 'name' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
              <th className="px-3 py-2 text-left">Category</th>
              <th
                className="cursor-pointer px-3 py-2 text-left hover:text-gray-900"
                onClick={() => toggleSort('status')}
              >
                Status {sortBy === 'status' && (sortDir === 'asc' ? '↑' : '↓')}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.length === 0 && !listLoading && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-gray-400">
                  No secrets match the current filters.
                </td>
              </tr>
            )}
            {rows.map((s) => (
              <tr key={s.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(s.id)}
                    onChange={() => toggleRow(s.id)}
                    aria-label={`select ${s.name}`}
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium text-gray-900">
                    {s.displayName}
                  </div>
                  <div className="font-mono text-xs text-gray-500">
                    {s.name}
                  </div>
                </td>
                <td className="px-3 py-2 text-gray-700">
                  {CATEGORY_LABEL[s.category] ?? s.category}
                  {s.provider && (
                    <span className="text-gray-400"> · {s.provider}</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {s.isActive ? (
                    <span className="inline-flex items-center gap-1 rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                      <CheckCircle2 className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                      <CirclePause className="h-3 w-3" /> Disabled
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between px-1 text-xs text-gray-600">
        <div>
          {summary.total} total · {summary.active} active · {summary.disabled}{' '}
          disabled
        </div>
        <div>{selectedIds.size > 0 && `${selectedIds.size} selected`}</div>
      </div>
    </div>
  );
}
