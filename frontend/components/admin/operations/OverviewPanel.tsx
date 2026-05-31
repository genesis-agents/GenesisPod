'use client';

import { DollarSign, Users } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { StatGrid } from '../_shared/admin-tables';
import { AdminPageSection } from '@/components/admin/layout';
import {
  AdminLoadingSkeleton,
  AdminEmptyState,
} from '@/components/admin/shared';
import type { OverviewMetrics } from '@/hooks/domain/useOperationMetrics';

interface OverviewPanelProps {
  data: OverviewMetrics | undefined;
  loading: boolean;
  error: boolean;
}

function fmtNum(n: number): string {
  return n.toLocaleString('en-US');
}

function fmtUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}

export default function OverviewPanel({
  data,
  loading,
  error,
}: OverviewPanelProps) {
  if (loading) return <AdminLoadingSkeleton variant="cards" rows={4} />;

  if (error || !data) {
    return (
      <AdminEmptyState
        icon={Users}
        title="暂无运营数据"
        description="未能加载经营总览指标，请稍后重试。"
      />
    );
  }

  const byModule = [...data.cost.byModule]
    .sort((a, b) => b.costUsd - a.costUsd)
    .map((m) => ({
      module: m.module,
      costUsd: Number(m.costUsd.toFixed(4)),
      tokens: m.tokens,
    }));

  return (
    <div className="space-y-6">
      <AdminPageSection
        title="活跃与增长"
        description="PWAU（近 7 天产出型周活）、今日活跃与今日新增"
      >
        <StatGrid
          items={[
            { label: 'PWAU（7 天产出周活）', value: fmtNum(data.pwau) },
            { label: '今日活跃用户', value: fmtNum(data.todayActive) },
            { label: '今日新增注册', value: fmtNum(data.todayNew) },
            { label: '事件总数', value: fmtNum(data.totalEvents) },
          ]}
        />
      </AdminPageSection>

      <AdminPageSection
        title="成本分布"
        description="数据源为 ai_engine_metrics（唯一成本真源）"
      >
        <StatGrid
          items={[
            { label: '总成本（USD）', value: fmtUsd(data.cost.totalUsd) },
            { label: '计费模块数', value: fmtNum(byModule.length) },
          ]}
        />

        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-700">
            <DollarSign className="h-4 w-4 text-gray-500" />
            按模块成本（USD）
          </div>
          <div className="p-4">
            {byModule.length === 0 ? (
              <AdminEmptyState
                icon={DollarSign}
                title="区间内暂无成本记录"
                description="所选时间窗内 ai_engine_metrics 没有产生成本。"
              />
            ) : (
              <ResponsiveContainer
                width="100%"
                height={Math.max(160, byModule.length * 40 + 40)}
              >
                <BarChart
                  data={byModule}
                  layout="vertical"
                  margin={{ top: 0, right: 48, bottom: 0, left: 8 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v: number) => `$${v}`}
                  />
                  <YAxis
                    type="category"
                    dataKey="module"
                    tick={{ fontSize: 11 }}
                    width={120}
                  />
                  <Tooltip
                    formatter={(value, name) =>
                      name === 'costUsd'
                        ? [fmtUsd(Number(value)), '成本']
                        : [fmtNum(Number(value)), 'Tokens']
                    }
                  />
                  <Bar
                    dataKey="costUsd"
                    fill="hsl(var(--primary))"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </AdminPageSection>
    </div>
  );
}
