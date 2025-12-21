'use client';

import { DragEvent } from 'react';
import { CodingProject } from '@/lib/api/ai-coding';
import KanbanCard from './KanbanCard';

interface ColumnConfig {
  id: string;
  title: string;
  color: string;
  bgColor: string;
  icon: string;
}

interface KanbanColumnProps {
  config: ColumnConfig;
  projects: CodingProject[];
  onProjectClick: (projectId: string) => void;
  onDragStart: (e: DragEvent<HTMLDivElement>, project: CodingProject) => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
  isDragOver: boolean;
  draggedProject: CodingProject | null;
}

export default function KanbanColumn({
  config,
  projects,
  onProjectClick,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDragLeave,
  onDrop,
  isDragOver,
  draggedProject,
}: KanbanColumnProps) {
  return (
    <div
      className={`flex h-full w-80 flex-shrink-0 flex-col rounded-xl bg-gray-50 transition-all ${
        isDragOver ? 'ring-2 ring-emerald-400 ring-offset-2' : ''
      }`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Column Header */}
      <div className="flex items-center justify-between rounded-t-xl border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">{config.icon}</span>
          <h3 className={`font-semibold ${config.color}`}>{config.title}</h3>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.bgColor} ${config.color}`}
          >
            {projects.length}
          </span>
        </div>
      </div>

      {/* Cards Container */}
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {projects.length === 0 ? (
          <div
            className={`flex h-32 items-center justify-center rounded-lg border-2 border-dashed ${
              isDragOver
                ? 'border-emerald-400 bg-emerald-50'
                : 'border-gray-200'
            }`}
          >
            <p className="text-sm text-gray-400">
              {isDragOver ? 'Drop here' : 'No projects'}
            </p>
          </div>
        ) : (
          projects.map((project) => (
            <KanbanCard
              key={project.id}
              project={project}
              onClick={() => onProjectClick(project.id)}
              onDragStart={(e) => onDragStart(e, project)}
              onDragEnd={onDragEnd}
              isDragging={draggedProject?.id === project.id}
            />
          ))
        )}

        {/* Drop Zone Indicator */}
        {isDragOver && projects.length > 0 && (
          <div className="flex h-24 items-center justify-center rounded-lg border-2 border-dashed border-emerald-400 bg-emerald-50">
            <p className="text-sm text-emerald-600">Drop here</p>
          </div>
        )}
      </div>
    </div>
  );
}
