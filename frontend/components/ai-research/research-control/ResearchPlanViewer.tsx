'use client';

import React from 'react';
import {
  CheckCircle,
  Target,
  Users,
  Zap,
  Search,
  Play,
  X,
  AlertCircle,
} from 'lucide-react';

interface LeaderPlan {
  taskUnderstanding: {
    topic: string;
    scope: string;
    objectives: string[];
    constraints?: string[];
  };
  dimensions: Array<{
    id: string;
    name: string;
    description: string;
    searchQueries: string[];
    dataSources: string[];
    priority: number;
  }>;
  executionStrategy: {
    parallelism: number;
    priorityOrder: string[];
    estimatedTime?: string;
  };
  agentAssignments: Array<{
    agentId: string;
    agentName?: string;
    agentType: string;
    assignedDimensions?: string[];
    role: string;
    modelId?: string;
    skills?: string[];
    tools?: string[];
  }>;
}

interface ResearchPlanViewerProps {
  plan: LeaderPlan | null;
  missionStatus: string;
  onApprove: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ResearchPlanViewer({
  plan,
  missionStatus,
  onApprove,
  onCancel,
  isLoading = false,
}: ResearchPlanViewerProps) {
  if (!plan) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-zinc-200 bg-white p-12 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="text-center text-zinc-500 dark:text-zinc-400">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 opacity-50" />
          <p>暂无研究计划</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Task Understanding Section */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <Target className="h-5 w-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            任务理解
          </h3>
        </div>

        <div className="space-y-4">
          <div>
            <h4 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              研究主题
            </h4>
            <p className="text-zinc-900 dark:text-zinc-100">
              {plan.taskUnderstanding.topic}
            </p>
          </div>

          <div>
            <h4 className="mb-1 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              研究范围
            </h4>
            <p className="text-zinc-600 dark:text-zinc-400">
              {plan.taskUnderstanding.scope}
            </p>
          </div>

          <div>
            <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              研究目标
            </h4>
            <ul className="space-y-1">
              {plan.taskUnderstanding.objectives.map((objective, index) => (
                <li
                  key={index}
                  className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400"
                >
                  <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-500" />
                  <span>{objective}</span>
                </li>
              ))}
            </ul>
          </div>

          {plan.taskUnderstanding.constraints &&
            plan.taskUnderstanding.constraints.length > 0 && (
              <div>
                <h4 className="mb-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  约束条件
                </h4>
                <ul className="space-y-1">
                  {plan.taskUnderstanding.constraints.map(
                    (constraint, index) => (
                      <li
                        key={index}
                        className="flex items-start gap-2 text-zinc-600 dark:text-zinc-400"
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                        <span>{constraint}</span>
                      </li>
                    )
                  )}
                </ul>
              </div>
            )}
        </div>
      </div>

      {/* Dimensions Section */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <Search className="h-5 w-5 text-purple-500" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            研究维度
          </h3>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            ({plan.dimensions.length} 个维度)
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {plan.dimensions
            .sort((a, b) => b.priority - a.priority)
            .map((dimension) => (
              <div
                key={dimension.id}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
              >
                <div className="mb-2 flex items-start justify-between">
                  <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
                    {dimension.name}
                  </h4>
                  <span className="rounded bg-blue-100 px-2 py-1 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    P{dimension.priority}
                  </span>
                </div>

                <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
                  {dimension.description}
                </p>

                {dimension.searchQueries.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      搜索查询
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {dimension.searchQueries.slice(0, 3).map((query, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-zinc-200 px-2 py-0.5 text-xs text-zinc-700 dark:bg-zinc-700 dark:text-zinc-300"
                        >
                          {query}
                        </span>
                      ))}
                      {dimension.searchQueries.length > 3 && (
                        <span className="text-xs text-zinc-500">
                          +{dimension.searchQueries.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
        </div>
      </div>

      {/* Agent Assignments Section */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <Users className="h-5 w-5 text-green-500" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            Agent 分配
          </h3>
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            ({plan.agentAssignments.length} 个 Agent)
          </span>
        </div>

        <div className="space-y-3">
          {plan.agentAssignments.map((agent) => (
            <div
              key={agent.agentId}
              className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800"
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <h4 className="font-medium text-zinc-900 dark:text-zinc-100">
                    {agent.agentName || agent.agentId}
                  </h4>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400">
                    {agent.role}
                  </p>
                </div>
                <span className="rounded bg-green-100 px-2 py-1 text-xs text-green-700 dark:bg-green-900/30 dark:text-green-300">
                  {agent.agentType}
                </span>
              </div>

              <div className="space-y-2">
                {agent.modelId && (
                  <div className="text-xs text-zinc-600 dark:text-zinc-400">
                    <span className="font-medium">模型: </span>
                    {agent.modelId}
                  </div>
                )}

                {agent.assignedDimensions &&
                  agent.assignedDimensions.length > 0 && (
                    <div>
                      <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                        负责维度
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {agent.assignedDimensions.map((dim, idx) => (
                          <span
                            key={idx}
                            className="rounded bg-purple-100 px-2 py-0.5 text-xs text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                          >
                            {dim}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                {agent.skills && agent.skills.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      技能
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {agent.skills.map((skill, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {agent.tools && agent.tools.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                      工具
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {agent.tools.map((tool, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        >
                          {tool}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Execution Strategy Section */}
      <div className="rounded-lg border border-zinc-200 bg-white p-6 dark:border-zinc-700 dark:bg-zinc-900">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-5 w-5 text-amber-500" />
          <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
            执行策略
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">
              并行度
            </p>
            <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
              {plan.executionStrategy.parallelism}
            </p>
          </div>

          {plan.executionStrategy.estimatedTime && (
            <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
              <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">
                预估时间
              </p>
              <p className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
                {plan.executionStrategy.estimatedTime}
              </p>
            </div>
          )}

          <div className="rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <p className="mb-1 text-sm text-zinc-600 dark:text-zinc-400">
              优先级队列
            </p>
            <p className="text-sm text-zinc-900 dark:text-zinc-100">
              {plan.executionStrategy.priorityOrder.length} 个任务
            </p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      {missionStatus === 'PLAN_READY' && (
        <div className="flex items-center justify-end gap-3 pt-4">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg border border-zinc-200 px-4 py-2 text-zinc-700 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          >
            <X className="h-4 w-4" />
            取消
          </button>
          <button
            onClick={onApprove}
            disabled={isLoading}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            {isLoading ? '执行中...' : '批准并执行'}
          </button>
        </div>
      )}
    </div>
  );
}
