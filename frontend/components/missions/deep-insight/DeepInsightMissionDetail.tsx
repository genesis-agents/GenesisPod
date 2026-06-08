'use client';

/**
 * DeepInsightMissionDetail（L4）— 深度洞察能力的唯一对外成品入口。
 *
 * 规范：docs/architecture/frontend/mission-ui-capability-architecture.md §2 L4。
 *
 * 只吃归一契约 DeepInsightMissionView（由 fromCompanyMissionResult /
 * fromPlaygroundMissionView 产出），用 canonical MissionDetailFrame 组装：
 *   左栏  → DeepInsightTeamPanel（拓扑 + 评分 + 维度 + 评审 + 操作）
 *   右栏  → 5 tab：任务列表 / 输出报告 / 参考文献 / 事实表 / 算力消耗
 *
 * 应用页退化成「取数 → adapter → <DeepInsightMissionDetail data />」。
 * 富 artifact 三视图（playground ArtifactReader）走可选 reportSlot 旁路注入，
 * 不传则报告 tab 用契约 report markdown 的简版 ReportPanel。
 */

import { useMemo, useState } from 'react';
import {
  ListChecks,
  FileText,
  Layers,
  Coins,
  Database,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { StatusBadge, type BadgeTone } from '@/components/ui/badges';
import {
  MissionDetailFrame,
  MissionTaskList,
  type MissionTaskColumn,
} from '@/components/common/mission-detail';
import { MODULE_THEMES } from '@/lib/design/module-themes';
import { DeepInsightTeamPanel } from './left/DeepInsightTeamPanel';
import {
  ReportPanel,
  ReferencesPanel,
  FactTablePanel,
  ComputeUsagePanel,
} from './panels';
import type { DeepInsightMissionView, MissionStep } from './contract';

type TabKey = 'tasks' | 'report' | 'references' | 'facts' | 'cost';

const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
  { key: 'tasks', label: '任务列表', Icon: ListChecks },
  { key: 'report', label: '输出报告', Icon: FileText },
  { key: 'references', label: '参考文献', Icon: Layers },
  { key: 'facts', label: '事实表', Icon: Database },
  { key: 'cost', label: '算力消耗', Icon: Coins },
];

const STEP_STATUS: Record<
  MissionStep['status'],
  { tone: BadgeTone; label: string; bar: string }
> = {
  done: { tone: 'success', label: '已完成', bar: 'border-l-emerald-400' },
  failed: { tone: 'danger', label: '失败', bar: 'border-l-rose-400' },
  skipped: { tone: 'neutral', label: '跳过', bar: 'border-l-gray-300' },
};

const STATUS_PILL: Record<
  DeepInsightMissionView['status'],
  { dot: string; bg: string; text: string; label: string }
> = {
  running: {
    dot: 'bg-blue-500 animate-pulse',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    label: '进行中',
  },
  done: {
    dot: 'bg-emerald-500',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    label: '已完成',
  },
  failed: {
    dot: 'bg-rose-500',
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    label: '失败',
  },
};

export interface DeepInsightMissionDetailProps {
  data: DeepInsightMissionView;
  onBack?: () => void;
  /**
   * 报告 tab 富 artifact 旁路（规范 playgroundWire §③ 路 b）：playground 可注入
   * ArtifactReader 以保留三视图/版本切换；不传则用契约 report markdown 简版。
   */
  reportSlot?: React.ReactNode;
  /** 参考文献锚点 id 生成器（playground citationNavigation 用）。 */
  getReferenceAnchorId?: (
    ref: DeepInsightMissionView['references'][number],
    index: number
  ) => string | undefined;
}

export function DeepInsightMissionDetail({
  data,
  onBack,
  reportSlot,
  getReferenceAnchorId,
}: DeepInsightMissionDetailProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('tasks');
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  const taskColumns: MissionTaskColumn<MissionStep>[] = useMemo(
    () => [
      {
        key: 'index',
        label: '#',
        className: 'w-10 text-center',
        render: (_s, i) => <span className="text-gray-400">{i + 1}</span>,
      },
      {
        key: 'label',
        label: '任务',
        className: 'w-[42%]',
        render: (s) => (
          <span className="font-medium text-gray-800">{s.label}</span>
        ),
      },
      {
        key: 'role',
        label: '负责人',
        className: 'w-[18%]',
        render: (s) => <span className="text-gray-600">{s.role}</span>,
      },
      {
        key: 'dimension',
        label: '维度',
        className: 'w-[22%]',
        render: (s) => (
          <span className="text-gray-500">{s.dimension ?? '—'}</span>
        ),
      },
      {
        key: 'status',
        label: '状态',
        className: 'w-[18%]',
        render: (s) => {
          const m = STEP_STATUS[s.status];
          return <StatusBadge tone={m.tone} label={m.label} />;
        },
      },
    ],
    []
  );

  const leftPanel = (
    <DeepInsightTeamPanel
      team={data.team}
      score={data.score}
      dimensions={data.dimensions}
      reviewNotes={data.reviewNotes}
      referenceCount={data.references.length}
      factCount={data.facts.length}
      actions={data.actions}
      onCollapse={() => setLeftCollapsed(true)}
      patternId={`deep-insight-${data.id || 'mission'}`}
    />
  );

  const pill = STATUS_PILL[data.status];
  const statusPill = (
    <div
      className={cn(
        'flex items-center gap-2 rounded-full px-3 py-1.5',
        pill.bg
      )}
    >
      <span className={cn('h-2 w-2 rounded-full', pill.dot)} />
      <span className={cn('text-sm font-medium', pill.text)}>
        {data.statusDetail ?? pill.label}
      </span>
    </div>
  );

  const subtitle = (
    <>
      <span>{data.dimensions.length} 维度</span>
      <span>·</span>
      <span>{data.references.length} 引用</span>
      {data.createdAt ? (
        <>
          <span>·</span>
          <span>{new Date(data.createdAt).toLocaleString()}</span>
        </>
      ) : null}
    </>
  );

  return (
    <MissionDetailFrame<TabKey>
      onBack={() => onBack?.()}
      backTitle="返回任务列表"
      brandGradient={MODULE_THEMES.ask.gradient}
      HeaderIcon={FileText}
      title={
        <span title={typeof data.title === 'string' ? data.title : undefined}>
          {data.title}
        </span>
      }
      subtitle={subtitle}
      statusPill={statusPill}
      tabs={TABS}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      leftPanel={leftPanel}
      leftCollapsed={leftCollapsed}
      onLeftCollapseToggle={() => setLeftCollapsed((v) => !v)}
    >
      <div className="px-6 py-5">
        {activeTab === 'tasks' && (
          <MissionTaskList<MissionStep>
            items={data.steps}
            columns={taskColumns}
            getRowKey={(s) => `${s.role}-${s.label}`}
            getRowClassName={(s) => cn('border-l-4', STEP_STATUS[s.status].bar)}
            emptyTitle="暂无执行步骤"
            emptyDescription="该任务未记录逐步骤执行轨迹"
          />
        )}

        {activeTab === 'report' &&
          (reportSlot ?? <ReportPanel report={data.report} />)}

        {activeTab === 'references' && (
          <ReferencesPanel
            references={data.references}
            getAnchorId={getReferenceAnchorId}
          />
        )}

        {activeTab === 'facts' && (
          <FactTablePanel
            facts={data.facts}
            reconciliationReport={data.reconciliationReport}
          />
        )}

        {activeTab === 'cost' && (
          <ComputeUsagePanel steps={data.steps} usage={data.usage} />
        )}
      </div>
    </MissionDetailFrame>
  );
}

export default DeepInsightMissionDetail;
