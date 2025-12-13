'use client';

/**
 * AgentCard 组件
 * Agent 选择卡片，展示 Agent 信息和快捷入口
 *
 * 参考 Genspark 设计:
 * - 大图标 + 名称
 * - 简短描述
 * - 能力标签
 * - 热门模板快捷入口
 */

import React from 'react';
import { motion } from 'framer-motion';
import { AgentConfig, AgentTemplate } from '@/lib/ai-office/agents/types';
import { cn } from '@/lib/utils';

interface AgentCardProps {
  agent: AgentConfig;
  isSelected?: boolean;
  isDisabled?: boolean;
  onClick?: () => void;
  onTemplateClick?: (template: AgentTemplate) => void;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function AgentCard({
  agent,
  isSelected = false,
  isDisabled = false,
  onClick,
  onTemplateClick,
  className,
  size = 'md',
}: AgentCardProps) {
  const sizeClasses = {
    sm: 'p-3',
    md: 'p-4',
    lg: 'p-6',
  };

  const iconSizes = {
    sm: 'text-2xl',
    md: 'text-3xl',
    lg: 'text-4xl',
  };

  return (
    <motion.div
      whileHover={!isDisabled ? { scale: 1.02 } : undefined}
      whileTap={!isDisabled ? { scale: 0.98 } : undefined}
      className={cn(
        'bg-card relative cursor-pointer rounded-xl border transition-all duration-200',
        sizeClasses[size],
        isSelected
          ? 'border-primary ring-primary/20 shadow-lg ring-2'
          : 'border-border hover:border-primary/50 hover:shadow-md',
        isDisabled && 'cursor-not-allowed opacity-50',
        className
      )}
      onClick={() => !isDisabled && onClick?.()}
    >
      {/* 选中指示器 */}
      {isSelected && (
        <div
          className="absolute right-2 top-2 h-3 w-3 rounded-full"
          style={{ backgroundColor: agent.color }}
        />
      )}

      {/* 头部：图标 + 名称 */}
      <div className="mb-3 flex items-center gap-3">
        <div
          className={cn(
            'flex h-12 w-12 items-center justify-center rounded-lg',
            iconSizes[size]
          )}
          style={{ backgroundColor: `${agent.color}15` }}
        >
          {agent.icon}
        </div>
        <div>
          <h3 className="text-foreground font-semibold">{agent.name}</h3>
          <p className="text-muted-foreground line-clamp-1 text-xs">
            {agent.description}
          </p>
        </div>
      </div>

      {/* 能力标签 */}
      {size !== 'sm' && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {agent.capabilities.slice(0, 4).map((cap, i) => (
            <span
              key={i}
              className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-xs"
            >
              {cap}
            </span>
          ))}
        </div>
      )}

      {/* 模板快捷入口 */}
      {size === 'lg' && agent.templates.length > 0 && (
        <div className="border-border mt-4 border-t pt-4">
          <p className="text-muted-foreground mb-2 text-xs">快速开始</p>
          <div className="flex flex-wrap gap-2">
            {agent.templates.slice(0, 3).map((template) => (
              <button
                key={template.id}
                className="bg-primary/10 text-primary hover:bg-primary/20 rounded-full px-3 py-1 text-xs transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  onTemplateClick?.(template);
                }}
              >
                {template.icon} {template.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

/**
 * AgentCardGrid 组件
 * Agent 卡片网格布局
 */
interface AgentCardGridProps {
  agents: AgentConfig[];
  selectedAgent?: string;
  onAgentSelect?: (agent: AgentConfig) => void;
  onTemplateClick?: (agent: AgentConfig, template: AgentTemplate) => void;
  columns?: 2 | 3 | 4;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function AgentCardGrid({
  agents,
  selectedAgent,
  onAgentSelect,
  onTemplateClick,
  columns = 4,
  size = 'md',
  className,
}: AgentCardGridProps) {
  const gridClasses = {
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
  };

  return (
    <div className={cn('grid gap-4', gridClasses[columns], className)}>
      {agents.map((agent) => (
        <AgentCard
          key={agent.type}
          agent={agent}
          isSelected={selectedAgent === agent.type}
          size={size}
          onClick={() => onAgentSelect?.(agent)}
          onTemplateClick={(template) => onTemplateClick?.(agent, template)}
        />
      ))}
    </div>
  );
}

export default AgentCard;
