'use client';

/**
 * AI Coding 团队对话面板组件
 *
 * 展示团队成员之间的实时协作消息
 */

import { useEffect, useRef, useMemo } from 'react';
import {
  TeamMember,
  CodingAgentRole,
  CodingMessageType,
} from '@/hooks/useAiCodingSocket';

interface TeamMessage {
  id: string;
  senderId?: string;
  senderRole?: CodingAgentRole;
  content: string;
  messageType: CodingMessageType;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

interface TeamChatPanelProps {
  messages: TeamMessage[];
  teamMembers: TeamMember[];
  isLoading?: boolean;
  className?: string;
}

// 角色显示名称映射
const roleDisplayNames: Record<CodingAgentRole, string> = {
  PM: '产品经理',
  ARCHITECT: '架构师',
  PM_LEAD: '项目经理',
  ENGINEER: '工程师',
  QA: 'QA工程师',
};

// 角色头像映射
const roleAvatars: Record<CodingAgentRole, string> = {
  PM: '📋',
  ARCHITECT: '🏗️',
  PM_LEAD: '📊',
  ENGINEER: '👨‍💻',
  QA: '🧪',
};

// 消息类型样式映射
const messageTypeStyles: Record<
  CodingMessageType,
  { bg: string; border: string; icon: string }
> = {
  SYSTEM: {
    bg: 'bg-gray-50',
    border: 'border-gray-200',
    icon: '🔔',
  },
  THINKING: {
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: '💭',
  },
  OUTPUT: {
    bg: 'bg-green-50',
    border: 'border-green-200',
    icon: '✅',
  },
  ERROR: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: '❌',
  },
  FEEDBACK: {
    bg: 'bg-yellow-50',
    border: 'border-yellow-200',
    icon: '💬',
  },
  APPROVAL: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: '✓',
  },
  REQUEST: {
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    icon: '❓',
  },
};

// 单条消息组件
function ChatMessage({
  message,
  member,
}: {
  message: TeamMessage;
  member?: TeamMember;
}) {
  const style =
    messageTypeStyles[message.messageType] || messageTypeStyles.SYSTEM;
  const isSystem = !message.senderRole;

  const avatar = isSystem
    ? '🤖'
    : member?.avatar || roleAvatars[message.senderRole!] || '👤';

  const senderName = isSystem
    ? '系统'
    : member?.displayName || roleDisplayNames[message.senderRole!] || '未知';

  const formattedTime = useMemo(() => {
    const date = new Date(message.createdAt);
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }, [message.createdAt]);

  return (
    <div
      className={`rounded-lg border p-3 ${style.bg} ${style.border} transition-all hover:shadow-sm`}
    >
      <div className="flex items-start gap-3">
        {/* 头像 */}
        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-white text-lg shadow-sm">
          {avatar}
        </div>

        {/* 消息内容 */}
        <div className="min-w-0 flex-1">
          {/* 发送者和时间 */}
          <div className="mb-1 flex items-center gap-2">
            <span className="font-medium text-gray-900">{senderName}</span>
            <span className="text-xs text-gray-400">{formattedTime}</span>
            {message.messageType !== 'SYSTEM' && (
              <span className="rounded bg-white/50 px-1.5 py-0.5 text-xs text-gray-500">
                {style.icon} {message.messageType}
              </span>
            )}
          </div>

          {/* 消息正文 */}
          <div className="whitespace-pre-wrap text-sm text-gray-700">
            {message.content}
          </div>

          {/* 元数据（如果有） */}
          {message.metadata && Object.keys(message.metadata).length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-600">
                查看详情
              </summary>
              <pre className="mt-1 max-h-32 overflow-auto rounded bg-white/50 p-2 text-xs text-gray-600">
                {JSON.stringify(message.metadata, null, 2)}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}

// 主组件
export function TeamChatPanel({
  messages,
  teamMembers,
  isLoading = false,
  className = '',
}: TeamChatPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // 创建成员 ID 到成员的映射
  const memberMap = useMemo(() => {
    const map = new Map<string, TeamMember>();
    teamMembers.forEach((m) => map.set(m.id, m));
    return map;
  }, [teamMembers]);

  // 自动滚动到底部
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  if (isLoading) {
    return (
      <div
        className={`flex h-full items-center justify-center rounded-xl border border-gray-200 bg-white ${className}`}
      >
        <div className="flex flex-col items-center gap-3">
          <div className="border-3 h-8 w-8 animate-spin rounded-full border-emerald-500 border-t-transparent" />
          <span className="text-sm text-gray-500">加载团队消息...</span>
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div
        className={`flex h-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-white ${className}`}
      >
        <div className="text-4xl">💬</div>
        <p className="mt-2 text-sm text-gray-500">暂无团队消息</p>
        <p className="text-xs text-gray-400">
          启动项目后，团队成员会在这里协作沟通
        </p>
      </div>
    );
  }

  return (
    <div
      className={`flex flex-col rounded-xl border border-gray-200 bg-white ${className}`}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="font-medium text-gray-900">团队协作</h3>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {messages.length} 条消息
          </span>
        </div>
        {/* 团队成员状态指示器 */}
        <div className="flex items-center gap-1">
          {teamMembers.slice(0, 5).map((member) => (
            <div
              key={member.id}
              className="relative"
              title={`${member.displayName}: ${member.status}`}
            >
              <span className="text-sm">{member.avatar}</span>
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white ${
                  member.status === 'WORKING'
                    ? 'bg-green-500'
                    : member.status === 'ERROR'
                      ? 'bg-red-500'
                      : 'bg-gray-300'
                }`}
              />
            </div>
          ))}
        </div>
      </div>

      {/* 消息列表 */}
      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            message={message}
            member={
              message.senderId ? memberMap.get(message.senderId) : undefined
            }
          />
        ))}
      </div>
    </div>
  );
}

export default TeamChatPanel;
