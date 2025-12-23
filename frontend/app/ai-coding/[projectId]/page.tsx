'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import Sidebar from '@/components/layout/Sidebar';
import {
  getProject,
  getProjectFiles,
  getProjectDocuments,
  startProject,
  iterateProject,
  downloadProjectZip,
  getGithubStatus,
  createGithubRepo,
  pushToGithub,
  CodingProject,
  ProjectFile,
  ProjectDocument,
  GithubStatus,
} from '@/lib/api/ai-coding';
import {
  useAiCodingSocket,
  ProjectProgressEvent,
  AgentStatusEvent,
} from '@/hooks/useAiCodingSocket';
import { TeamStatusPanel } from '@/components/ai-coding/AgentStatusCard';
import TeamChatPanel from '@/components/ai-coding/TeamChatPanel';
import { DevWorkspace } from '@/components/ai-coding/DevWorkspace';
import { ParsedFile } from '@/lib/utils/codeParser';

// Code file viewer component with live preview
function CodeViewer({ files }: { files: ProjectFile[] }) {
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(
    files[0] || null
  );
  const [showPreview, setShowPreview] = useState(false);

  // Convert ProjectFile[] to ParsedFile[] for DevWorkspace
  const parsedFiles: ParsedFile[] = files.map((f) => ({
    path: f.path,
    content: f.content,
    language: f.language,
  }));

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-gray-500">
        <div className="mb-4 text-6xl">📁</div>
        <h3 className="text-lg font-medium text-gray-900">暂无代码文件</h3>
        <p className="mt-1 text-sm text-gray-500">
          项目完成后，生成的代码将显示在这里
        </p>
      </div>
    );
  }

  // Check if project has React components for preview
  const hasReactFiles = files.some(
    (f) =>
      (f.path.endsWith('.tsx') || f.path.endsWith('.jsx')) &&
      f.content.includes('React')
  );

  if (showPreview && hasReactFiles) {
    return (
      <div className="h-[700px]">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">开发工作区</h3>
          <button
            onClick={() => setShowPreview(false)}
            className="flex items-center gap-2 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M10 19l-7-7m0 0l7-7m-7 7h18"
              />
            </svg>
            返回列表
          </button>
        </div>
        <DevWorkspace
          files={parsedFiles}
          onFileChange={(path, content) => {
            console.log('File changed:', path, content.length);
          }}
          showPreview={true}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Action Bar */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-gray-500">{files.length} 个文件</div>
        {hasReactFiles && (
          <button
            onClick={() => setShowPreview(true)}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            运行预览
          </button>
        )}
      </div>

      {/* File List and Code View */}
      <div className="flex h-[600px] overflow-hidden rounded-xl border border-gray-200">
        {/* File Tree */}
        <div className="w-64 overflow-y-auto border-r border-gray-200 bg-gray-50">
          <div className="p-3 text-sm font-medium text-gray-700">文件列表</div>
          <div className="space-y-1 px-2 pb-3">
            {files.map((file) => (
              <button
                key={file.id}
                onClick={() => setSelectedFile(file)}
                className={`w-full rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  selectedFile?.id === file.id
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs">
                    {file.path.endsWith('.tsx') || file.path.endsWith('.ts')
                      ? '🔷'
                      : file.path.endsWith('.jsx') || file.path.endsWith('.js')
                        ? '🟨'
                        : file.path.endsWith('.css') ||
                            file.path.endsWith('.scss')
                          ? '🎨'
                          : file.path.endsWith('.json')
                            ? '📋'
                            : '📄'}
                  </span>
                  <span className="truncate">{file.path}</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Code Content */}
        <div className="flex flex-1 flex-col">
          {/* File Header */}
          {selectedFile && (
            <div className="flex items-center justify-between border-b border-gray-200 bg-gray-100 px-4 py-2">
              <span className="text-sm font-medium text-gray-700">
                {selectedFile.path}
              </span>
              <span className="text-xs text-gray-500">
                {selectedFile.content.split('\n').length} 行
              </span>
            </div>
          )}
          <div className="flex-1 overflow-auto bg-gray-900">
            {selectedFile && (
              <pre className="p-4 text-sm text-gray-100">
                <code>{selectedFile.content}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Document viewer component
function DocumentViewer({ documents }: { documents: ProjectDocument[] }) {
  const [selectedDoc, setSelectedDoc] = useState<ProjectDocument | null>(
    documents[0] || null
  );

  const docTypeLabels: Record<string, string> = {
    PRD: '产品需求文档',
    DESIGN: '技术设计文档',
    API: 'API 文档',
    README: 'README',
  };

  const docTypeIcons: Record<string, string> = {
    PRD: '📝',
    DESIGN: '🏗️',
    API: '🔌',
    README: '📖',
  };

  if (documents.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-500">
        暂无文档
      </div>
    );
  }

  return (
    <div>
      {/* Document Tabs */}
      <div className="mb-4 flex gap-2">
        {documents.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setSelectedDoc(doc)}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              selectedDoc?.id === doc.id
                ? 'bg-emerald-100 text-emerald-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            <span>{docTypeIcons[doc.type] || '📄'}</span>
            {docTypeLabels[doc.type] || doc.type}
          </button>
        ))}
      </div>

      {/* Document Content */}
      {selectedDoc && (
        <div className="prose prose-sm max-w-none rounded-xl border border-gray-200 bg-white p-6">
          <h2>{selectedDoc.title}</h2>
          <pre className="whitespace-pre-wrap text-sm">
            {selectedDoc.content}
          </pre>
        </div>
      )}
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { accessToken, isLoading: authLoading } = useAuth();

  const projectId = params.projectId as string;

  const [project, setProject] = useState<CodingProject | null>(null);
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    'overview' | 'documents' | 'code' | 'team'
  >('overview');
  const [isStarting, setIsStarting] = useState(false);
  const [showIterateDialog, setShowIterateDialog] = useState(false);
  const [showGithubDialog, setShowGithubDialog] = useState(false);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);
  const [realtimeProgress, setRealtimeProgress] = useState<number | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isPushing, setIsPushing] = useState(false);
  const [githubStatus, setGithubStatus] = useState<GithubStatus | null>(null);

  const isAuthenticated = !!accessToken;

  // Fetch project data
  const fetchProject = useCallback(async () => {
    if (!projectId || !isAuthenticated) return;

    setIsLoading(true);
    setError(null);

    try {
      const [projectData, filesData, docsData] = await Promise.all([
        getProject(projectId),
        getProjectFiles(projectId).catch(() => []),
        getProjectDocuments(projectId).catch(() => []),
      ]);

      setProject(projectData);
      setFiles(filesData);
      setDocuments(docsData);
    } catch (err) {
      console.error('Failed to fetch project:', err);
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, isAuthenticated]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Fetch GitHub status
  useEffect(() => {
    if (isAuthenticated) {
      getGithubStatus()
        .then(setGithubStatus)
        .catch(() => setGithubStatus(null));
    }
  }, [isAuthenticated]);

  // Poll for updates while project is in progress (fallback if WebSocket disconnected)
  useEffect(() => {
    if (project?.status !== 'IN_PROGRESS') return;

    const interval = setInterval(() => {
      fetchProject();
    }, 10000); // Reduced polling frequency when WebSocket is available

    return () => clearInterval(interval);
  }, [project?.status, fetchProject]);

  // WebSocket connection for real-time updates
  const handleSocketProgress = useCallback(
    (event: ProjectProgressEvent) => {
      if (event.projectId !== projectId) return;
      setProgressMessage(event.message);
      setRealtimeProgress(event.progress);

      // Update project progress locally
      setProject((prev) =>
        prev ? { ...prev, progress: event.progress } : prev
      );

      // If complete, refresh project data
      if (event.phase === 'complete' && event.status === 'completed') {
        setTimeout(() => {
          setProgressMessage(null);
          setRealtimeProgress(null);
          fetchProject();
        }, 2000);
      }
    },
    [projectId, fetchProject]
  );

  const handleSocketAgentStatus = useCallback(
    (event: AgentStatusEvent) => {
      if (event.projectId !== projectId) return;

      // Update agent status locally
      setProject((prev) => {
        if (!prev) return prev;
        const agentKey = event.agent as keyof NonNullable<
          typeof prev.agentStatus
        >;
        return {
          ...prev,
          agentStatus: {
            ...prev.agentStatus,
            [agentKey]: {
              status: event.status.toUpperCase(),
              ...(event.status === 'running' && {
                startedAt: new Date().toISOString(),
              }),
              ...(event.status === 'completed' && {
                completedAt: new Date().toISOString(),
              }),
            },
          },
        };
      });
    },
    [projectId]
  );

  const handleSocketComplete = useCallback(() => {
    // Refresh all data when project completes
    setTimeout(() => {
      fetchProject();
    }, 1000);
  }, [fetchProject]);

  const handleSocketError = useCallback((event: { error: string }) => {
    console.error('[Project] Error:', event.error);
    setProgressMessage(`错误: ${event.error}`);
  }, []);

  // 使用 WebSocket hook，内置状态管理团队成员和消息
  const {
    isConnected: socketConnected,
    teamMembers,
    messages: teamMessages,
  } = useAiCodingSocket({
    projectId: project?.status === 'IN_PROGRESS' ? projectId : undefined,
    onProgress: handleSocketProgress,
    onAgentStatus: handleSocketAgentStatus,
    onComplete: handleSocketComplete,
    onError: handleSocketError,
  });

  // Handle start project
  const handleStart = async () => {
    if (!project) return;

    setIsStarting(true);
    try {
      const updated = await startProject(project.id);
      setProject(updated);
    } catch (err) {
      console.error('Failed to start project:', err);
      alert('启动项目失败');
    } finally {
      setIsStarting(false);
    }
  };

  // Handle iterate
  const handleIterate = async (feedback: string) => {
    if (!project) return;

    try {
      const updated = await iterateProject(project.id, { feedback });
      setProject(updated);
      setShowIterateDialog(false);
      fetchProject();
    } catch (err) {
      console.error('Failed to iterate project:', err);
      alert('迭代失败');
    }
  };

  // Handle download
  const handleDownload = async () => {
    if (!project) return;

    setIsDownloading(true);
    try {
      await downloadProjectZip(project.id);
    } catch (err) {
      console.error('Failed to download project:', err);
      alert('下载失败');
    } finally {
      setIsDownloading(false);
    }
  };

  // Handle GitHub push
  const handleGithubPush = async (repoName?: string) => {
    if (!project) return;

    setIsPushing(true);
    try {
      // If repo doesn't exist, create it first
      if (repoName) {
        await createGithubRepo(project.id, {
          name: repoName,
          description: project.description,
          isPrivate: false,
        });
      }

      // Push code
      const result = await pushToGithub(project.id, {
        commitMessage: `AI-generated code for ${project.name}`,
      });

      if (result.success) {
        alert(
          `代码已成功推送到 GitHub! Commit: ${result.commitSha?.slice(0, 7)}`
        );
        setShowGithubDialog(false);
      }
    } catch (err: unknown) {
      console.error('Failed to push to GitHub:', err);
      const errorMessage = err instanceof Error ? err.message : '推送失败';
      alert(errorMessage);
    } finally {
      setIsPushing(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
            <p className="text-sm text-gray-500">加载项目中...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    router.push('/ai-coding');
    return null;
  }

  if (error || !project) {
    return (
      <div className="flex h-screen">
        <Sidebar />
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <svg
            className="h-16 w-16 text-red-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <h2 className="text-xl font-semibold text-gray-700">
            {error || '项目不存在'}
          </h2>
          <button
            onClick={() => router.push('/ai-coding')}
            className="text-emerald-600 hover:text-emerald-700"
          >
            返回项目列表
          </button>
        </div>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    DRAFT: 'bg-gray-100 text-gray-600',
    IN_PROGRESS: 'bg-blue-100 text-blue-600',
    COMPLETED: 'bg-green-100 text-green-600',
    FAILED: 'bg-red-100 text-red-600',
  };

  const statusLabels: Record<string, string> = {
    DRAFT: '草稿',
    IN_PROGRESS: '进行中',
    COMPLETED: '已完成',
    FAILED: '失败',
  };

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />

      <main className="flex-1 overflow-auto">
        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-gray-100 bg-white/50 backdrop-blur-sm">
          <div className="px-8 py-6">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/ai-coding')}
                className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
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
                    d="M10 19l-7-7m0 0l7-7m-7 7h18"
                  />
                </svg>
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-gray-900">
                    {project.name}
                  </h1>
                  <span
                    className={`rounded-full px-3 py-1 text-sm font-medium ${statusColors[project.status]}`}
                  >
                    {statusLabels[project.status]}
                  </span>
                </div>
                {project.description && (
                  <p className="mt-1 text-sm text-gray-500">
                    {project.description}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3">
                {project.status === 'DRAFT' && (
                  <button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {isStarting ? (
                      <>
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                        启动中...
                      </>
                    ) : (
                      <>
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
                            d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                        开始生成
                      </>
                    )}
                  </button>
                )}

                {project.status === 'COMPLETED' && (
                  <>
                    <button
                      onClick={() => setShowIterateDialog(true)}
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
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                        />
                      </svg>
                      迭代修改
                    </button>
                    {/* GitHub Push Button */}
                    {githubStatus?.connected ? (
                      <button
                        onClick={() => setShowGithubDialog(true)}
                        disabled={isPushing}
                        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
                      >
                        {isPushing ? (
                          <>
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
                            推送中...
                          </>
                        ) : (
                          <>
                            <svg
                              className="h-5 w-5"
                              fill="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                            </svg>
                            推送到 GitHub
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() =>
                          window.open('/ai-coding?github=connect', '_blank')
                        }
                        className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
                      >
                        <svg
                          className="h-5 w-5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                        </svg>
                        连接 GitHub
                      </button>
                    )}
                    {/* Download Button */}
                    <button
                      onClick={handleDownload}
                      disabled={isDownloading}
                      className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {isDownloading ? (
                        <>
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                          下载中...
                        </>
                      ) : (
                        <>
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
                              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                            />
                          </svg>
                          下载 ZIP
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="mt-6 flex gap-1">
              {(['overview', 'team', 'documents', 'code'] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                      activeTab === tab
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    {tab === 'overview' && '概览'}
                    {tab === 'team' && (
                      <span className="flex items-center gap-1.5">
                        <span>团队协作</span>
                        {teamMessages.length > 0 && (
                          <span className="rounded-full bg-emerald-500 px-1.5 py-0.5 text-xs text-white">
                            {teamMessages.length}
                          </span>
                        )}
                      </span>
                    )}
                    {tab === 'documents' && `文档 (${documents.length})`}
                    {tab === 'code' && `代码 (${files.length})`}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-8">
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Project Info */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">
                  项目信息
                </h3>
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm text-gray-500">需求描述</label>
                    <p className="mt-1 text-gray-900">{project.requirement}</p>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">技术栈</label>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {project.techStack?.frontend && (
                        <span className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-600">
                          {project.techStack.frontend}
                        </span>
                      )}
                      {project.techStack?.backend && (
                        <span className="rounded-full bg-green-50 px-3 py-1 text-sm text-green-600">
                          {project.techStack.backend}
                        </span>
                      )}
                      {project.techStack?.database && (
                        <span className="rounded-full bg-purple-50 px-3 py-1 text-sm text-purple-600">
                          {project.techStack.database}
                        </span>
                      )}
                      {project.techStack?.language && (
                        <span className="rounded-full bg-orange-50 px-3 py-1 text-sm text-orange-600">
                          {project.techStack.language}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">进度</label>
                    <div className="mt-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">完成度</span>
                        <span className="font-medium text-emerald-600">
                          {realtimeProgress ?? project.progress}%
                        </span>
                      </div>
                      <div className="mt-1 h-2 overflow-hidden rounded-full bg-gray-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all duration-500"
                          style={{
                            width: `${realtimeProgress ?? project.progress}%`,
                          }}
                        />
                      </div>
                      {/* Real-time progress message */}
                      {progressMessage && (
                        <div className="mt-2 flex items-center gap-2 text-sm text-blue-600">
                          <div className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                          {progressMessage}
                        </div>
                      )}
                      {/* WebSocket connection status */}
                      {project.status === 'IN_PROGRESS' && (
                        <div className="mt-2 flex items-center gap-1.5 text-xs text-gray-400">
                          <div
                            className={`h-1.5 w-1.5 rounded-full ${
                              socketConnected ? 'bg-green-500' : 'bg-gray-400'
                            }`}
                          />
                          {socketConnected ? '实时更新已连接' : '轮询更新中'}
                        </div>
                      )}
                    </div>
                  </div>
                  <div>
                    <label className="text-sm text-gray-500">迭代次数</label>
                    <p className="mt-1 text-gray-900">
                      {project.iterationCount} 次
                    </p>
                  </div>
                </div>
              </div>

              {/* Agent Status - 使用新的 TeamStatusPanel */}
              <TeamStatusPanel
                teamMembers={teamMembers}
                legacyAgentStatus={project.agentStatus}
              />
            </div>
          )}

          {/* Team Tab - 团队协作面板 */}
          {activeTab === 'team' && (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {/* 团队成员状态 */}
              <div className="lg:col-span-1">
                <TeamStatusPanel
                  teamMembers={teamMembers}
                  legacyAgentStatus={project.agentStatus}
                  showDetails
                  className="h-full"
                />
              </div>

              {/* 团队消息面板 */}
              <div className="lg:col-span-2">
                <TeamChatPanel
                  messages={teamMessages.map((m) => ({
                    ...m,
                    messageType: m.messageType as
                      | 'SYSTEM'
                      | 'THINKING'
                      | 'OUTPUT'
                      | 'ERROR'
                      | 'FEEDBACK'
                      | 'APPROVAL'
                      | 'REQUEST',
                  }))}
                  teamMembers={teamMembers}
                  isLoading={
                    project.status === 'IN_PROGRESS' &&
                    teamMessages.length === 0
                  }
                  className="h-[600px]"
                />
              </div>
            </div>
          )}

          {/* Documents Tab */}
          {activeTab === 'documents' && (
            <DocumentViewer documents={documents} />
          )}

          {/* Code Tab */}
          {activeTab === 'code' && <CodeViewer files={files} />}
        </div>
      </main>

      {/* Iterate Dialog */}
      {showIterateDialog && (
        <IterateDialog
          onClose={() => setShowIterateDialog(false)}
          onSubmit={handleIterate}
        />
      )}

      {/* GitHub Push Dialog */}
      {showGithubDialog && (
        <GithubPushDialog
          projectName={project.name}
          onClose={() => setShowGithubDialog(false)}
          onSubmit={handleGithubPush}
          isPushing={isPushing}
        />
      )}
    </div>
  );
}

// Iterate Dialog Component
function IterateDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (feedback: string) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!feedback.trim()) return;
    setIsSubmitting(true);
    await onSubmit(feedback.trim());
    setIsSubmitting(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">迭代修改</h2>
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

        <div className="p-6">
          <label className="text-sm font-medium text-gray-700">
            请描述需要修改的内容
          </label>
          <textarea
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="例如：添加用户登录功能，修复首页布局问题..."
            rows={6}
            className="mt-2 w-full resize-none rounded-xl border border-gray-300 px-4 py-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!feedback.trim() || isSubmitting}
            className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? '提交中...' : '开始迭代'}
          </button>
        </div>
      </div>
    </div>
  );
}

// GitHub Push Dialog Component
function GithubPushDialog({
  projectName,
  onClose,
  onSubmit,
  isPushing,
}: {
  projectName: string;
  onClose: () => void;
  onSubmit: (repoName?: string) => void;
  isPushing: boolean;
}) {
  const [repoName, setRepoName] = useState(
    projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-')
  );
  const [createNewRepo, setCreateNewRepo] = useState(true);

  const handleSubmit = () => {
    onSubmit(createNewRepo ? repoName : undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <svg className="h-6 w-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
            <h2 className="text-lg font-semibold text-gray-900">
              推送到 GitHub
            </h2>
          </div>
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

        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="createNewRepo"
              checked={createNewRepo}
              onChange={(e) => setCreateNewRepo(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
            />
            <label htmlFor="createNewRepo" className="text-sm text-gray-700">
              创建新仓库
            </label>
          </div>

          {createNewRepo && (
            <div>
              <label className="text-sm font-medium text-gray-700">
                仓库名称
              </label>
              <input
                type="text"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="my-project"
                className="mt-1 w-full rounded-lg border border-gray-300 px-4 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              <p className="mt-1 text-xs text-gray-500">
                仓库将创建在您的 GitHub 账户下
              </p>
            </div>
          )}

          {!createNewRepo && (
            <p className="text-sm text-gray-600">将代码推送到已关联的仓库</p>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-gray-200 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPushing || (createNewRepo && !repoName.trim())}
            className="flex items-center gap-2 rounded-lg bg-gray-900 px-6 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPushing ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                推送中...
              </>
            ) : (
              '推送代码'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
