'use client';

import { Inbox, Search, FileX, Plus } from 'lucide-react';
import { cn } from '@/lib/utils/common';
import { Button } from './button';

type EmptyType = 'default' | 'search' | 'noData' | 'error';

interface EmptyStateProps {
  type?: EmptyType;
  title?: string;
  description?: string;
  icon?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

const defaultConfig: Record<
  EmptyType,
  { icon: React.ReactNode; title: string; description: string }
> = {
  default: {
    icon: <Inbox className="h-12 w-12" />,
    title: '暂无内容',
    description: '这里还没有任何内容',
  },
  search: {
    icon: <Search className="h-12 w-12" />,
    title: '未找到结果',
    description: '尝试调整搜索条件或筛选器',
  },
  noData: {
    icon: <FileX className="h-12 w-12" />,
    title: '暂无数据',
    description: '开始创建你的第一个项目',
  },
  error: {
    icon: <FileX className="h-12 w-12" />,
    title: '加载失败',
    description: '请稍后重试',
  },
};

export function EmptyState({
  type = 'default',
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  const config = defaultConfig[type];

  return (
    <div
      className={cn(
        'flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center',
        className
      )}
    >
      <div className="text-gray-300">{icon || config.icon}</div>
      <div className="space-y-1">
        <h3 className="font-medium text-gray-900">{title || config.title}</h3>
        <p className="text-sm text-gray-500">
          {description || config.description}
        </p>
      </div>
      {action && (
        <Button onClick={action.onClick}>
          <Plus className="mr-2 h-4 w-4" />
          {action.label}
        </Button>
      )}
    </div>
  );
}
