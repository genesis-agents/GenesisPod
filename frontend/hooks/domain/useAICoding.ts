import { useApiGet, useApiPost, useApiPut, useApiDelete } from '../core';
import { useCallback } from 'react';

export interface CodingProject {
  id: string;
  name: string;
  description?: string;
  techStack?: {
    language?: string;
    framework?: string;
    database?: string;
  };
  status: 'draft' | 'active' | 'completed' | 'archived';
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description?: string;
  status: 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'low' | 'medium' | 'high';
  assignee?: string;
}

export function useAICoding(projectId?: string) {
  // Projects list
  const {
    data: projects,
    loading: projectsLoading,
    execute: refreshProjects,
  } = useApiGet<CodingProject[]>('/api/ai-coding/projects', {
    immediate: true,
  });

  // Single project
  const {
    data: project,
    loading: projectLoading,
    execute: refreshProject,
  } = useApiGet<CodingProject>(
    projectId ? `/api/ai-coding/projects/${projectId}` : '',
    { immediate: !!projectId }
  );

  // Project tasks
  const {
    data: tasks,
    loading: tasksLoading,
    execute: refreshTasks,
  } = useApiGet<Task[]>(
    projectId ? `/api/ai-coding/projects/${projectId}/tasks` : '',
    { immediate: !!projectId }
  );

  // Create project
  const { loading: createLoading, execute: createProjectApi } = useApiPost<
    CodingProject,
    Partial<CodingProject>
  >('/api/ai-coding/projects');

  // Update project
  const { loading: updateLoading, execute: updateProjectApi } = useApiPut<
    CodingProject,
    Partial<CodingProject>
  >(projectId ? `/api/ai-coding/projects/${projectId}` : '');

  // Create task
  const { loading: createTaskLoading, execute: createTaskApi } = useApiPost<
    Task,
    Partial<Task>
  >(projectId ? `/api/ai-coding/projects/${projectId}/tasks` : '');

  // Update task
  const { loading: updateTaskLoading, execute: updateTaskApi } = useApiPut<
    Task,
    Partial<Task>
  >('/api/ai-coding/tasks');

  const createProject = useCallback(
    async (data: Partial<CodingProject>) => {
      const result = await createProjectApi(data);
      if (result) await refreshProjects();
      return result;
    },
    [createProjectApi, refreshProjects]
  );

  const updateProject = useCallback(
    async (data: Partial<CodingProject>) => {
      const result = await updateProjectApi(data);
      if (result) await refreshProject();
      return result;
    },
    [updateProjectApi, refreshProject]
  );

  const createTask = useCallback(
    async (data: Partial<Task>) => {
      const result = await createTaskApi(data);
      if (result) await refreshTasks();
      return result;
    },
    [createTaskApi, refreshTasks]
  );

  const updateTask = useCallback(
    async (taskId: string, data: Partial<Task>) => {
      const result = await updateTaskApi({ ...data, id: taskId });
      if (result) await refreshTasks();
      return result;
    },
    [updateTaskApi, refreshTasks]
  );

  return {
    // Projects
    projects: projects ?? [],
    projectsLoading,
    refreshProjects,
    createProject,
    isCreatingProject: createLoading,

    // Current project
    project,
    projectLoading,
    refreshProject,
    updateProject,
    isUpdatingProject: updateLoading,

    // Tasks
    tasks: tasks ?? [],
    tasksLoading,
    refreshTasks,
    createTask,
    updateTask,
    isCreatingTask: createTaskLoading,
    isUpdatingTask: updateTaskLoading,
  };
}
