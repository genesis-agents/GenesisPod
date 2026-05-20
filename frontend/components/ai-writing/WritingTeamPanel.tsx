'use client';

/**
 * WritingTeamPanel - AI Writing team visualization
 *
 * v2.0: Aligned with TopicTeamPanel visual style (project benchmark)
 * - Clean bg-white, no gradient/shadow
 * - Header with context-aware status badge + progress stats + progress bar
 * - SVG team canvas with shared TeamTopologyCanvas
 * - Writing-specific workflow steps (preserved, restyled)
 * - Bottom status bar with phase display + error/stuck + 3-col action buttons
 *
 * 3-row layout:
 *   Row 1: architect (Leader)
 *   Row 2: keeper, writer-1, writer-2, writer-3
 *   Row 3: checker-1, checker-2, editor
 */

import { useMemo } from 'react';
import { CheckCircle2, XCircle, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  TeamTopologyCanvas,
  AVATAR_ROW_Y,
  type TeamTopologyNode,
  type TeamTopologyConnection,
  type TeamTopologyLegendItem,
} from '@/components/common/team-topology';
import { getAgentDetails } from '@/lib/features/ai-writing/agent-config';

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

// Workflow steps definition
const WORKFLOW_STEPS = [
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
];

// Phase display mapping for writing
const PHASE_DISPLAY: Record<string, string> = {
  idle: '待开始',
  worldbuilding: '世界观设定中',
  planning: '故事规划中',
  writing: '创作中',
  checking: '校验中',
  editing: '润色中',
  completed: '已完成',
};

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
  // Derive current phase from mission message
  const currentPhase = useMemo(() => {
    if (missionCompleted) return 'completed';
    if (!isMissionRunning) return 'idle';
    const msg = missionMessage || '';
    if (['世界观', '设定', '守护'].some((kw) => msg.includes(kw)))
      return 'worldbuilding';
    if (['架构', '规划', '结构', '大纲'].some((kw) => msg.includes(kw)))
      return 'planning';
    if (['作家', '写作', '创作', '章节', '撰写'].some((kw) => msg.includes(kw)))
      return 'writing';
    if (
      ['检查', '校验', '一致性', '审核', '检查员'].some((kw) =>
        msg.includes(kw)
      )
    )
      return 'checking';
    if (['编辑', '润色', '打磨', '优化'].some((kw) => msg.includes(kw)))
      return 'editing';
    return 'writing'; // default active phase
  }, [isMissionRunning, missionCompleted, missionMessage]);

  // Compute step stats
  const stepStats = useMemo(() => {
    const msg = missionMessage || '';
    let completedSteps = 0;
    let activeSteps = 0;

    WORKFLOW_STEPS.forEach((step, idx) => {
      const isStepActive =
        isMissionRunning && step.keywords.some((kw) => msg.includes(kw));
      const stepThreshold = (idx + 1) * 20;
      const isDone = missionProgress >= stepThreshold && !isStepActive;
      if (isDone) completedSteps++;
      if (isStepActive) activeSteps++;
    });

    return {
      completed: completedSteps,
      executing: activeSteps,
      total: WORKFLOW_STEPS.length,
    };
  }, [isMissionRunning, missionMessage, missionProgress]);

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
        avatarRole: agent.id,
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
    <div className="flex h-full w-80 shrink-0 flex-col bg-white">
      {/* Header — matches TopicTeamPanel structure */}
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800">AI 写作团队</h3>
          <span
            className={`shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${
              currentPhase === 'completed'
                ? 'bg-green-100 text-green-700'
                : isMissionRunning
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {PHASE_DISPLAY[currentPhase] || currentPhase}
          </span>
        </div>

        {/* Progress stats — like TopicTeamPanel */}
        {(isMissionRunning || missionCompleted) && (
          <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1 text-green-600">
              <CheckCircle2 className="h-3 w-3" /> {stepStats.completed}
            </span>
            {stepStats.executing > 0 && (
              <span className="flex items-center gap-1 text-blue-600">
                <RefreshCw className="h-3 w-3" /> {stepStats.executing}
              </span>
            )}
            <span className="text-gray-400">共 {stepStats.total} 步</span>
          </div>
        )}

        {/* Progress bar — in header like TopicTeamPanel */}
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className={`h-full transition-all duration-500 ${
                missionCompleted
                  ? 'bg-green-500'
                  : isMissionRunning
                    ? 'bg-blue-500'
                    : 'bg-gray-300'
              }`}
              style={{ width: `${missionProgress}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-400">
            <span>整体进度</span>
            <span>{Math.round(missionProgress)}%</span>
          </div>
        </div>
      </div>

      {/* SVG Team Canvas — wrapped in border-b like TopicTeamPanel */}
      <div className="relative border-b border-gray-100">
        <TeamTopologyCanvas
          nodes={nodes}
          rows={WRITING_ROWS}
          connections={connections}
          heightClass="h-[280px]"
          viewBoxHeight={280}
          rowYPositions={[...AVATAR_ROW_Y]}
          patternId="writing"
          legendItems={legendItems}
          renderDetail={(node, onClose) => {
            const details = getAgentDetails(node.id);
            return (
              <>
                <div className="absolute inset-0 z-20" onClick={onClose} />
                <div className="absolute left-1/2 top-1/2 z-30 w-[280px] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-lg">
                  {/* Header — matches TopicTeamPanel detail card */}
                  <div className="mb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
                        <span className="text-xl">
                          {typeof node.icon === 'string' ? node.icon : ''}
                        </span>
                      </div>
                      <div>
                        <div className="font-semibold text-gray-800">
                          {details.name}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {details.role}
                          </span>
                          <span
                            className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                              node.status === 'working'
                                ? 'bg-blue-100 text-blue-700'
                                : node.status === 'completed'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {node.status === 'working'
                              ? '工作中'
                              : node.status === 'completed'
                                ? '已完成'
                                : '待命'}
                          </span>
                        </div>
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

                  {/* Description */}
                  <div className="mb-3">
                    <div className="mb-1 text-xs font-medium text-gray-500">
                      {'\u{1F4CB}'} 职责描述
                    </div>
                    <p className="text-sm text-gray-700">
                      {details.description}
                    </p>
                  </div>

                  {/* Skills */}
                  <div className="mb-3">
                    <div className="mb-1.5 text-xs font-medium text-gray-500">
                      {'\u{1F3AF}'} 技能
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

                  {/* Tools */}
                  <div>
                    <div className="mb-1.5 text-xs font-medium text-gray-500">
                      {'\u{1F527}'} 工具
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

      {/* Workflow Steps — writing-specific, restyled to match TopicTeamPanel task list aesthetic */}
      <div className="flex-1 overflow-y-auto">
        <div className="space-y-1 p-3">
          {WORKFLOW_STEPS.map((step, idx) => {
            const msg = missionMessage || '';
            const isStepActive =
              isMissionRunning && step.keywords.some((kw) => msg.includes(kw));
            const stepThreshold = (idx + 1) * 20;
            const isDone = missionProgress >= stepThreshold && !isStepActive;

            return (
              <div
                key={step.id}
                className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 ${
                  isStepActive
                    ? 'border-blue-200 bg-blue-50/50'
                    : isDone
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-gray-100 bg-white'
                }`}
              >
                {/* Status icon */}
                <span className="text-xs">
                  {isDone ? '✅' : isStepActive ? '🔄' : '⏳'}
                </span>

                {/* Step name */}
                <span className="min-w-0 flex-1 truncate text-xs text-gray-700">
                  {step.label}
                </span>

                {/* Status badge */}
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                    isStepActive
                      ? 'bg-blue-100 text-blue-700'
                      : isDone
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {isStepActive ? '进行中' : isDone ? '已完成' : '待处理'}
                </span>
              </div>
            );
          })}
        </div>

        {/* Status message — current activity */}
        {isMissionRunning && missionMessage && (
          <div className="px-3 pb-2">
            <p className="line-clamp-2 text-xs text-gray-400">
              {missionMessage}
            </p>
          </div>
        )}
      </div>

      {/* Bottom Status Bar — matches TopicTeamPanel */}
      <div className="border-t border-gray-100 px-4 py-2">
        {/* Phase display */}
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="text-gray-500">
            阶段: {PHASE_DISPLAY[currentPhase] || currentPhase}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 ${
              currentPhase === 'completed'
                ? 'bg-green-100 text-green-700'
                : isMissionRunning
                  ? 'bg-blue-100 text-blue-700'
                  : 'bg-gray-100 text-gray-600'
            }`}
          >
            {isMissionRunning
              ? '进行中'
              : currentPhase === 'completed'
                ? '已完成'
                : '待开始'}
          </span>
        </div>

        {/* Error/Stuck Display — matches TopicTeamPanel error section */}
        {isStuckMission && (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertTriangle className="h-4 w-4" />
              <span>任务已卡住</span>
            </div>
            <p className="text-xs text-red-600">
              后台任务状态异常，请点击取消按钮强制取消后重新开始。
            </p>
          </div>
        )}

        {/* Action Buttons — 3-column grid like TopicTeamPanel */}
        <div className="grid grid-cols-3 gap-2">
          {/* Start/Continue button */}
          <button
            onClick={onContinueWriting}
            disabled={isMissionRunning}
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              isMissionRunning
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
            }`}
          >
            <span>▶</span>
            {chaptersCount === 0 ? '开始' : '继续'}
          </button>

          {/* Resume button — for stuck/paused missions */}
          <button
            onClick={onContinueWriting}
            disabled={!isStuckMission && !missionCompleted}
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              !isStuckMission && !missionCompleted
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'bg-green-600 text-white shadow-sm hover:bg-green-700'
            }`}
          >
            <span>🔄</span>
            续写
          </button>

          {/* Cancel button */}
          <button
            onClick={onCancelMission}
            disabled={!isMissionRunning}
            className={`flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              !isMissionRunning
                ? 'cursor-not-allowed border border-gray-200 bg-gray-100 text-gray-400'
                : 'border border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
            }`}
          >
            <span>⏹</span>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
