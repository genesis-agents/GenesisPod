'use client';

import { ArrowRight, Database } from 'lucide-react';

interface OffloadFieldStat {
  table: string;
  field: string;
  uriField: string;
  r2Prefix: string;
  totalRows: number;
  rowsWithUri: number;
  rowsWithDbContent: number;
}

interface StoragePipelineGridProps {
  rows: OffloadFieldStat[];
  loading?: boolean;
}

const STATE_COLORS = {
  Complete: 'bg-emerald-100 text-emerald-700',
  Active: 'bg-blue-100 text-blue-700',
  Pending: 'bg-amber-100 text-amber-700',
} as const;

function deriveState(row: OffloadFieldStat): keyof typeof STATE_COLORS {
  if (row.rowsWithDbContent === 0) return 'Complete';
  if (row.rowsWithUri === 0) return 'Pending';
  return 'Active';
}

export default function StoragePipelineGrid({
  rows,
  loading,
}: StoragePipelineGridProps) {
  const columns = [
    { key: 'field', label: 'Field', width: 'w-[260px]' },
    { key: 'route', label: 'R2 Route', width: 'w-[280px]' },
    {
      key: 'totalRows',
      label: 'Total Rows',
      width: 'w-[110px]',
      align: 'right',
    },
    { key: 'migrated', label: 'Migrated', width: 'w-[110px]', align: 'right' },
    { key: 'remaining', label: 'In DB', width: 'w-[110px]', align: 'right' },
    { key: 'coverage', label: 'Coverage', width: 'w-[200px]' },
    { key: 'status', label: 'Status', width: 'w-[100px]' },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${col.width} px-4 py-3 text-xs font-semibold uppercase tracking-wider text-gray-600 ${
                    col.align === 'right' ? 'text-right' : 'text-left'
                  }`}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 bg-white">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  {columns.map((col) => (
                    <td key={col.key} className="px-4 py-3">
                      <div className="h-5 rounded bg-gray-200" />
                    </td>
                  ))}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center">
                  <Database className="mx-auto h-12 w-12 text-gray-300" />
                  <p className="mt-2 text-sm text-gray-500">
                    暂无注册的 Offload 目标
                  </p>
                </td>
              </tr>
            ) : (
              rows.map((row) => {
                const state = deriveState(row);
                const progress =
                  row.totalRows > 0
                    ? (row.rowsWithUri / row.totalRows) * 100
                    : 0;
                const barColor =
                  progress >= 95
                    ? 'bg-emerald-500'
                    : progress >= 50
                      ? 'bg-blue-500'
                      : 'bg-amber-500';
                return (
                  <tr
                    key={`${row.table}.${row.field}`}
                    className="transition-colors hover:bg-gray-50"
                  >
                    {/* Field */}
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm font-medium text-gray-900">
                        {row.table}.{row.field}
                      </div>
                      <div className="font-mono mt-0.5 text-xs text-gray-400">
                        {row.uriField}
                      </div>
                    </td>

                    {/* R2 Route */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="font-mono rounded bg-gray-100 px-2 py-0.5 text-gray-700">
                          {row.field}
                        </span>
                        <ArrowRight className="h-3 w-3 text-gray-400" />
                        <span className="font-mono rounded bg-blue-50 px-2 py-0.5 text-blue-700">
                          {row.r2Prefix}
                        </span>
                      </div>
                    </td>

                    {/* Total Rows */}
                    <td className="px-4 py-3 text-right text-sm text-gray-600">
                      {row.totalRows.toLocaleString()}
                    </td>

                    {/* Migrated */}
                    <td className="px-4 py-3 text-right text-sm font-medium text-emerald-700">
                      {row.rowsWithUri.toLocaleString()}
                    </td>

                    {/* Remaining */}
                    <td className="px-4 py-3 text-right text-sm text-amber-600">
                      {row.rowsWithDbContent > 0
                        ? row.rowsWithDbContent.toLocaleString()
                        : '-'}
                    </td>

                    {/* Coverage */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200">
                          <div
                            className={`h-full rounded-full ${barColor}`}
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                        <span className="w-10 text-right text-xs font-medium text-gray-600">
                          {progress.toFixed(0)}%
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[state]}`}
                      >
                        {state}
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
