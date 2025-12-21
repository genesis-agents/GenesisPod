'use client';

import { DragEvent } from 'react';
import { CodingProject } from '@/lib/api/ai-coding';
import { formatDistanceToNow } from 'date-fns';
import { zhCN } from 'date-fns/locale';

interface KanbanCardProps {
  project: CodingProject;
  onClick: () => void;
  onDragStart: (e: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

export default function KanbanCard({
  project,
  onClick,
  onDragStart,
  onDragEnd,
  isDragging,
}: KanbanCardProps) {
  const agentIcons: Record<string, string> = {
    pm: '📝',
    architect: '🏗️',
    pmLead: '📋',
    engineer: '💻',
    qa: '🔍',
  };

  const getAgentStatusColor = (status?: string): string => {
    switch (status?.toLowerCase()) {
      case 'completed':
        return 'bg-green-500';
      case 'running':
        return 'bg-blue-500 animate-pulse';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-300';
    }
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`group cursor-pointer rounded-xl border bg-white p-4 shadow-sm transition-all hover:shadow-md ${
        isDragging
          ? 'rotate-3 scale-105 opacity-50 shadow-lg'
          : 'hover:border-emerald-200'
      }`}
    >
      {/* Project Title */}
      <h4 className="font-medium text-gray-900 group-hover:text-emerald-600">
        {project.name}
      </h4>

      {/* Description */}
      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
          {project.description}
        </p>
      )}

      {/* Progress Bar */}
      {project.status === 'IN_PROGRESS' && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">Progress</span>
            <span className="font-medium text-emerald-600">
              {project.progress}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all duration-500"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Agent Status */}
      <div className="mt-3 flex items-center gap-1">
        {Object.entries(agentIcons).map(([agent, icon]) => {
          const status =
            project.agentStatus?.[agent as keyof typeof project.agentStatus];
          return (
            <div
              key={agent}
              className="relative"
              title={`${agent}: ${status?.status || 'pending'}`}
            >
              <span className="text-sm opacity-60">{icon}</span>
              <div
                className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-white ${getAgentStatusColor(
                  status?.status
                )}`}
              />
            </div>
          );
        })}
      </div>

      {/* Tech Stack Tags */}
      <div className="mt-3 flex flex-wrap gap-1">
        {project.techStack?.frontend && (
          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
            {project.techStack.frontend}
          </span>
        )}
        {project.techStack?.backend && (
          <span className="rounded bg-green-50 px-1.5 py-0.5 text-xs text-green-600">
            {project.techStack.backend}
          </span>
        )}
        {project.techStack?.database && (
          <span className="rounded bg-purple-50 px-1.5 py-0.5 text-xs text-purple-600">
            {project.techStack.database}
          </span>
        )}
      </div>

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-400">
        <span>
          {formatDistanceToNow(new Date(project.createdAt), {
            addSuffix: true,
            locale: zhCN,
          })}
        </span>
        <span>v{project.iterationCount}</span>
      </div>
    </div>
  );
}
