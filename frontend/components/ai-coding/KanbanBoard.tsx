'use client';

import { useState, DragEvent } from 'react';
import { CodingProject } from '@/lib/api/ai-coding';
import KanbanColumn from './KanbanColumn';

export type KanbanStatus = 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';

interface KanbanBoardProps {
  projects: CodingProject[];
  onProjectClick: (projectId: string) => void;
  onRefresh: () => void;
}

interface ColumnConfig {
  id: KanbanStatus;
  title: string;
  color: string;
  bgColor: string;
  icon: string;
}

const columns: ColumnConfig[] = [
  {
    id: 'DRAFT',
    title: 'Draft',
    color: 'text-gray-600',
    bgColor: 'bg-gray-100',
    icon: '📝',
  },
  {
    id: 'IN_PROGRESS',
    title: 'In Progress',
    color: 'text-blue-600',
    bgColor: 'bg-blue-100',
    icon: '🔄',
  },
  {
    id: 'COMPLETED',
    title: 'Completed',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    icon: '✅',
  },
  {
    id: 'FAILED',
    title: 'Failed',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    icon: '❌',
  },
];

export default function KanbanBoard({
  projects,
  onProjectClick,
  onRefresh,
}: KanbanBoardProps) {
  const [draggedProject, setDraggedProject] = useState<CodingProject | null>(
    null
  );
  const [dragOverColumn, setDragOverColumn] = useState<KanbanStatus | null>(
    null
  );

  const getProjectsByStatus = (status: KanbanStatus): CodingProject[] => {
    return projects.filter((p) => p.status === status);
  };

  const handleDragStart = (
    e: DragEvent<HTMLDivElement>,
    project: CodingProject
  ) => {
    setDraggedProject(project);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', project.id);
  };

  const handleDragEnd = () => {
    setDraggedProject(null);
    setDragOverColumn(null);
  };

  const handleDragOver = (
    e: DragEvent<HTMLDivElement>,
    status: KanbanStatus
  ) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(status);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (
    e: DragEvent<HTMLDivElement>,
    newStatus: KanbanStatus
  ) => {
    e.preventDefault();
    setDragOverColumn(null);

    if (draggedProject && draggedProject.status !== newStatus) {
      // Note: In a real implementation, this would call an API to update the project status
      // For now, we just show a message
      console.log(
        `Would move project ${draggedProject.id} from ${draggedProject.status} to ${newStatus}`
      );
      // TODO: Implement status update API call
      // await updateProject(draggedProject.id, { status: newStatus });
      // onRefresh();
    }

    setDraggedProject(null);
  };

  return (
    <div className="flex h-full gap-4 overflow-x-auto pb-4">
      {columns.map((column) => (
        <KanbanColumn
          key={column.id}
          config={column}
          projects={getProjectsByStatus(column.id)}
          onProjectClick={onProjectClick}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragOver={(e) => handleDragOver(e, column.id)}
          onDragLeave={handleDragLeave}
          onDrop={(e) => handleDrop(e, column.id)}
          isDragOver={dragOverColumn === column.id}
          draggedProject={draggedProject}
        />
      ))}
    </div>
  );
}
