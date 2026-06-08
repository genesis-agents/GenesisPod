'use client';

/**
 * DeepInsightTeamPanel — 深度洞察左栏（下沉自公司 MissionReportView 内联 leftPanel）。
 *
 * 组装：canonical TeamTopologyCanvas（DAG）+ ScoreVerdictPanel + 维度/引用/事实
 * 计数 + DimensionsPanel + ReviewNotesPanel + 底部 MissionActionGroup。
 *
 * 纯渲染：吃归一契约字段（team / score / dimensions / reviewNotes / actions +
 * 计数所需 referenceCount / factCount），不持有运行态。折叠由 L4 传 onCollapse 控制。
 */

import { ChevronLeft } from 'lucide-react';
import { TeamTopologyCanvas } from '@/components/common/team-topology';
import {
  MissionActionGroup,
  type MissionActionButtonSpec,
} from '@/components/common/mission-detail';
import {
  ScoreVerdictPanel,
  DimensionsPanel,
  ReviewNotesPanel,
} from '../panels';
import type { TeamTopologyView, Verdict, MissionAction } from '../contract';

export interface DeepInsightTeamPanelProps {
  team: TeamTopologyView;
  score?: { value: number; verdict: Verdict };
  dimensions: string[];
  reviewNotes: string[];
  referenceCount: number;
  factCount: number;
  actions?: MissionAction[];
  /** 收起团队面板（由 L4 frame 的 leftCollapsed 状态驱动）。 */
  onCollapse?: () => void;
  /** SVG pattern id 前缀（避免多实例冲突）。 */
  patternId?: string;
}

export function DeepInsightTeamPanel({
  team,
  score,
  dimensions,
  reviewNotes,
  referenceCount,
  factCount,
  actions,
  onCollapse,
  patternId = 'deep-insight-mission',
}: DeepInsightTeamPanelProps) {
  const actionButtons: MissionActionButtonSpec[] = (actions ?? []).map((a) => ({
    variant: a.variant,
    emoji: a.emoji,
    label: a.label,
    title: a.title,
    disabled: a.disabled,
    emphasized: a.emphasized,
    onClick: a.onClick,
  }));

  return (
    <div className="flex h-full w-full flex-col">
      {/* header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-3 py-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          研究团队
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400">
            {team.agentCount} 个 Agent
          </span>
          {onCollapse && (
            <button
              type="button"
              onClick={onCollapse}
              className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
              title="收起团队面板"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* 组织架构图（DAG）— 常驻 */}
      <div className="shrink-0 border-b border-gray-100 px-3 py-3">
        <TeamTopologyCanvas
          nodes={team.nodes}
          rows={team.rows}
          connections={team.connections}
          heightClass={team.heightClass}
          viewBoxHeight={team.viewBoxHeight}
          rowYPositions={team.rowYPositions}
          patternId={patternId}
        />
      </div>

      {/* 评分 + 计数 + 维度 + 评审意见 — 滚动区 */}
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex justify-center">
            <ScoreVerdictPanel score={score} />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-base font-bold text-gray-900">
                {dimensions.length}
              </div>
              <div className="text-xs text-gray-400">维度</div>
            </div>
            <div>
              <div className="text-base font-bold text-gray-900">
                {referenceCount}
              </div>
              <div className="text-xs text-gray-400">引用</div>
            </div>
            <div>
              <div className="text-base font-bold text-gray-900">
                {factCount}
              </div>
              <div className="text-xs text-gray-400">事实</div>
            </div>
          </div>
        </div>

        <DimensionsPanel dimensions={dimensions} />
        <ReviewNotesPanel notes={reviewNotes} />
      </div>

      {/* 底部操作按钮 — shrink-0 常驻 */}
      {actionButtons.length > 0 && (
        <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
          <MissionActionGroup buttons={actionButtons} />
        </div>
      )}
    </div>
  );
}

export default DeepInsightTeamPanel;
