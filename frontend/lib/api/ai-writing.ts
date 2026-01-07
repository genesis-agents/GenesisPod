import { getAuthTokens } from '../utils/auth';

// Use relative URLs to let Next.js rewrites proxy to backend (avoids CORS)
async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (tokens?.accessToken) {
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${tokens.accessToken}`;
  }

  // Use relative URL - Next.js rewrites will proxy /api/v1/* to backend
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response
      .json()
      .catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || `HTTP ${response.status}`);
  }

  return response.json();
}

// ==================== Project API ====================

export interface WritingProject {
  id: string;
  name: string;
  description?: string;
  genre: string;
  targetWords: number;
  currentWords: number;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  genre?: string;
  targetWords?: number;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  genre?: string;
  targetWords?: number;
  status?: string;
}

export async function getProjects(options?: {
  status?: string;
  limit?: number;
  cursor?: string;
}): Promise<{ items: WritingProject[]; nextCursor?: string }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.cursor) params.set('cursor', options.cursor);

  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/ai-writing/projects${query ? `?${query}` : ''}`
  );
}

export async function getProject(projectId: string): Promise<WritingProject> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}`);
}

export async function createProject(
  dto: CreateProjectDto
): Promise<WritingProject> {
  return fetchWithAuth('/api/v1/ai-writing/projects', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function updateProject(
  projectId: string,
  dto: UpdateProjectDto
): Promise<WritingProject> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function deleteProject(projectId: string): Promise<void> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}`, {
    method: 'DELETE',
  });
}

// ==================== Mission API ====================

export interface StartMissionDto {
  prompt: string;
  missionType?: 'outline' | 'chapter' | 'full_story';
  targetWordCount?: number;
  additionalInstructions?: string;
}

export interface MissionResponse {
  success: boolean;
  message: string;
  projectId: string;
  missionType: string;
}

export async function startMission(
  projectId: string,
  dto: StartMissionDto
): Promise<MissionResponse> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/missions`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function getMissionStatus(missionId: string): Promise<any> {
  return fetchWithAuth(`/api/v1/ai-writing/missions/${missionId}`);
}

export async function cancelMission(missionId: string): Promise<any> {
  return fetchWithAuth(`/api/v1/ai-writing/missions/${missionId}/cancel`, {
    method: 'POST',
  });
}

// ==================== Story Bible API ====================

export async function getStoryBible(projectId: string): Promise<any> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/bible`);
}

export async function updateStoryBible(
  projectId: string,
  dto: any
): Promise<any> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/bible`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

// ==================== Characters API ====================

export async function getCharacters(projectId: string): Promise<any[]> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/characters`);
}

export async function createCharacter(
  projectId: string,
  dto: any
): Promise<any> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/characters`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

// ==================== Volumes API ====================

export async function getVolumes(projectId: string): Promise<any[]> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/volumes`);
}

export async function createVolume(projectId: string, dto: any): Promise<any> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/volumes`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}
