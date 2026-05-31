'use client';

import { Suspense } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Activity, Hash, LineChart, TrendingUp } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/layout';
import { AdminTabs, type AdminTab } from '@/components/admin/shared';
import OverviewPanel from '@/components/admin/operations/OverviewPanel';
import ModuleHealthTable from '@/components/admin/operations/ModuleHealthTable';
import TopicsPanel from '@/components/admin/operations/TopicsPanel';
import {
  useOverviewMetrics,
  useModuleHealth,
  useTopicMetrics,
} from '@/hooks/domain/useOperationMetrics';

/**
 * 运营看板（只读经营指标）
 *
 * 对接 /api/v1/admin/dashboard 三个只读端点，三屏分区：
 * - overview（经营总览）：PWAU / 今日活跃 / 今日新增 + 按模块成本
 * - modules（模块健康）：各模块漏斗（发起/完成/失败）+ 完成率
 * - topics（主题运营）：topicKey 频次 top 20
 *
 * 顶部 days 选择器控制三个端点的时间窗（7 / 30 / 90 天）。
 */

type OpsTab = 'overview' | 'modules' | 'topics';

const DAYS_OPTIONS = [7, 30, 90];

function OperationsPageInner() {
  const searchParams = useSearchParams();

  const rawTab = searchParams?.get('tab');
  const tab: OpsTab =
    rawTab === 'modules' || rawTab === 'topics' ? rawTab : 'overview';

  const rawDays = Number(searchParams?.get('days'));
  const days = DAYS_OPTIONS.includes(rawDays) ? rawDays : 30;

  const overview = useOverviewMetrics(days);
  const modules = useModuleHealth(days);
  const topics = useTopicMetrics(days);

  const tabs: AdminTab[] = [
    { key: 'overview', label: '经营总览', icon: TrendingUp },
    { key: 'modules', label: '模块健康', icon: Activity },
    { key: 'topics', label: '主题运营', icon: Hash },
  ];

  return (
    <AdminPageLayout
      title="运营看板"
      description="经营总览、模块健康与主题运营的只读指标"
      icon={LineChart}
      domain="overview"
      actions={<DaysSelector value={days} />}
    >
      <div className="mb-6">
        <AdminTabs tabs={tabs} mode="route" />
      </div>

      {tab === 'overview' && (
        <OverviewPanel
          data={overview.data}
          loading={overview.loading}
          error={Boolean(overview.error)}
        />
      )}

      {tab === 'modules' && (
        <ModuleHealthTable
          rows={modules.data}
          loading={modules.loading}
          error={Boolean(modules.error)}
        />
      )}

      {tab === 'topics' && (
        <TopicsPanel
          rows={topics.data}
          loading={topics.loading}
          error={Boolean(topics.error)}
        />
      )}
    </AdminPageLayout>
  );
}

/** 时间窗选择器 —— 写入 URL ?days=N，复用 AdminTabs 的 route 同步模式 */
function DaysSelector({ value }: { value: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const handleSelect = (days: number) => {
    if (!pathname) return;
    const params = new URLSearchParams(searchParams?.toString() ?? '');
    params.set('days', String(days));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="inline-flex items-center rounded-lg border border-gray-300 bg-white p-1 shadow-sm">
      {DAYS_OPTIONS.map((d) => {
        const isActive = d === value;
        return (
          <button
            key={d}
            type="button"
            onClick={() => handleSelect(d)}
            className={
              isActive
                ? 'rounded-md bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700'
                : 'rounded-md px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }
          >
            {d} 天
          </button>
        );
      })}
    </div>
  );
}

export default function OperationsPage() {
  return (
    <Suspense fallback={null}>
      <OperationsPageInner />
    </Suspense>
  );
}
