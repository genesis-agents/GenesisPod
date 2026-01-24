'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import AppShell from '@/components/layout/AppShell';
import { getProjects, CodingProject } from '@/lib/api/ai-coding';
import { useTranslation } from '@/lib/i18n';

import { logger } from '@/lib/utils/logger';
interface AgentStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
}

// Template types
interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  techStack: {
    frontend?: string;
    backend?: string;
    database?: string;
  };
  examplePrompt: string;
}

const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'web-app',
    name: 'Web App',
    description: '', // Will use i18n
    icon: '🌐',
    techStack: {
      frontend: 'React',
      backend: 'Node.js',
      database: 'PostgreSQL',
    },
    examplePrompt: '', // Will use i18n
  },
  {
    id: 'cli-tool',
    name: 'CLI Tool',
    description: '', // Will use i18n
    icon: '⌨️',
    techStack: {
      backend: 'Python',
    },
    examplePrompt: '', // Will use i18n
  },
  {
    id: 'api-server',
    name: 'API Server',
    description: '', // Will use i18n
    icon: '🔌',
    techStack: {
      backend: 'Node.js',
      database: 'PostgreSQL',
    },
    examplePrompt: '', // Will use i18n
  },
  {
    id: 'data-analysis',
    name: 'Data Analysis',
    description: '', // Will use i18n
    icon: '📊',
    techStack: {
      backend: 'Python',
    },
    examplePrompt: '', // Will use i18n
  },
];

export default function AICodingPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  const [projects, setProjects] = useState<CodingProject[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isAuthenticated = !!accessToken;

  // Fetch projects from API
  useEffect(() => {
    if (!isAuthenticated) return;

    const fetchProjects = async () => {
      setIsLoadingProjects(true);
      setProjectsError(null);
      try {
        const response = await getProjects({ limit: 50 });
        setProjects(response.projects || []);
      } catch (error) {
        logger.error('Failed to fetch projects:', error);
        setProjectsError(
          error instanceof Error ? error.message : 'Failed to load projects'
        );
      } finally {
        setIsLoadingProjects(false);
      }
    };

    fetchProjects();
  }, [isAuthenticated]);

  // Filter projects by search
  const filteredProjects = projects.filter((project) => {
    if (!searchQuery) return true;
    return (
      project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      project.requirement.toLowerCase().includes(searchQuery.toLowerCase())
    );
  });

  const handleCreateProject = useCallback(() => {
    setShowCreateDialog(true);
  }, []);

  const handleTemplateClick = useCallback(
    (template: ProjectTemplate) => {
      router.push(`/ai-coding/new?template=${template.id}`);
    },
    [router]
  );

  if (authLoading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <svg
            className="h-16 w-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700">
            {t('aiCoding.signIn.title')}
          </h2>
          <p className="text-gray-500">{t('aiCoding.signIn.description')}</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/25">
                  <svg
                    className="h-7 w-7 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {t('aiCoding.title')}
                  </h1>
                  <p className="text-sm text-gray-500">
                    {t('aiCoding.subtitle')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push('/ai-coding/kanban')}
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                    />
                  </svg>
                  {t('aiCoding.kanban')}
                </button>
                <button
                  onClick={handleCreateProject}
                  className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700"
                >
                  <svg
                    className="h-5 w-5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  {t('aiCoding.newProject')}
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div className="mt-4">
              <div className="relative">
                <svg
                  className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder={t('aiCoding.search.placeholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-white py-3 pl-12 pr-4 text-sm outline-none transition-all focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          {/* Loading State */}
          {isLoadingProjects && (
            <div className="flex items-center justify-center py-16">
              <div className="flex flex-col items-center gap-4">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
                <p className="text-sm text-gray-500">{t('aiCoding.loading')}</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {projectsError && !isLoadingProjects && (
            <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-3">
                <svg
                  className="h-5 w-5 text-red-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span className="text-sm text-red-700">{projectsError}</span>
                <button
                  onClick={() => window.location.reload()}
                  className="ml-auto text-sm font-medium text-red-600 hover:text-red-700"
                >
                  {t('aiCoding.error.retry')}
                </button>
              </div>
            </div>
          )}

          {/* Hero Section - when no projects */}
          {!isLoadingProjects && !projectsError && projects.length === 0 && (
            <div className="mb-8 rounded-2xl bg-gradient-to-br from-emerald-50 via-teal-50 to-cyan-50 p-8">
              <div className="mx-auto max-w-2xl text-center">
                <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-lg">
                  <svg
                    className="h-8 w-8 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
                    />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {t('aiCoding.hero.title')}
                </h2>
                <p className="mt-2 text-gray-600">
                  {t('aiCoding.hero.description')}
                </p>

                {/* Quick Start Input */}
                <div className="mt-6">
                  <button
                    onClick={handleCreateProject}
                    className="inline-flex items-center gap-3 rounded-xl bg-emerald-600 px-8 py-4 text-lg font-medium text-white shadow-lg shadow-emerald-500/25 transition-all hover:bg-emerald-700 hover:shadow-xl"
                  >
                    <svg
                      className="h-6 w-6"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {t('aiCoding.hero.startButton')}
                  </button>
                </div>

                {/* Features */}
                <div className="mt-8 grid grid-cols-3 gap-4">
                  <div className="rounded-xl bg-white/70 p-4 backdrop-blur-sm">
                    <div className="mb-2 text-2xl">📝</div>
                    <div className="text-sm font-medium text-gray-900">
                      {t('aiCoding.features.prd.title')}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {t('aiCoding.features.prd.description')}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/70 p-4 backdrop-blur-sm">
                    <div className="mb-2 text-2xl">🏗️</div>
                    <div className="text-sm font-medium text-gray-900">
                      {t('aiCoding.features.architecture.title')}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {t('aiCoding.features.architecture.description')}
                    </div>
                  </div>
                  <div className="rounded-xl bg-white/70 p-4 backdrop-blur-sm">
                    <div className="mb-2 text-2xl">💻</div>
                    <div className="text-sm font-medium text-gray-900">
                      {t('aiCoding.features.code.title')}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {t('aiCoding.features.code.description')}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Recent Projects */}
          {!isLoadingProjects && filteredProjects.length > 0 && (
            <div className="mb-8">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  {t('aiCoding.projects.recent')}
                </h3>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredProjects.map((project) => (
                  <ProjectCard
                    key={project.id}
                    project={project}
                    onClick={() => router.push(`/ai-coding/${project.id}`)}
                  />
                ))}

                {/* Create New Card */}
                <button
                  onClick={handleCreateProject}
                  className="flex min-h-[180px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-white p-6 transition-colors hover:border-emerald-400 hover:bg-emerald-50"
                >
                  <svg
                    className="h-10 w-10 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span className="mt-2 text-sm font-medium text-gray-600">
                    {t('aiCoding.projects.createNew')}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Templates */}
          {!isLoadingProjects && (
            <div>
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                {t('aiCoding.templates.title')}
              </h3>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {PROJECT_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className="group rounded-xl border border-gray-200 bg-white p-4 text-left transition-all hover:border-emerald-300 hover:shadow-md"
                  >
                    <div className="mb-3 text-3xl">{template.icon}</div>
                    <div className="font-medium text-gray-900 group-hover:text-emerald-600">
                      {t(`aiCoding.templates.${template.id}.name`)}
                    </div>
                    <div className="mt-1 text-sm text-gray-500">
                      {t(`aiCoding.templates.${template.id}.description`)}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-1">
                      {template.techStack.frontend && (
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
                          {template.techStack.frontend}
                        </span>
                      )}
                      {template.techStack.backend && (
                        <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
                          {template.techStack.backend}
                        </span>
                      )}
                      {template.techStack.database && (
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs text-purple-600">
                          {template.techStack.database}
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* AI Agents Info */}
          {!isLoadingProjects && (
            <div className="mt-8 rounded-2xl border border-gray-200 bg-white p-6">
              <h3 className="mb-4 text-lg font-semibold text-gray-900">
                {t('aiCoding.agents.title')}
              </h3>
              <div className="grid grid-cols-5 gap-4">
                {[
                  {
                    key: 'pm',
                    role: 'PM',
                    icon: '📝',
                    color: 'blue',
                  },
                  {
                    key: 'architect',
                    role: 'Architect',
                    icon: '🏗️',
                    color: 'purple',
                  },
                  {
                    key: 'projectManager',
                    role: 'PM Lead',
                    icon: '📋',
                    color: 'orange',
                  },
                  {
                    key: 'engineer',
                    role: 'Engineer',
                    icon: '💻',
                    color: 'green',
                  },
                  {
                    key: 'qa',
                    role: 'QA Engineer',
                    icon: '🔍',
                    color: 'red',
                  },
                ].map((agent) => (
                  <div
                    key={agent.role}
                    className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center"
                  >
                    <div className="mb-2 text-2xl">{agent.icon}</div>
                    <div className="font-medium text-gray-900">
                      {t(`aiCoding.agents.${agent.key}.name`)}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">
                      {t(`aiCoding.agents.${agent.key}.description`)}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-center text-sm text-gray-500">
                {t('aiCoding.agents.teamDescription')}
              </p>
            </div>
          )}
        </div>
      </main>

      {/* Create Project Dialog */}
      {showCreateDialog && (
        <CreateProjectDialog
          onClose={() => setShowCreateDialog(false)}
          onCreate={(requirement) => {
            // For now, navigate to a new project page
            router.push(
              `/ai-coding/new?requirement=${encodeURIComponent(requirement)}`
            );
          }}
        />
      )}
    </AppShell>
  );
}

// Project Card Component
function ProjectCard({
  project,
  onClick,
}: {
  project: CodingProject;
  onClick: () => void;
}) {
  const { t } = useTranslation();

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return t('aiCoding.time.justNow');
    if (minutes < 60) return t('aiCoding.time.mAgo', { count: minutes });
    if (hours < 24) return t('aiCoding.time.hAgo', { count: hours });
    if (days < 7) return t('aiCoding.time.dAgo', { count: days });
    return date.toLocaleDateString();
  };

  // Map backend status enums to UI styles
  const statusColors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    IN_PROGRESS: 'bg-blue-100 text-blue-600',
    COMPLETED: 'bg-green-100 text-green-600',
    FAILED: 'bg-red-100 text-red-600',
  };

  const getStatusLabel = (status: string) => {
    const statusKeys: Record<string, string> = {
      DRAFT: 'draft',
      IN_PROGRESS: 'inProgress',
      COMPLETED: 'completed',
      FAILED: 'failed',
    };
    return t(`aiCoding.status.${statusKeys[status] || 'draft'}`);
  };

  return (
    <div
      onClick={onClick}
      className="group cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-lg text-white">
          {'</>'}
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColors[project.status]}`}
        >
          {getStatusLabel(project.status)}
        </span>
      </div>

      {/* Title */}
      <h3 className="mt-3 truncate text-base font-semibold text-gray-900 group-hover:text-emerald-600">
        {project.name}
      </h3>
      {project.description && (
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
          {project.description}
        </p>
      )}

      {/* Tech Stack */}
      <div className="mt-3 flex flex-wrap gap-1">
        {project.techStack.frontend && (
          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
            {project.techStack.frontend}
          </span>
        )}
        {project.techStack.backend && (
          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs text-green-600">
            {project.techStack.backend}
          </span>
        )}
      </div>

      {/* Progress */}
      {project.status === 'IN_PROGRESS' && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-gray-500">
              {t('aiCoding.projects.progress')}
            </span>
            <span className="font-medium text-emerald-600">
              {project.progress}%
            </span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${project.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
        <span>{formatTime(project.updatedAt)}</span>
      </div>
    </div>
  );
}

// Create Project Dialog
function CreateProjectDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (requirement: string) => void;
}) {
  const { t } = useTranslation();
  const [requirement, setRequirement] = useState('');

  const handleSubmit = () => {
    if (!requirement.trim()) return;
    onCreate(requirement.trim());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">
            {t('aiCoding.createDialog.title')}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            <svg
              className="h-6 w-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          <textarea
            value={requirement}
            onChange={(e) => setRequirement(e.target.value)}
            placeholder={t('aiCoding.createDialog.placeholder')}
            rows={6}
            className="w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />

          {/* Example Prompts */}
          <div className="mt-4">
            <p className="mb-2 text-sm font-medium text-gray-700">
              {t('aiCoding.createDialog.examplesLabel')}
            </p>
            <div className="flex flex-wrap gap-2">
              {(['blog', 'api', 'cli', 'data'] as const).map((key) => (
                <button
                  key={key}
                  onClick={() =>
                    setRequirement(t(`aiCoding.createDialog.examples.${key}`))
                  }
                  className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-sm text-gray-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600"
                >
                  {t(`aiCoding.createDialog.examples.${key}`)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {t('aiCoding.createDialog.cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={!requirement.trim()}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('aiCoding.createDialog.submit')}
          </button>
        </div>
      </div>
    </div>
  );
}
