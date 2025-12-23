/**
 * AI Coding API Service
 *
 * Frontend API client for AI Coding backend endpoints
 */

import { apiClient } from './client';

// ==================== Types ====================

export interface AgentStatus {
  status: 'pending' | 'running' | 'completed' | 'failed';
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface TechStack {
  frontend?: string;
  backend?: string;
  database?: string;
  language?: string;
}

export interface CodingProject {
  id: string;
  name: string;
  description?: string;
  requirement: string;
  techStack: TechStack;
  status: 'DRAFT' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  progress: number;
  agentStatus?: {
    pm?: AgentStatus;
    architect?: AgentStatus;
    pmLead?: AgentStatus;
    engineer?: AgentStatus;
    qa?: AgentStatus;
  };
  outputs?: {
    prd?: unknown;
    design?: unknown;
    tasks?: unknown[];
    code?: unknown[];
    tests?: unknown[];
  };
  complianceScore?: number;
  iterationCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFile {
  id: string;
  path: string;
  content: string;
  language?: string;
  createdAt: string;
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  techStack: TechStack;
}

export interface ProjectListResponse {
  projects: CodingProject[];
  total: number;
  hasMore: boolean;
  nextCursor?: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  requirement: string;
  techStack?: TechStack;
  templateId?: string;
}

export interface StartProjectDto {
  skipPM?: boolean;
  skipArchitect?: boolean;
}

export interface IterateProjectDto {
  feedback: string;
  targetAgents?: ('pm' | 'architect' | 'engineer' | 'qa')[];
}

// ==================== API Functions ====================

/**
 * Get list of user's projects
 */
export async function getProjects(options?: {
  status?: string;
  limit?: number;
  cursor?: string;
}): Promise<ProjectListResponse> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.cursor) params.set('cursor', options.cursor);

  const queryString = params.toString();
  const path = `/ai-coding/projects${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<ProjectListResponse>(path);
}

/**
 * Get single project by ID
 */
export async function getProject(projectId: string): Promise<CodingProject> {
  return apiClient.get<CodingProject>(`/ai-coding/projects/${projectId}`);
}

/**
 * Create a new project
 */
export async function createProject(
  dto: CreateProjectDto
): Promise<CodingProject> {
  return apiClient.post<CodingProject>('/ai-coding/projects', dto);
}

/**
 * Update a project
 */
export async function updateProject(
  projectId: string,
  dto: Partial<CreateProjectDto>
): Promise<CodingProject> {
  return apiClient.patch<CodingProject>(
    `/ai-coding/projects/${projectId}`,
    dto
  );
}

/**
 * Delete a project
 */
export async function deleteProject(
  projectId: string
): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(
    `/ai-coding/projects/${projectId}`
  );
}

/**
 * Start project execution (run multi-agent pipeline)
 */
export async function startProject(
  projectId: string,
  dto?: StartProjectDto
): Promise<CodingProject> {
  return apiClient.post<CodingProject>(
    `/ai-coding/projects/${projectId}/start`,
    dto || {}
  );
}

/**
 * Iterate on project with feedback
 */
export async function iterateProject(
  projectId: string,
  dto: IterateProjectDto
): Promise<CodingProject> {
  return apiClient.post<CodingProject>(
    `/ai-coding/projects/${projectId}/iterate`,
    dto
  );
}

/**
 * Get project files
 */
export async function getProjectFiles(
  projectId: string
): Promise<ProjectFile[]> {
  return apiClient.get<ProjectFile[]>(`/ai-coding/projects/${projectId}/files`);
}

/**
 * Get available project templates
 */
export async function getTemplates(): Promise<ProjectTemplate[]> {
  return apiClient.get<ProjectTemplate[]>('/ai-coding/templates');
}

/**
 * Download project as ZIP (returns URL - deprecated, use downloadProjectZip instead)
 */
export function getDownloadUrl(projectId: string): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
  return `${baseUrl}/ai-coding/projects/${projectId}/download`;
}

/**
 * Download project as ZIP with authentication
 */
export async function downloadProjectZip(projectId: string): Promise<void> {
  const response = await fetch(getDownloadUrl(projectId), {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getAuthToken()}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Download failed: ${response.statusText}`);
  }

  // Get filename from Content-Disposition header or use default
  const contentDisposition = response.headers.get('Content-Disposition');
  let filename = 'project.zip';
  if (contentDisposition) {
    const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
    if (filenameMatch) {
      filename = filenameMatch[1];
    }
  }

  // Convert response to blob and trigger download
  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Helper to get auth token
function getAuthToken(): string {
  if (typeof window === 'undefined') return '';
  const tokens = localStorage.getItem('auth_tokens');
  if (tokens) {
    try {
      const parsed = JSON.parse(tokens);
      return parsed.accessToken || '';
    } catch {
      return '';
    }
  }
  return '';
}

// ==================== GitHub Integration ====================

export interface GithubStatus {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
}

export interface GithubRepoInfo {
  name: string;
  fullName: string;
  url: string;
  defaultBranch: string;
}

/**
 * Get GitHub connection status
 */
export async function getGithubStatus(): Promise<GithubStatus> {
  return apiClient.get<GithubStatus>('/ai-coding/github/status');
}

/**
 * Get GitHub authorization URL
 */
export async function getGithubAuthUrl(): Promise<{
  url: string;
  state: string;
}> {
  return apiClient.get<{ url: string; state: string }>(
    '/ai-coding/github/auth'
  );
}

/**
 * Disconnect GitHub
 */
export async function disconnectGithub(): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>('/ai-coding/github/disconnect');
}

/**
 * Create GitHub repository for project
 */
export async function createGithubRepo(
  projectId: string,
  dto: { name: string; description?: string; isPrivate?: boolean }
): Promise<GithubRepoInfo> {
  return apiClient.post<GithubRepoInfo>(
    `/ai-coding/projects/${projectId}/github/repo`,
    dto
  );
}

/**
 * Push code to GitHub
 */
export async function pushToGithub(
  projectId: string,
  dto?: { branch?: string; commitMessage?: string }
): Promise<{ success: boolean; commitSha?: string }> {
  return apiClient.post<{ success: boolean; commitSha?: string }>(
    `/ai-coding/projects/${projectId}/github/push`,
    dto || {}
  );
}

// ==================== Compliance ====================

export interface ComplianceReport {
  id: string;
  overallScore: number;
  status: 'RUNNING' | 'PASSED' | 'WARNING' | 'FAILED';
  summary?: string;
  results?: unknown[];
  createdAt: string;
}

/**
 * Run compliance check
 */
export async function runComplianceCheck(
  projectId: string,
  dto?: { standardIds?: string[] }
): Promise<ComplianceReport> {
  return apiClient.post<ComplianceReport>(
    `/ai-coding/projects/${projectId}/compliance/check`,
    dto || {}
  );
}

/**
 * Get compliance reports for project
 */
export async function getComplianceReports(
  projectId: string
): Promise<ComplianceReport[]> {
  return apiClient.get<ComplianceReport[]>(
    `/ai-coding/projects/${projectId}/compliance`
  );
}

// ==================== Engineering Standards ====================

export interface EngineeringStandard {
  id: string;
  name: string;
  type: string;
  source: string;
  content: string;
  rules?: unknown[];
  isActive: boolean;
  createdAt: string;
}

/**
 * Get user's engineering standards
 */
export async function getStandards(): Promise<EngineeringStandard[]> {
  return apiClient.get<EngineeringStandard[]>('/ai-coding/standards');
}

/**
 * Get available standard templates
 */
export async function getStandardTemplates(): Promise<
  Array<{ name: string; type: string; priority: number }>
> {
  return apiClient.get<Array<{ name: string; type: string; priority: number }>>(
    '/ai-coding/standards/templates'
  );
}

/**
 * Apply a standard template
 */
export async function applyStandardTemplate(
  templateId: string
): Promise<EngineeringStandard> {
  return apiClient.post<EngineeringStandard>(
    '/ai-coding/standards/apply-template',
    { templateId }
  );
}

// ==================== Documents ====================

export interface ProjectDocument {
  id: string;
  type: 'PRD' | 'DESIGN' | 'API' | 'README';
  title: string;
  content: string;
  format: 'MARKDOWN' | 'JSON';
  version: number;
  createdAt: string;
}

/**
 * Get project documents
 */
export async function getProjectDocuments(
  projectId: string,
  type?: string
): Promise<ProjectDocument[]> {
  const params = type ? `?type=${type}` : '';
  return apiClient.get<ProjectDocument[]>(
    `/ai-coding/projects/${projectId}/documents${params}`
  );
}

/**
 * Regenerate a document
 */
export async function regenerateDocument(
  projectId: string,
  type: string
): Promise<ProjectDocument> {
  return apiClient.post<ProjectDocument>(
    `/ai-coding/projects/${projectId}/documents/regenerate?type=${type}`,
    {}
  );
}

// Default export
export default {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  startProject,
  iterateProject,
  getProjectFiles,
  getTemplates,
  getDownloadUrl,
  downloadProjectZip,
  getGithubStatus,
  getGithubAuthUrl,
  disconnectGithub,
  createGithubRepo,
  pushToGithub,
  runComplianceCheck,
  getComplianceReports,
  getStandards,
  getStandardTemplates,
  applyStandardTemplate,
  getProjectDocuments,
  regenerateDocument,
};
