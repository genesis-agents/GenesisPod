'use client';

/**
 * Agent Team Panel - Agent 协作可视化面板
 *
 * 展示 5 个 Agent 的协作状态：
 * - Leader (Slides Architect)
 * - Analyst (Content Analyst)
 * - Strategist (Visual Strategist)
 * - Writer (Content Writer)
 * - Reviewer (Quality Reviewer)
 */

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Search,
  Palette,
  PenTool,
  CheckCircle,
  Loader2,
  Brain,
  ArrowRight,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Gauge,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';
import type {
  SlidesAgentRole,
  AgentState,
  TeamExecutionState,
  AgentHandoffData,
  ReviewDimension,
} from '@/types/slides-team';

// ============================================================================
// Agent 配置
// ============================================================================

const AGENT_CONFIG: Record<
  SlidesAgentRole,
  {
    icon: React.ElementType;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  leader: {
    icon: Crown,
    color: 'text-amber-500',
    bgColor: 'bg-amber-500/10',
    borderColor: 'border-amber-500/30',
  },
  analyst: {
    icon: Search,
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    borderColor: 'border-blue-500/30',
  },
  strategist: {
    icon: Palette,
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    borderColor: 'border-purple-500/30',
  },
  writer: {
    icon: PenTool,
    color: 'text-green-500',
    bgColor: 'bg-green-500/10',
    borderColor: 'border-green-500/30',
  },
  reviewer: {
    icon: CheckCircle,
    color: 'text-rose-500',
    bgColor: 'bg-rose-500/10',
    borderColor: 'border-rose-500/30',
  },
};

// ============================================================================
// Score Bar 组件
// ============================================================================

interface ScoreBarProps {
  score: number;
  threshold?: number;
  label?: string;
  className?: string;
}

function ScoreBar({ score, threshold = 70, label, className }: ScoreBarProps) {
  const passed = score >= threshold;
  const color = passed
    ? 'bg-green-500'
    : score >= threshold * 0.7
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <div className={cn('space-y-0.5', className)}>
      {label && (
        <div className="flex justify-between text-[10px] text-gray-500">
          <span>{label}</span>
          <span className={passed ? 'text-green-600' : 'text-amber-600'}>
            {score}/{threshold}
          </span>
        </div>
      )}
      <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={cn('h-1.5 rounded-full transition-all', color)}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Dimension Score List 组件
// ============================================================================

interface DimensionScoreListProps {
  dimensions: ReviewDimension[];
}

function DimensionScoreList({ dimensions }: DimensionScoreListProps) {
  return (
    <div className="space-y-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-900">
      <div className="flex items-center gap-1 text-[10px] font-medium text-gray-500">
        <Gauge className="h-3 w-3" />
        评分详情
      </div>
      {dimensions.map((dim, index) => (
        <div key={index} className="space-y-0.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-gray-600 dark:text-gray-400">
              {dim.name}
              <span className="ml-1 text-gray-400">
                ({Math.round(dim.weight * 100)}%)
              </span>
            </span>
            <span
              className={
                dim.score >= 70
                  ? 'text-green-600'
                  : dim.score >= 50
                    ? 'text-amber-600'
                    : 'text-red-600'
              }
            >
              {dim.score}分
            </span>
          </div>
          <div className="h-1 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className={cn(
                'h-1 rounded-full',
                dim.score >= 70
                  ? 'bg-green-500'
                  : dim.score >= 50
                    ? 'bg-amber-500'
                    : 'bg-red-500'
              )}
              style={{ width: `${dim.score}%` }}
            />
          </div>
          {dim.comment && (
            <div className="text-[9px] text-gray-400">{dim.comment}</div>
          )}
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Agent Card 组件
// ============================================================================

interface AgentCardProps {
  agent: AgentState;
  isActive: boolean;
  compact?: boolean;
}

function AgentCard({ agent, isActive, compact = false }: AgentCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = AGENT_CONFIG[agent.role];
  const Icon = config.icon;

  const statusIcon = {
    idle: null,
    thinking: <Brain className="h-3 w-3 animate-pulse" />,
    working: <Loader2 className="h-3 w-3 animate-spin" />,
    completed: <CheckCircle2 className="h-3 w-3" />,
    error: <AlertTriangle className="h-3 w-3" />,
  };

  const statusColor = {
    idle: 'text-gray-400',
    thinking: 'text-amber-500',
    working: 'text-blue-500',
    completed: 'text-green-500',
    error: 'text-red-500',
  };

  const hasDetails =
    agent.scoreDimensions?.length ||
    agent.result ||
    agent.thought ||
    agent.currentTask;

  if (compact) {
    return (
      <motion.div
        className={cn(
          'cursor-pointer rounded-lg border transition-all',
          isActive
            ? config.borderColor
            : 'border-gray-200 dark:border-gray-700',
          isActive ? config.bgColor : 'bg-white dark:bg-gray-800'
        )}
        animate={{
          scale: isActive ? 1.02 : 1,
          boxShadow: isActive ? '0 4px 12px rgba(0,0,0,0.1)' : 'none',
        }}
        onClick={() => hasDetails && setIsExpanded(!isExpanded)}
      >
        {/* Header - Always Visible */}
        <div className="flex items-center gap-2 px-3 py-2">
          <div className={cn('rounded-full p-1.5', config.bgColor)}>
            <Icon className={cn('h-4 w-4', config.color)} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className="truncate text-xs font-medium">{agent.name}</span>
              {agent.variant && (
                <span className="text-[9px] text-gray-400">
                  ({agent.variant})
                </span>
              )}
            </div>
            {agent.currentTask && !isExpanded && (
              <div className="truncate text-[10px] text-gray-500">
                {agent.currentTask}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Score Badge */}
            {agent.lastScore !== undefined && (
              <span
                className={cn(
                  'rounded px-1 py-0.5 text-[10px] font-medium',
                  agent.lastScore >= 70
                    ? 'bg-green-100 text-green-700'
                    : 'bg-amber-100 text-amber-700'
                )}
              >
                {agent.lastScore}分
              </span>
            )}
            {/* Retry Count */}
            {agent.retryCount !== undefined && agent.retryCount > 0 && (
              <span className="flex items-center gap-0.5 text-[10px] text-amber-500">
                <RefreshCw className="h-2.5 w-2.5" />
                {agent.retryCount}
              </span>
            )}
            <div className={statusColor[agent.status]}>
              {statusIcon[agent.status]}
            </div>
            {/* Expand Toggle */}
            {hasDetails && (
              <button className="p-0.5 text-gray-400 hover:text-gray-600">
                {isExpanded ? (
                  <ChevronUp className="h-3 w-3" />
                ) : (
                  <ChevronDown className="h-3 w-3" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Expanded Content */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden border-t border-gray-100 dark:border-gray-700"
            >
              <div className="space-y-2 px-3 py-2">
                {/* Current Task / Thought / Result */}
                {agent.thought && (
                  <div className="rounded bg-amber-50 p-2 text-[10px] italic text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                    <Brain className="mr-1 inline h-3 w-3" />
                    {agent.thought}
                  </div>
                )}
                {agent.currentTask && (
                  <div className="text-[10px] text-gray-600 dark:text-gray-400">
                    {agent.currentTask}
                  </div>
                )}
                {agent.result && (
                  <div className="text-[10px] text-green-600 dark:text-green-400">
                    <CheckCircle2 className="mr-1 inline h-3 w-3" />
                    {agent.result}
                  </div>
                )}

                {/* Score Dimensions */}
                {agent.scoreDimensions && agent.scoreDimensions.length > 0 && (
                  <DimensionScoreList dimensions={agent.scoreDimensions} />
                )}

                {/* Progress Bar */}
                {agent.progress !== undefined && (
                  <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                    <motion.div
                      className={cn(
                        'h-1.5 rounded-full',
                        config.color.replace('text-', 'bg-')
                      )}
                      initial={{ width: 0 }}
                      animate={{ width: `${agent.progress}%` }}
                    />
                  </div>
                )}

                {/* Duration */}
                {agent.duration && (
                  <div className="text-[9px] text-gray-400">
                    耗时: {(agent.duration / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }

  // Non-compact version (with expand support)
  return (
    <motion.div
      className={cn(
        'cursor-pointer rounded-xl border transition-all',
        isActive ? config.borderColor : 'border-gray-200 dark:border-gray-700',
        isActive ? config.bgColor : 'bg-white dark:bg-gray-800'
      )}
      animate={{
        scale: isActive ? 1.02 : 1,
        boxShadow: isActive ? '0 8px 24px rgba(0,0,0,0.12)' : 'none',
      }}
      transition={{ duration: 0.2 }}
      onClick={() => hasDetails && setIsExpanded(!isExpanded)}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 pb-2">
        <div className="flex items-center gap-2">
          <div className={cn('rounded-full p-2', config.bgColor)}>
            <Icon className={cn('h-5 w-5', config.color)} />
          </div>
          <div>
            <div className="flex items-center gap-1 text-sm font-medium">
              {agent.name}
              {agent.variant && (
                <span className="text-[10px] text-gray-400">
                  ({agent.variant})
                </span>
              )}
            </div>
            <div className="text-xs capitalize text-gray-500">{agent.role}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Score Badge */}
          {agent.lastScore !== undefined && (
            <span
              className={cn(
                'rounded px-1.5 py-0.5 text-xs font-medium',
                agent.lastScore >= 70
                  ? 'bg-green-100 text-green-700'
                  : 'bg-amber-100 text-amber-700'
              )}
            >
              {agent.lastScore}分
            </span>
          )}
          {/* Retry Count */}
          {agent.retryCount !== undefined && agent.retryCount > 0 && (
            <span className="flex items-center gap-0.5 text-xs text-amber-500">
              <RefreshCw className="h-3 w-3" />
              重试{agent.retryCount}次
            </span>
          )}
          <div
            className={cn('flex items-center gap-1', statusColor[agent.status])}
          >
            {statusIcon[agent.status]}
            <span className="text-xs capitalize">{agent.status}</span>
          </div>
          {hasDetails && (
            <button className="p-1 text-gray-400 hover:text-gray-600">
              {isExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Always visible summary */}
      <div className="px-4 pb-2">
        <AnimatePresence mode="wait">
          {agent.status === 'thinking' && agent.thought && !isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="rounded-lg bg-gray-50 p-2 text-xs italic text-gray-600 dark:bg-gray-900 dark:text-gray-400"
            >
              <Brain className="mr-1 inline h-3 w-3" />
              {agent.thought}
            </motion.div>
          )}

          {agent.status === 'working' && agent.currentTask && !isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="space-y-2"
            >
              <div className="text-xs text-gray-600 dark:text-gray-400">
                {agent.currentTask}
              </div>
              {agent.progress !== undefined && (
                <div className="h-1.5 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                  <motion.div
                    className={cn(
                      'h-1.5 rounded-full',
                      config.color.replace('text-', 'bg-')
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${agent.progress}%` }}
                  />
                </div>
              )}
            </motion.div>
          )}

          {agent.status === 'completed' && agent.result && !isExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-green-600 dark:text-green-400"
            >
              <CheckCircle2 className="mr-1 inline h-3 w-3" />
              {agent.result}
              {agent.duration && (
                <span className="ml-2 text-gray-400">
                  ({(agent.duration / 1000).toFixed(1)}s)
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-100 dark:border-gray-700"
          >
            <div className="space-y-3 p-4">
              {/* All Details */}
              {agent.thought && (
                <div className="rounded-lg bg-amber-50 p-2 text-xs italic text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                  <Brain className="mr-1 inline h-3 w-3" />
                  {agent.thought}
                </div>
              )}
              {agent.currentTask && (
                <div className="text-xs text-gray-600 dark:text-gray-400">
                  <strong>当前任务：</strong>
                  {agent.currentTask}
                </div>
              )}
              {agent.result && (
                <div className="text-xs text-green-600 dark:text-green-400">
                  <CheckCircle2 className="mr-1 inline h-3 w-3" />
                  {agent.result}
                </div>
              )}

              {/* Score Dimensions */}
              {agent.scoreDimensions && agent.scoreDimensions.length > 0 && (
                <DimensionScoreList dimensions={agent.scoreDimensions} />
              )}

              {/* Progress Bar */}
              {agent.progress !== undefined && (
                <ScoreBar score={agent.progress} threshold={100} label="进度" />
              )}

              {/* Duration */}
              {agent.duration && (
                <div className="text-xs text-gray-400">
                  耗时: {(agent.duration / 1000).toFixed(1)}s
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================================================
// Handoff Arrow 组件
// ============================================================================

interface HandoffArrowProps {
  handoff: AgentHandoffData;
  isLatest: boolean;
}

function HandoffArrow({ handoff, isLatest }: HandoffArrowProps) {
  const fromConfig = AGENT_CONFIG[handoff.fromAgent];
  const toConfig = AGENT_CONFIG[handoff.toAgent];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: isLatest ? 1 : 0.5, scale: 1 }}
      className="flex items-center gap-2 py-1 text-xs"
    >
      <div className={cn('rounded-full p-1', fromConfig.bgColor)}>
        {React.createElement(fromConfig.icon, {
          className: cn('h-3 w-3', fromConfig.color),
        })}
      </div>
      <ArrowRight className="h-3 w-3 text-gray-400" />
      <div className={cn('rounded-full p-1', toConfig.bgColor)}>
        {React.createElement(toConfig.icon, {
          className: cn('h-3 w-3', toConfig.color),
        })}
      </div>
      <span className="flex-1 truncate text-gray-500">{handoff.message}</span>
    </motion.div>
  );
}

// ============================================================================
// Main Panel 组件
// ============================================================================

interface AgentTeamPanelProps {
  teamState: TeamExecutionState | null;
  compact?: boolean;
  className?: string;
}

export function AgentTeamPanel({
  teamState,
  compact = false,
  className,
}: AgentTeamPanelProps) {
  if (!teamState) {
    return (
      <div className={cn('p-4 text-center text-gray-500', className)}>
        <Sparkles className="mx-auto mb-2 h-8 w-8 text-gray-300" />
        <p className="text-sm">AI 团队待命中</p>
      </div>
    );
  }

  const agentOrder: SlidesAgentRole[] = [
    'leader',
    'analyst',
    'strategist',
    'writer',
    'reviewer',
  ];

  if (compact) {
    return (
      <div className={cn('flex flex-col', className)}>
        {/* Scrollable Compact Agent List */}
        <div className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent max-h-[400px] space-y-1.5 overflow-y-auto pr-1">
          {agentOrder.map((role) => (
            <AgentCard
              key={role}
              agent={teamState.agents[role]}
              isActive={teamState.currentAgent === role}
              compact
            />
          ))}
        </div>

        {/* Latest Handoff */}
        {teamState.handoffs.length > 0 && (
          <div className="mt-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            <HandoffArrow
              handoff={teamState.handoffs[teamState.handoffs.length - 1]}
              isLatest
            />
          </div>
        )}

        {/* Issues Summary */}
        {teamState.issues.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3" />
            <span>
              {teamState.issues.length} 个问题，已修复 {teamState.fixes.length}
            </span>
          </div>
        )}

        {/* Scoring Summary */}
        {teamState.scoringHistory && teamState.scoringHistory.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-blue-600 dark:text-blue-400">
            <TrendingUp className="h-3 w-3" />
            <span>
              {teamState.scoringHistory.length} 次评分
              {teamState.rejections && teamState.rejections.length > 0 && (
                <span className="ml-1 text-amber-500">
                  ({teamState.rejections.length} 次驳回)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Agent Switches */}
        {teamState.agentSwitches && teamState.agentSwitches.length > 0 && (
          <div className="mt-2 flex items-center gap-2 text-xs text-purple-600 dark:text-purple-400">
            <RefreshCw className="h-3 w-3" />
            <span>{teamState.agentSwitches.length} 次 Agent 切换</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('flex h-full flex-col', className)}>
      {/* Header - Fixed */}
      <div className="flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="flex items-center gap-2 font-semibold">
            <Sparkles className="h-4 w-4 text-amber-500" />
            AI 团队协作
          </h3>
          <div className="text-xs text-gray-500">
            阶段:{' '}
            <span className="font-medium capitalize">{teamState.phase}</span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-3 space-y-1">
          <div className="flex justify-between text-xs text-gray-500">
            <span>整体进度</span>
            <span>{Math.round(teamState.overallProgress)}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
            <motion.div
              className="h-2 rounded-full bg-gradient-to-r from-amber-500 via-blue-500 to-green-500"
              initial={{ width: 0 }}
              animate={{ width: `${teamState.overallProgress}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
        </div>
      </div>

      {/* Scrollable Agent Grid */}
      <div className="scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent mt-4 flex-1 overflow-y-auto pr-1">
        <div className="grid grid-cols-1 gap-3">
          {agentOrder.map((role) => (
            <AgentCard
              key={role}
              agent={teamState.agents[role]}
              isActive={teamState.currentAgent === role}
            />
          ))}
        </div>

        {/* Handoffs History */}
        {teamState.handoffs.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-xs font-medium text-gray-500">协作记录</h4>
            <div className="max-h-32 space-y-1 overflow-y-auto">
              {teamState.handoffs.slice(-5).map((handoff, index) => (
                <HandoffArrow
                  key={index}
                  handoff={handoff}
                  isLatest={index === teamState.handoffs.length - 1}
                />
              ))}
            </div>
          </div>
        )}

        {/* Issues & Fixes */}
        {(teamState.issues.length > 0 || teamState.fixes.length > 0) && (
          <div className="mt-4 space-y-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            <h4 className="text-xs font-medium text-gray-500">质量检查</h4>
            <div className="flex items-center gap-4 text-xs">
              {teamState.issues.length > 0 && (
                <div className="flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" />
                  <span>{teamState.issues.length} 个问题</span>
                </div>
              )}
              {teamState.fixes.length > 0 && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle2 className="h-3 w-3" />
                  <span>{teamState.fixes.length} 已修复</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scoring History Summary */}
        {teamState.scoringHistory && teamState.scoringHistory.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            <h4 className="flex items-center gap-1 text-xs font-medium text-gray-500">
              <TrendingUp className="h-3 w-3" />
              评分记录
            </h4>
            <div className="space-y-1">
              {teamState.scoringHistory.slice(-3).map((scoring, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-[10px]"
                >
                  <span className="text-gray-500">{scoring.phase}</span>
                  <span
                    className={
                      scoring.passed ? 'text-green-600' : 'text-amber-600'
                    }
                  >
                    {scoring.score}/{scoring.threshold}分
                    {scoring.passed ? ' ✓' : ' ✗'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Agent Switches */}
        {teamState.agentSwitches && teamState.agentSwitches.length > 0 && (
          <div className="mt-4 space-y-2 border-t border-gray-200 pt-2 dark:border-gray-700">
            <h4 className="flex items-center gap-1 text-xs font-medium text-gray-500">
              <RefreshCw className="h-3 w-3" />
              Agent 切换记录
            </h4>
            <div className="space-y-1">
              {teamState.agentSwitches.map((switchData, index) => (
                <div key={index} className="text-[10px] text-gray-500">
                  <span className="font-medium">{switchData.phase}:</span>{' '}
                  {switchData.originalAgent} → {switchData.newAgent}
                  <span className="ml-1 text-amber-500">
                    ({switchData.previousScore}分)
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default AgentTeamPanel;
