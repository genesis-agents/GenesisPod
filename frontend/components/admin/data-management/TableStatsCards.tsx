'use client';

import { Database, HardDrive, Trash2, Clock } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { TableStats } from '@/hooks/domain';

interface TableStatsCardsProps {
  stats: TableStats | null;
  loading?: boolean;
}

export default function TableStatsCards({
  stats,
  loading,
}: TableStatsCardsProps) {
  const { t } = useTranslation();

  const cards = [
    {
      id: 'totalTables',
      labelKey: 'admin.tables.stats.totalTables',
      value: stats?.totalTables ?? 0,
      formatted: String(stats?.totalTables ?? 0),
      icon: Database,
      color: 'emerald',
    },
    {
      id: 'totalSize',
      labelKey: 'admin.tables.stats.totalSize',
      value: stats?.totalSizeBytes ?? 0,
      formatted: stats?.totalSizeFormatted ?? '0 B',
      icon: HardDrive,
      color: 'blue',
    },
    {
      id: 'cleanableSpace',
      labelKey: 'admin.tables.stats.cleanableSpace',
      value: stats?.cleanableSizeBytes ?? 0,
      formatted: stats?.cleanableSizeFormatted ?? '0 B',
      icon: Trash2,
      color: 'amber',
    },
    {
      id: 'lastUpdated',
      labelKey: 'admin.tables.stats.lastUpdated',
      value: 0,
      formatted: stats?.lastAnalyzed
        ? new Date(stats.lastAnalyzed).toLocaleTimeString()
        : 'Never',
      icon: Clock,
      color: 'slate',
    },
  ];

  const colorClasses = {
    emerald: {
      bg: 'bg-emerald-50',
      icon: 'bg-emerald-100 text-emerald-600',
      text: 'text-emerald-700',
    },
    blue: {
      bg: 'bg-blue-50',
      icon: 'bg-blue-100 text-blue-600',
      text: 'text-blue-700',
    },
    amber: {
      bg: 'bg-amber-50',
      icon: 'bg-amber-100 text-amber-600',
      text: 'text-amber-700',
    },
    slate: {
      bg: 'bg-slate-50',
      icon: 'bg-slate-100 text-slate-600',
      text: 'text-slate-700',
    },
  };

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => {
        const IconComponent = card.icon;
        const colors = colorClasses[card.color as keyof typeof colorClasses];

        return (
          <div
            key={card.id}
            className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${loading ? 'animate-pulse' : ''}`}
          >
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-gray-500">
                  {t(card.labelKey)}
                </p>
                <p className={`mt-1 text-2xl font-bold ${colors.text}`}>
                  {loading ? '-' : card.formatted}
                </p>
              </div>
              <div className={`rounded-lg p-2.5 ${colors.icon}`}>
                <IconComponent className="h-5 w-5" />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
