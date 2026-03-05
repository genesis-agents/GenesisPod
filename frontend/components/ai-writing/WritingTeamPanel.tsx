'use client';

/**
 * WritingTeamPanel - AI Writing team SVG visualization
 *
 * Extracted from app/ai-writing/[id]/page.tsx inline HTML/SVG.
 * Uses shared TeamTopologyCanvas for unified row-based layout.
 *
 * 3-row layout:
 *   Row 1: architect (Leader)
 *   Row 2: keeper, writer-1, writer-2, writer-3
 *   Row 3: checker-1, checker-2, editor
 */

import { useMemo } from 'react';
import {
  TeamTopologyCanvas,
  type TeamTopologyNode,
  type TeamTopologyConnection,
  type TeamTopologyLegendItem,
} from '@/components/common/team-topology';
import { getAgentDetails } from '@/lib/ai-writing/agent-config';

// Agent configuration for the writing team
const WRITING_AGENTS = [
  {
    id: 'architect',
    icon: '\u{1F4D0}',
    colorKey: 'purple',
    isLeader: true,
    row: 0,
  },
  { id: 'keeper', icon: '\u{1F4DA}', colorKey: 'indigo', row: 1 },
  { id: 'writer-1', icon: '\u{270D}\u{FE0F}', colorKey: 'amber', row: 1 },
  { id: 'writer-2', icon: '\u{270D}\u{FE0F}', colorKey: 'orange', row: 1 },
  { id: 'writer-3', icon: '\u{270D}\u{FE0F}', colorKey: 'yellow', row: 1 },
  { id: 'checker-1', icon: '\u{1F50D}', colorKey: 'green', row: 2 },
  { id: 'checker-2', icon: '\u{1F50D}', colorKey: 'emerald', row: 2 },
  { id: 'editor', icon: '\u{1F4DD}', colorKey: 'pink', row: 2 },
] as const;

// Keywords to detect which agent is active based on mission message
const AGENT_KEYWORDS: Record<string, string[]> = {
  architect: ['架构', '规划', '结构', '大纲'],
  keeper: ['世界观', '设定', '守护'],
  'writer-1': ['作家', '写作', '创作', '章节', '撰写'],
  'writer-2': ['作家', '写作', '创作', '章节', '撰写'],
  'writer-3': ['作家', '写作', '创作', '章节', '撰写'],
  'checker-1': ['检查', '校验', '一致性', '审核', '检查员'],
  'checker-2': ['检查', '校验', '一致性', '审核', '检查员'],
  editor: ['编辑', '润色', '打磨', '优化'],
};

// Agent display names
const AGENT_NAMES: Record<string, string> = {
  architect: '架构师',
  keeper: '守护者',
  'writer-1': '作家\u2460',
  'writer-2': '作家\u2461',
  'writer-3': '作家\u2462',
  'checker-1': '检查\u2460',
  'checker-2': '检查\u2461',
  editor: '编辑',
};

// Row layout
const WRITING_ROWS: string[][] = [
  ['architect'],
  ['keeper', 'writer-1', 'writer-2', 'writer-3'],
  ['checker-1', 'checker-2', 'editor'],
];

interface WritingTeamPanelProps {
  isMissionRunning: boolean;
  missionCompleted: boolean;
  missionMessage: string;
  missionProgress: number;
  isStuckMission: boolean;
  chaptersCount: number;
  onContinueWriting: () => void;
  onCancelMission: () => void;
}

export function WritingTeamPanel({
  isMissionRunning,
  missionCompleted,
  missionMessage,
  missionProgress,
  isStuckMission,
  chaptersCount,
  onContinueWriting,
  onCancelMission,
}: WritingTeamPanelProps) {
  const { nodes, connections, legendItems } = useMemo(() => {
    const msg = missionMessage || '';

    const topoNodes: TeamTopologyNode[] = WRITING_AGENTS.map((agent) => {
      const keywords = AGENT_KEYWORDS[agent.id] || [];
      const isActive =
        isMissionRunning && keywords.some((kw) => msg.includes(kw));

      return {
        id: agent.id,
        name: AGENT_NAMES[agent.id] || agent.id,
        role: agent.id,
        icon: agent.icon,
        status: isActive
          ? ('working' as const)
          : missionCompleted
            ? ('completed' as const)
            : ('idle' as const),
        statusLabel: isActive ? '工作中' : undefined,
        colorKey: agent.colorKey,
        isLeader: 'isLeader' in agent ? agent.isLeader : undefined,
      };
    });

    // All agents connect to the leader (star topology)
    const conns: TeamTopologyConnection[] = WRITING_AGENTS.filter(
      (a) => a.id !== 'architect'
    ).map((a) => ({ from: 'architect', to: a.id }));

    const legend: TeamTopologyLegendItem[] = [
      { color: 'bg-purple-500', label: '架构师' },
      { color: 'bg-blue-500', label: '工作中', animated: true },
      { color: 'bg-green-500', label: '已完成' },
      { color: 'bg-gray-400', label: '待命' },
    ];

    return { nodes: topoNodes, connections: conns, legendItems: legend };
  }, [isMissionRunning, missionCompleted, missionMessage]);

  return (
    <div className="flex max-h-full w-80 shrink-0 flex-col rounded-2xl border border-gray-100 bg-gradient-to-br from-slate-50 via-white to-violet-50/50 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-100/80 bg-white/60 px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">AI 写作团队</h2>
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              isMissionRunning
                ? 'bg-green-100 text-green-700'
                : missionCompleted
                  ? 'bg-green-100 text-green-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isMissionRunning
              ? '进行中'
              : missionCompleted
                ? '已完成'
                : '待开始'}
          </span>
        </div>
      </div>

      {/* Status Message */}
      <div className="px-4 pt-4 text-center">
        <p className="line-clamp-1 text-xs text-slate-500">
          {missionMessage || '等待任务开始...'}
        </p>
      </div>

      {/* SVG Team Canvas */}
      <div className="px-2">
        <TeamTopologyCanvas
          nodes={nodes}
          rows={WRITING_ROWS}
          connections={connections}
          patternId="writing"
          legendItems={legendItems}
          renderDetail={(node, onClose) => {
            const details = getAgentDetails(node.id);
            return (
              <>
                <div className="absolute inset-0 z-20" onClick={onClose} />
                <div className="absolute left-1/2 top-1/2 z-30 w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-50">
                        <span className="text-xl">
                          {typeof node.icon === 'string' ? node.icon : ''}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">
                          {details.name}
                        </div>
                        <span className="text-xs text-gray-500">
                          {details.role}
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={onClose}
                      className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  <p className="mb-3 text-sm text-gray-600">
                    {details.description}
                  </p>

                  <div className="mb-3">
                    <div className="mb-1.5 text-xs font-medium text-gray-500">
                      技能
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {details.skills.map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 text-xs font-medium text-gray-500">
                      工具
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {details.tools.map((tool) => (
                        <span
                          key={tool}
                          className="rounded-full bg-green-50 px-2.5 py-1 text-xs text-green-700"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            );
          }}
        />
      </div>

      {/* Progress Steps Section */}
      <div className="mx-4 mb-4 rounded-xl bg-slate-50/80 p-4">
        <div className="space-y-2.5">
          {[
            {
              id: 'keeper',
              label: '建立世界观设定',
              icon: '\u{1F4DA}',
              keywords: ['世界观', '设定', '守护'],
            },
            {
              id: 'architect',
              label: '规划故事结构',
              icon: '\u{1F451}',
              keywords: ['架构', '规划', '结构', '大纲'],
            },
            {
              id: 'writer',
              label: '创作故事内容',
              icon: '\u{270D}\u{FE0F}',
              keywords: ['作家', '写作', '创作', '章节', '撰写'],
            },
            {
              id: 'checker',
              label: '校验内容一致性',
              icon: '\u{1F50D}',
              keywords: ['检查', '校验', '一致性', '审核', '检查员'],
            },
            {
              id: 'editor-step',
              label: '润色文字表达',
              icon: '\u{1F3A8}',
              keywords: ['编辑', '润色', '打磨', '优化'],
            },
          ].map((step, idx) => {
            const msg = missionMessage || '';
            const isStepActive =
              isMissionRunning && step.keywords.some((kw) => msg.includes(kw));
            const stepThreshold = (idx + 1) * 20;
            const isDone = missionProgress >= stepThreshold && !isStepActive;
            return (
              <div key={step.id} className="flex items-center gap-3">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs transition-all ${
                    isStepActive
                      ? 'animate-pulse bg-amber-500 text-white ring-2 ring-amber-200'
                      : isDone
                        ? 'bg-green-500 text-white'
                        : 'bg-gray-200 text-gray-400'
                  }`}
                >
                  {isDone ? '\u2713' : step.icon}
                </div>
                <span
                  className={`text-sm ${
                    isStepActive
                      ? 'font-medium text-amber-700'
                      : isDone
                        ? 'text-green-700'
                        : 'text-gray-400'
                  }`}
                >
                  {step.label}
                  {isStepActive && (
                    <span className="ml-1 text-amber-500">...</span>
                  )}
                </span>
              </div>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="mt-4 border-t border-slate-200/80 pt-3">
          <div className="mb-1.5 flex justify-between text-xs">
            <span className="text-slate-500">整体进度</span>
            <span className="font-semibold text-amber-600">
              {Math.round(missionProgress)}%
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full transition-all duration-500 ${
                missionCompleted
                  ? 'bg-gradient-to-r from-green-400 to-emerald-500'
                  : 'bg-gradient-to-r from-amber-400 to-orange-500'
              }`}
              style={{ width: `${missionProgress}%` }}
            />
          </div>
        </div>

        {/* Stuck Mission Warning */}
        {isStuckMission && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
            <div className="flex items-start gap-2">
              <svg
                className="mt-0.5 h-4 w-4 flex-shrink-0 text-red-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <div className="flex-1">
                <p className="text-xs font-medium text-red-800">任务已卡住</p>
                <p className="mt-0.5 text-xs text-red-600">
                  后台任务状态异常，请点击下方按钮强制取消后重新开始。
                </p>
                <button
                  onClick={onCancelMission}
                  className="mt-2 rounded bg-red-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-600"
                >
                  {'\u{1F6D1}'} 强制取消任务
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="sticky bottom-0 z-10 flex items-center justify-center gap-2 border-t border-gray-100/80 bg-white px-4 py-3 shadow-lg">
        <button
          onClick={onContinueWriting}
          className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-4 py-2 text-xs font-medium text-white hover:bg-violet-600"
        >
          <span>{chaptersCount === 0 ? '\u2728' : '\u{1F4DD}'}</span>
          {chaptersCount === 0 ? '开始创作' : '继续创作'}
        </button>
        <button
          onClick={onCancelMission}
          className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-4 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
        >
          <span>{'\u23F9'}</span>
          取消任务
        </button>
      </div>
    </div>
  );
}
