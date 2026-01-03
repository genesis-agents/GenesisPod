'use client';

/**
 * PhaseTimeline - 阶段时间线组件
 *
 * 按阶段组织显示 AI Slides 生成过程：
 * - 每个阶段对应一个 Agent
 * - 清晰的阶段流转和进度
 * - 突出当前阶段，收起已完成阶段
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Search,
  Palette,
  PenTool,
  CheckCircle,
  Loader2,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  ArrowDown,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  SlidesTeamPhase,
  SlidesAgentRole,
  TeamExecutionState,
  AgentState,
} from '@/types/slides-team';

// ============================================================================
// 阶段配置
// ============================================================================

interface PhaseConfig {
  phase: SlidesTeamPhase;
  agent: SlidesAgentRole;
  title: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

const PHASE_CONFIG: PhaseConfig[] = [
  {
    phase: 'analyzing',
    agent: 'analyst',
    title: '内容分析',
    description: '分析源文本，提取关键信息和结构',
    icon: Search,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500',
  },
  {
    phase: 'planning',
    agent: 'strategist',
    title: '大纲规划',
    description: '设计 PPT 结构和视觉策略',
    icon: Palette,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500',
  },
  {
    phase: 'generating',
    agent: 'writer',
    title: '内容生成',
    description: '生成每页的具体内容和布局',
    icon: PenTool,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500',
  },
  {
    phase: 'reviewing',
    agent: 'reviewer',
    title: '质量审核',
    description: '检查内容质量和一致性',
    icon: CheckCircle,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500',
  },
];

// ============================================================================
// 阶段状态判断
// ============================================================================

type PhaseStatus = 'pending' | 'active' | 'completed';

function getPhaseStatus(
  currentPhase: SlidesTeamPhase,
  targetPhase: SlidesTeamPhase
): PhaseStatus {
  const phaseOrder: SlidesTeamPhase[] = [
    'initializing',
    'analyzing',
    'planning',
    'generating',
    'rendering',
    'reviewing',
    'completed',
    'failed',
  ];

  const currentIndex = phaseOrder.indexOf(currentPhase);
  const targetIndex = phaseOrder.indexOf(targetPhase);

  if (currentPhase === 'completed' || currentPhase === 'failed') {
    return 'completed';
  }

  if (currentIndex === targetIndex) {
    return 'active';
  }

  if (currentIndex > targetIndex) {
    return 'completed';
  }

  return 'pending';
}

// ============================================================================
// 单个阶段项组件
// ============================================================================

interface PhaseItemProps {
  config: PhaseConfig;
  status: PhaseStatus;
  agentState?: AgentState;
  isLast: boolean;
  progress?: {
    current: number;
    total: number;
    message?: string;
  };
}

function PhaseItem({
  config,
  status,
  agentState,
  isLast,
  progress,
}: PhaseItemProps) {
  const [expanded, setExpanded] = React.useState(status === 'active');
  const Icon = config.icon;

  // 当状态变为 active 时自动展开
  React.useEffect(() => {
    if (status === 'active') {
      setExpanded(true);
    }
  }, [status]);

  return (
    <div className="relative">
      {/* 连接线 */}
      {!isLast && (
        <div
          className={cn(
            'absolute left-4 top-10 h-full w-0.5 -translate-x-1/2',
            status === 'completed' ? 'bg-green-300' : 'bg-gray-200'
          )}
        />
      )}

      {/* 阶段卡片 */}
      <div
        className={cn(
          'relative rounded-lg border transition-all',
          status === 'active'
            ? `${config.borderColor} ${config.bgColor} shadow-sm`
            : status === 'completed'
              ? 'border-gray-200 bg-gray-50'
              : 'border-gray-200 bg-white opacity-60'
        )}
      >
        {/* 头部 - 始终显示 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex w-full items-center gap-3 p-3"
        >
          {/* 状态图标 */}
          <div
            className={cn(
              'relative z-10 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full',
              status === 'active'
                ? config.bgColor
                : status === 'completed'
                  ? 'bg-green-100'
                  : 'bg-gray-100'
            )}
          >
            {status === 'active' ? (
              <Loader2 className={cn('h-4 w-4 animate-spin', config.color)} />
            ) : status === 'completed' ? (
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            ) : (
              <Clock className="h-4 w-4 text-gray-400" />
            )}
          </div>

          {/* 标题和描述 */}
          <div className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-2">
              <Icon
                className={cn(
                  'h-4 w-4',
                  status === 'active'
                    ? config.color
                    : status === 'completed'
                      ? 'text-green-600'
                      : 'text-gray-400'
                )}
              />
              <span
                className={cn(
                  'text-sm font-medium',
                  status === 'active'
                    ? 'text-gray-900'
                    : status === 'completed'
                      ? 'text-gray-700'
                      : 'text-gray-500'
                )}
              >
                {config.title}
              </span>
              {agentState?.name && (
                <span className="text-xs text-gray-400">
                  · {agentState.name}
                </span>
              )}
            </div>

            {/* 活动状态显示当前任务 */}
            {status === 'active' && agentState?.currentTask && (
              <div className="mt-0.5 truncate text-xs text-gray-600">
                {agentState.currentTask}
              </div>
            )}

            {/* 完成状态显示结果 */}
            {status === 'completed' && agentState?.result && !expanded && (
              <div className="mt-0.5 truncate text-xs text-green-600">
                {agentState.result}
              </div>
            )}
          </div>

          {/* 进度/状态 */}
          <div className="flex items-center gap-2">
            {status === 'active' && progress && (
              <span className="text-xs font-medium text-orange-600">
                {progress.current}/{progress.total}
              </span>
            )}
            {status === 'completed' && agentState?.duration && (
              <span className="text-xs text-gray-400">
                {(agentState.duration / 1000).toFixed(1)}s
              </span>
            )}
            {(status === 'active' || status === 'completed') && (
              <ChevronDown
                className={cn(
                  'h-4 w-4 text-gray-400 transition-transform',
                  expanded ? 'rotate-180' : ''
                )}
              />
            )}
          </div>
        </button>

        {/* 展开内容 */}
        <AnimatePresence>
          {expanded && (status === 'active' || status === 'completed') && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-gray-100"
            >
              <div className="space-y-2 p-3 pt-2">
                {/* 描述 */}
                <p className="text-xs text-gray-500">{config.description}</p>

                {/* Agent 思考 */}
                {agentState?.thought && (
                  <div className="rounded bg-amber-50 p-2 text-xs italic text-amber-700">
                    💭 {agentState.thought}
                  </div>
                )}

                {/* 当前任务 */}
                {status === 'active' && agentState?.currentTask && (
                  <div className="text-xs text-gray-600">
                    <span className="font-medium">当前：</span>
                    {agentState.currentTask}
                  </div>
                )}

                {/* 进度条 */}
                {status === 'active' && progress && (
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-500">
                      <span>{progress.message || '处理中'}</span>
                      <span>
                        {Math.round((progress.current / progress.total) * 100)}%
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-gray-200">
                      <motion.div
                        className={cn(
                          'h-1.5 rounded-full',
                          config.color.replace('text-', 'bg-')
                        )}
                        initial={{ width: 0 }}
                        animate={{
                          width: `${(progress.current / progress.total) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                )}

                {/* 完成结果 */}
                {status === 'completed' && agentState?.result && (
                  <div className="flex items-start gap-1 text-xs text-green-600">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 flex-shrink-0" />
                    <span>{agentState.result}</span>
                  </div>
                )}

                {/* 评分 */}
                {agentState?.lastScore !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500">评分：</span>
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-xs font-medium',
                        agentState.lastScore >= 70
                          ? 'bg-green-100 text-green-700'
                          : 'bg-amber-100 text-amber-700'
                      )}
                    >
                      {agentState.lastScore}分
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ============================================================================
// Leader 状态组件
// ============================================================================

interface LeaderStatusProps {
  agentState?: AgentState;
  phase: SlidesTeamPhase;
  overallProgress: number;
}

function LeaderStatus({
  agentState,
  phase,
  overallProgress,
}: LeaderStatusProps) {
  return (
    <div className="mb-4 rounded-lg border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3">
      <div className="flex items-center gap-3">
        {/* Leader 图标 */}
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100">
          <Crown className="h-5 w-5 text-amber-600" />
        </div>

        {/* 状态信息 */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-amber-900">
              Slides Architect
            </span>
            <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-800">
              协调者
            </span>
          </div>
          <div className="mt-0.5 text-xs text-amber-700">
            {phase === 'completed'
              ? '生成完成，正在等待下一步指令'
              : phase === 'failed'
                ? '生成失败，请检查错误信息'
                : agentState?.currentTask || '正在协调各 Agent 工作...'}
          </div>
        </div>

        {/* 整体进度 */}
        <div className="text-right">
          <div className="text-lg font-bold text-amber-600">
            {Math.round(overallProgress)}%
          </div>
          <div className="text-xs text-amber-600">整体进度</div>
        </div>
      </div>

      {/* 进度条 */}
      <div className="mt-3 h-2 w-full rounded-full bg-amber-200">
        <motion.div
          className="h-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
          initial={{ width: 0 }}
          animate={{ width: `${overallProgress}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// 主组件
// ============================================================================

interface PhaseTimelineProps {
  teamState: TeamExecutionState | null;
  generating: boolean;
  progress?: {
    currentPage?: number;
    totalPages?: number;
    message?: string;
  };
  className?: string;
}

export function PhaseTimeline({
  teamState,
  generating,
  progress,
  className,
}: PhaseTimelineProps) {
  // 未开始状态
  if (!teamState && !generating) {
    return (
      <div className={cn('py-8 text-center', className)}>
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
          <Crown className="h-8 w-8 text-gray-400" />
        </div>
        <p className="text-sm font-medium text-gray-600">AI 团队待命中</p>
        <p className="mt-1 text-xs text-gray-400">
          输入内容后，5 个专业 Agent 将协作为您生成 PPT
        </p>
      </div>
    );
  }

  // 正在初始化但还没有 teamState
  if (!teamState && generating) {
    return (
      <div className={cn('py-8 text-center', className)}>
        <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-orange-500" />
        <p className="text-sm font-medium text-gray-600">
          正在初始化 AI 团队...
        </p>
      </div>
    );
  }

  if (!teamState) return null;

  const currentPhase = teamState.phase;

  // 计算生成阶段的进度
  const generatingProgress =
    currentPhase === 'generating' && progress?.totalPages
      ? {
          current: progress.currentPage || 0,
          total: progress.totalPages,
          message: progress.message || '正在生成页面',
        }
      : undefined;

  return (
    <div className={cn('space-y-3', className)}>
      {/* Leader 状态 */}
      <LeaderStatus
        agentState={teamState.agents.leader}
        phase={currentPhase}
        overallProgress={teamState.overallProgress}
      />

      {/* 阶段时间线 */}
      <div className="space-y-2">
        {PHASE_CONFIG.map((config, index) => {
          const status = getPhaseStatus(currentPhase, config.phase);
          const agentState = teamState.agents[config.agent];

          return (
            <PhaseItem
              key={config.phase}
              config={config}
              status={status}
              agentState={agentState}
              isLast={index === PHASE_CONFIG.length - 1}
              progress={
                config.phase === 'generating' ? generatingProgress : undefined
              }
            />
          );
        })}
      </div>

      {/* 完成状态 */}
      {currentPhase === 'completed' && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-lg border border-green-200 bg-green-50 p-4 text-center"
        >
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-green-500" />
          <p className="text-sm font-medium text-green-700">生成完成！</p>
          <p className="mt-1 text-xs text-green-600">
            您可以在右侧预览和编辑生成的 PPT
          </p>
        </motion.div>
      )}
    </div>
  );
}

export default PhaseTimeline;
