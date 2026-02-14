'use client';

/**
 * IdeasPanel - 展示讨论产出的 Ideas 和研究方向
 *
 * 从研究 session 的 discussion 消息中提取：
 * - 确定的研究方向（directions）
 * - 团队成员提出的 Ideas
 * - 分析师的关键质疑
 * - 总监的综合洞察
 * - 研究发现摘要
 */

import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Crown,
  Search,
  BarChart3,
  Lightbulb,
  Target,
  AlertTriangle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Compass,
  MessageSquare,
  Layers,
} from 'lucide-react';
import { cn } from '@/lib/utils/common';

// ==================== Types ====================

interface DiscussionMessageData {
  id: string;
  agentRole: string;
  agentName: string;
  agentIcon: string;
  content: string;
  phase: string;
  messageType: string;
  metadata?: {
    searchResults?: unknown[];
    directions?: string[];
    citations?: number[];
  };
  timestamp: string | Date;
}

interface ResearchDirectionData {
  title: string;
  description?: string;
  assignedTo?: string;
  searchQueries?: string[];
}

interface IdeasPanelProps {
  discussion: DiscussionMessageData[];
  directions?: { directions: ResearchDirectionData[] } | null;
  query: string;
  className?: string;
}

// ==================== Icon Mapping ====================

const ROLE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  director: Crown,
  researcher: Search,
  analyst: BarChart3,
};

const ROLE_COLOR: Record<string, string> = {
  director: 'text-purple-600 bg-purple-50 border-purple-200',
  researcher: 'text-blue-600 bg-blue-50 border-blue-200',
  analyst: 'text-amber-600 bg-amber-50 border-amber-200',
};

// ==================== Component ====================

export function IdeasPanel({
  discussion,
  directions,
  query,
  className,
}: IdeasPanelProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    'directions'
  );

  // Extract different types of insights from discussion messages
  const extracted = useMemo(() => {
    const ideas: DiscussionMessageData[] = [];
    const proposals: DiscussionMessageData[] = [];
    const critiques: DiscussionMessageData[] = [];
    const findings: DiscussionMessageData[] = [];
    const syntheses: DiscussionMessageData[] = [];

    for (const msg of discussion) {
      if (msg.messageType === 'system' || msg.messageType === 'status') {
        continue;
      }
      switch (msg.messageType) {
        case 'idea':
          ideas.push(msg);
          break;
        case 'proposal':
          proposals.push(msg);
          break;
        case 'critique':
          critiques.push(msg);
          break;
        case 'findings':
          findings.push(msg);
          break;
        case 'synthesis':
        case 'cross_check':
          syntheses.push(msg);
          break;
      }
    }

    return { ideas, proposals, critiques, findings, syntheses };
  }, [discussion]);

  const directionsList = directions?.directions ?? [];

  const toggleSection = (key: string) => {
    setExpandedSection((prev) => (prev === key ? null : key));
  };

  const sections = [
    {
      key: 'directions',
      icon: Target,
      title: '确定的研究方向',
      count: directionsList.length,
      color: 'text-purple-700 bg-purple-50',
      iconColor: 'text-purple-600',
    },
    {
      key: 'ideas',
      icon: Lightbulb,
      title: '团队提出的 Ideas',
      count: extracted.ideas.length,
      color: 'text-blue-700 bg-blue-50',
      iconColor: 'text-blue-600',
    },
    {
      key: 'critiques',
      icon: AlertTriangle,
      title: '关键质疑与盲区',
      count: extracted.critiques.length,
      color: 'text-amber-700 bg-amber-50',
      iconColor: 'text-amber-600',
    },
    {
      key: 'findings',
      icon: BookOpen,
      title: '研究发现',
      count: extracted.findings.length,
      color: 'text-green-700 bg-green-50',
      iconColor: 'text-green-600',
    },
    {
      key: 'syntheses',
      icon: Layers,
      title: '综合洞察',
      count: extracted.syntheses.length,
      color: 'text-indigo-700 bg-indigo-50',
      iconColor: 'text-indigo-600',
    },
  ];

  return (
    <div className={cn('space-y-4', className)}>
      {/* Header */}
      <div className="rounded-xl bg-gradient-to-r from-purple-50 to-indigo-50 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-purple-100 p-2">
            <Compass className="h-5 w-5 text-purple-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">讨论成果总览</h3>
            <p className="mt-1 text-sm text-gray-600">
              团队围绕「{query}」讨论产出的所有 Ideas、研究方向和关键洞察
            </p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="mt-4 flex flex-wrap gap-3">
          <StatBadge
            icon={Target}
            label="研究方向"
            count={directionsList.length}
            color="purple"
          />
          <StatBadge
            icon={Lightbulb}
            label="Ideas"
            count={extracted.ideas.length}
            color="blue"
          />
          <StatBadge
            icon={MessageSquare}
            label="讨论消息"
            count={
              discussion.filter(
                (m) => m.messageType !== 'system' && m.messageType !== 'status'
              ).length
            }
            color="gray"
          />
        </div>
      </div>

      {/* Accordion Sections */}
      {sections.map((section) => {
        if (section.count === 0) return null;

        const isExpanded = expandedSection === section.key;
        const SectionIcon = section.icon;

        return (
          <div
            key={section.key}
            className="overflow-hidden rounded-xl border border-gray-200 bg-white"
          >
            {/* Section Header */}
            <button
              onClick={() => toggleSection(section.key)}
              className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg',
                    section.color
                  )}
                >
                  <SectionIcon className={cn('h-4 w-4', section.iconColor)} />
                </div>
                <div>
                  <h4 className="font-medium text-gray-900">{section.title}</h4>
                  <span className="text-xs text-gray-500">
                    {section.count} 条
                  </span>
                </div>
              </div>
              {isExpanded ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </button>

            {/* Section Content */}
            <AnimatePresence>
              {isExpanded && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden"
                >
                  <div className="border-t border-gray-100 p-4">
                    {section.key === 'directions' && (
                      <DirectionsList directions={directionsList} />
                    )}
                    {section.key === 'ideas' && (
                      <MessageCards messages={extracted.ideas} />
                    )}
                    {section.key === 'critiques' && (
                      <MessageCards messages={extracted.critiques} />
                    )}
                    {section.key === 'findings' && (
                      <MessageCards messages={extracted.findings} />
                    )}
                    {section.key === 'syntheses' && (
                      <MessageCards messages={extracted.syntheses} />
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}

      {/* Empty State */}
      {discussion.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 py-12 text-center">
          <MessageSquare className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm text-gray-500">
            该研究使用旧版模式，没有讨论记录
          </p>
        </div>
      )}
    </div>
  );
}

// ==================== Sub Components ====================

function StatBadge({
  icon: Icon,
  label,
  count,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  count: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    purple: 'bg-purple-100 text-purple-700',
    blue: 'bg-blue-100 text-blue-700',
    gray: 'bg-gray-100 text-gray-700',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium',
        colorMap[color] || colorMap.gray
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {count} {label}
    </span>
  );
}

function DirectionsList({
  directions,
}: {
  directions: ResearchDirectionData[];
}) {
  return (
    <div className="space-y-3">
      {directions.map((dir, index) => (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.05 }}
          className="flex gap-3 rounded-lg border border-gray-100 bg-gray-50 p-4"
        >
          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-purple-600 text-xs font-bold text-white">
            {index + 1}
          </span>
          <div className="min-w-0 flex-1">
            <h5 className="font-medium text-gray-900">{dir.title}</h5>
            {dir.description && (
              <p className="mt-1 text-sm text-gray-600">{dir.description}</p>
            )}
            {dir.assignedTo && (
              <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                <Search className="h-3 w-3" />
                {dir.assignedTo}
              </span>
            )}
            {dir.searchQueries && dir.searchQueries.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {dir.searchQueries.map((q, qi) => (
                  <span
                    key={qi}
                    className="rounded bg-gray-200 px-2 py-0.5 text-xs text-gray-600"
                  >
                    {q}
                  </span>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function MessageCards({ messages }: { messages: DiscussionMessageData[] }) {
  return (
    <div className="space-y-3">
      {messages.map((msg, index) => {
        const RoleIcon = ROLE_ICON[msg.agentRole] || Search;
        const roleColor =
          ROLE_COLOR[msg.agentRole] ||
          'text-gray-600 bg-gray-50 border-gray-200';

        return (
          <motion.div
            key={msg.id || index}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            className={cn('rounded-lg border p-4', roleColor)}
          >
            {/* Agent Header */}
            <div className="mb-2 flex items-center gap-2">
              <RoleIcon className="h-4 w-4" />
              <span className="text-sm font-medium">{msg.agentName}</span>
              <span className="text-xs opacity-60">
                {msg.phase === 'ideation'
                  ? '头脑风暴'
                  : msg.phase === 'findings'
                    ? '汇报发现'
                    : '综合分析'}
              </span>
            </div>

            {/* Content */}
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
              {msg.content}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

export default IdeasPanel;
