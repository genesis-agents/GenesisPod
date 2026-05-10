'use client';

import { Cloud, Database, HardDrive, Layers } from 'lucide-react';

type StatColor = 'emerald' | 'blue' | 'amber' | 'violet' | 'slate';

interface StorageStatsCardsProps {
  dbSizeFormatted: string;
  dbTableCount: number;
  r2SizeFormatted: string;
  r2ObjectCount: number;
  r2Configured: boolean;
  r2Bucket: string | null;
  managedTargets: number;
  managedPrefixes: number;
  observedPrefixes: number;
  observedOnlyPrefixes: number;
  loading?: boolean;
}

export default function StorageStatsCards({
  dbSizeFormatted,
  dbTableCount,
  r2SizeFormatted,
  r2ObjectCount,
  r2Configured,
  r2Bucket,
  managedTargets,
  managedPrefixes,
  observedPrefixes,
  observedOnlyPrefixes,
  loading,
}: StorageStatsCardsProps) {
  const cards: Array<{
    id: string;
    label: string;
    value: string;
    hint: string;
    icon: typeof Database;
    color: StatColor;
  }> = [
    {
      id: 'db',
      label: '数据库占用',
      value: dbSizeFormatted,
      hint: `${dbTableCount} 张表纳入统计`,
      icon: Database,
      color: 'emerald',
    },
    {
      id: 'r2',
      label: 'R2 对象存储',
      value: r2SizeFormatted,
      hint: r2Configured
        ? `${r2ObjectCount.toLocaleString()} 个对象 · ${r2Bucket ?? 'bucket'}`
        : 'R2 未配置',
      icon: Cloud,
      color: r2Configured ? 'blue' : 'amber',
    },
    {
      id: 'targets',
      label: '受管 Offload 目标',
      value: String(managedTargets),
      hint: `${managedPrefixes} 个注册前缀`,
      icon: HardDrive,
      color: 'violet',
    },
    {
      id: 'prefixes',
      label: 'R2 前缀总览',
      value: String(observedPrefixes),
      hint: `${observedOnlyPrefixes} 个仅观测前缀`,
      icon: Layers,
      color: 'slate',
    },
  ];

  const colorClasses: Record<StatColor, { icon: string; text: string }> = {
    emerald: {
      icon: 'bg-emerald-100 text-emerald-600',
      text: 'text-emerald-700',
    },
    blue: { icon: 'bg-blue-100 text-blue-600', text: 'text-blue-700' },
    amber: { icon: 'bg-amber-100 text-amber-600', text: 'text-amber-700' },
    violet: { icon: 'bg-violet-100 text-violet-600', text: 'text-violet-700' },
    slate: { icon: 'bg-slate-100 text-slate-600', text: 'text-slate-700' },
  };

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        const colors = colorClasses[card.color];
        return (
          <div
            key={card.id}
            className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
              loading ? 'animate-pulse' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-500">
                  {card.label}
                </p>
                <p className={`mt-1 text-2xl font-bold ${colors.text}`}>
                  {loading ? '-' : card.value}
                </p>
                <p className="mt-1 truncate text-xs text-gray-400">
                  {card.hint}
                </p>
              </div>
              <div className={`rounded-lg p-2.5 ${colors.icon}`}>
                <Icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
