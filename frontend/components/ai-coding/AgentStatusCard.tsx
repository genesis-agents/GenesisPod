'use client';

/**
 * AI Coding Agent 状态卡片组件
 *
 * 展示单个 AI Agent 的实时工作状态、当前任务和思考过程
 */

import { useMemo } from 'react';
import {
  TeamMember,
  CodingAgentRole,
  CodingAgentMemberStatus,
} from '@/hooks/useAiCodingSocket';

interface AgentStatusCardProps {
  /** Agent 角色 */
  role: CodingAgentRole;
  /** 团队成员信息（可选，用于显示更详细的状态） */
  member?: TeamMember;
  /** 旧版状态（兼容现有代码） */
  legacyStatus?: {
    status: string;
    startedAt?: string;
    completedAt?: string;
  };
  /** 是否显示详细信息 */
  showDetails?: boolean;
  /** 点击回调 */
  onClick?: () => void;
}

// 角色配置
const roleConfigs: Record<
  CodingAgentRole,
  {
    name: string;
    icon: string;
    color: string;
    bgColor: string;
    borderColor: string;
    description: string;
  }
> = {
  PM: {
    name: '产品经理',
    icon: '📋',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
    description: '负责需求分析和产品规划',
  },
  ARCHITECT: {
    name: '架构师',
    icon: '🏗️',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50',
    borderColor: 'border-purple-200',
    description: '负责系统架构和技术设计',
  },
  PM_LEAD: {
    name: '项目经理',
    icon: '📊',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50',
    borderColor: 'border-orange-200',
    description: '负责任务分解和进度管理',
  },
  ENGINEER: {
    name: '工程师',
    icon: '👨‍💻',
    color: 'text-green-600',
    bgColor: 'bg-green-50',
    borderColor: 'border-green-200',
    description: '负责代码编写和实现',
  },
  QA: {
    name: 'QA工程师',
    icon: '🧪',
    color: 'text-red-600',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    description: '负责测试和质量保证',
  },
};

// 状态配置
const statusConfigs: Record<
  CodingAgentMemberStatus | 'pending' | 'running' | 'completed' | 'failed',
  {
    label: string;
    bgColor: string;
    textColor: string;
    dotColor: string;
    animate?: boolean;
  }
> = {
  IDLE: {
    label: '空闲',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    dotColor: 'bg-gray-400',
  },
  WORKING: {
    label: '工作中',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-600',
    dotColor: 'bg-blue-500',
    animate: true,
  },
  WAITING: {
    label: '等待中',
    bgColor: 'bg-yellow-100',
    textColor: 'text-yellow-600',
    dotColor: 'bg-yellow-500',
    animate: true,
  },
  ERROR: {
    label: '异常',
    bgColor: 'bg-red-100',
    textColor: 'text-red-600',
    dotColor: 'bg-red-500',
  },
  // 兼容旧状态
  pending: {
    label: '等待中',
    bgColor: 'bg-gray-100',
    textColor: 'text-gray-600',
    dotColor: 'bg-gray-400',
  },
  running: {
    label: '运行中',
    bgColor: 'bg-blue-100',
    textColor: 'text-blue-600',
    dotColor: 'bg-blue-500',
    animate: true,
  },
  completed: {
    label: '已完成',
    bgColor: 'bg-green-100',
    textColor: 'text-green-600',
    dotColor: 'bg-green-500',
  },
  failed: {
    label: '失败',
    bgColor: 'bg-red-100',
    textColor: 'text-red-600',
    dotColor: 'bg-red-500',
  },
};

export function AgentStatusCard({
  role,
  member,
  legacyStatus,
  showDetails = false,
  onClick,
}: AgentStatusCardProps) {
  const config = roleConfigs[role];

  // 确定当前状态
  const currentStatus = useMemo(() => {
    if (member?.status) {
      return member.status;
    }
    if (legacyStatus?.status) {
      return legacyStatus.status.toLowerCase() as keyof typeof statusConfigs;
    }
    return 'IDLE' as CodingAgentMemberStatus;
  }, [member?.status, legacyStatus?.status]);

  const statusConfig =
    statusConfigs[currentStatus as keyof typeof statusConfigs] ||
    statusConfigs.IDLE;

  // 获取显示名称
  const displayName = member?.displayName || config.name;
  const avatar = member?.avatar || config.icon;

  // 格式化时间
  const formatTime = (dateString?: string) => {
    if (!dateString) return null;
    const date = new Date(dateString);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // 卡片状态样式
  const cardClasses = useMemo(() => {
    const isActive = currentStatus === 'WORKING' || currentStatus === 'running';
    const isComplete = currentStatus === 'completed';
    const isError = currentStatus === 'ERROR' || currentStatus === 'failed';

    if (isActive) {
      return 'border-blue-300 bg-blue-50 shadow-md ring-2 ring-blue-200';
    }
    if (isComplete) {
      return 'border-green-200 bg-green-50';
    }
    if (isError) {
      return 'border-red-200 bg-red-50';
    }
    return 'border-gray-200 bg-gray-50 hover:bg-gray-100';
  }, [currentStatus]);

  return (
    <div
      className={`rounded-xl border p-4 transition-all duration-300 ${cardClasses} ${
        onClick
          ? 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-emerald-200'
          : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-start gap-3">
        {/* 头像 */}
        <div
          className={`relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${config.bgColor} text-xl`}
        >
          {avatar}
          {/* 状态指示点 */}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-white ${statusConfig.dotColor} ${
              statusConfig.animate ? 'animate-pulse' : ''
            }`}
          />
        </div>

        {/* 信息区域 */}
        <div className="min-w-0 flex-1">
          {/* 名称和状态 */}
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-gray-900">{displayName}</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${statusConfig.bgColor} ${statusConfig.textColor}`}
            >
              {statusConfig.animate && (
                <span className="relative flex h-2 w-2">
                  <span
                    className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusConfig.dotColor} opacity-75`}
                  />
                  <span
                    className={`relative inline-flex h-2 w-2 rounded-full ${statusConfig.dotColor}`}
                  />
                </span>
              )}
              {statusConfig.label}
            </span>
          </div>

          {/* 当前任务 */}
          {member?.currentTask && (
            <div className="mt-2 rounded-lg bg-white/60 p-2">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-gray-500">当前任务:</span>
                <span className="truncate text-xs font-medium text-gray-700">
                  {member.currentTask}
                </span>
              </div>
            </div>
          )}

          {/* 思考过程（如果有） */}
          {member?.thinking && (
            <div className="mt-2 rounded-lg border border-blue-100 bg-blue-50/50 p-2">
              <div className="flex items-start gap-1.5">
                <span className="text-sm">💭</span>
                <span className="line-clamp-2 text-xs text-blue-700">
                  {member.thinking}
                </span>
              </div>
            </div>
          )}

          {/* 详细信息 */}
          {showDetails && (
            <div className="mt-2 space-y-1 text-xs text-gray-500">
              <p>{config.description}</p>
              {legacyStatus?.startedAt && (
                <p>开始: {formatTime(legacyStatus.startedAt)}</p>
              )}
              {legacyStatus?.completedAt && (
                <p>完成: {formatTime(legacyStatus.completedAt)}</p>
              )}
            </div>
          )}
        </div>

        {/* 状态图标 */}
        <div className="flex flex-shrink-0 items-center gap-1">
          {(currentStatus === 'WORKING' || currentStatus === 'running') && (
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          )}
          {currentStatus === 'completed' && (
            <svg
              className="h-5 w-5 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {(currentStatus === 'ERROR' || currentStatus === 'failed') && (
            <svg
              className="h-5 w-5 text-red-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          )}
          {/* 可点击指示箭头 */}
          {onClick &&
            (currentStatus === 'completed' ||
              !currentStatus ||
              currentStatus === 'IDLE') && (
              <svg
                className="h-4 w-4 text-gray-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 5l7 7-7 7"
                />
              </svg>
            )}
        </div>
      </div>
    </div>
  );
}

// 团队状态面板 - 显示所有 Agent 状态
interface TeamStatusPanelProps {
  teamMembers: TeamMember[];
  legacyAgentStatus?: {
    pm?: { status: string; startedAt?: string; completedAt?: string };
    architect?: { status: string; startedAt?: string; completedAt?: string };
    pmLead?: { status: string; startedAt?: string; completedAt?: string };
    engineer?: { status: string; startedAt?: string; completedAt?: string };
    qa?: { status: string; startedAt?: string; completedAt?: string };
  };
  showDetails?: boolean;
  className?: string;
  /** 使用紧凑布局（单列） */
  compact?: boolean;
  /** Agent 点击回调 */
  onAgentClick?: (role: CodingAgentRole) => void;
}

export function TeamStatusPanel({
  teamMembers,
  legacyAgentStatus,
  showDetails = false,
  className = '',
  compact = false,
  onAgentClick,
}: TeamStatusPanelProps) {
  // 创建成员映射
  const memberByRole = useMemo(() => {
    const map = new Map<CodingAgentRole, TeamMember>();
    teamMembers.forEach((m) => map.set(m.role, m));
    return map;
  }, [teamMembers]);

  // 角色到旧状态的映射
  type LegacyStatus =
    | { status: string; startedAt?: string; completedAt?: string }
    | undefined;
  const legacyStatusMap: Record<CodingAgentRole, LegacyStatus> = {
    PM: legacyAgentStatus?.pm,
    ARCHITECT: legacyAgentStatus?.architect,
    PM_LEAD: legacyAgentStatus?.pmLead,
    ENGINEER: legacyAgentStatus?.engineer,
    QA: legacyAgentStatus?.qa,
  };

  const roles: CodingAgentRole[] = [
    'PM',
    'ARCHITECT',
    'PM_LEAD',
    'ENGINEER',
    'QA',
  ];

  return (
    <div
      className={`rounded-2xl border border-gray-200 bg-white p-6 ${className}`}
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">AI 团队状态</h3>
        {teamMembers.length > 0 && (
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
            {teamMembers.filter((m) => m.status === 'WORKING').length} 人工作中
          </span>
        )}
      </div>
      <div
        className={
          compact
            ? 'grid grid-cols-1 gap-3'
            : 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5'
        }
      >
        {roles.map((role) => (
          <AgentStatusCard
            key={role}
            role={role}
            member={memberByRole.get(role)}
            legacyStatus={legacyStatusMap[role]}
            showDetails={showDetails}
            onClick={onAgentClick ? () => onAgentClick(role) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export default AgentStatusCard;
