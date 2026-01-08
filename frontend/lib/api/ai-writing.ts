/**
 * AI Writing API Client V2
 *
 * 完全采用 AI Teams 的成功模式：
 * - 直接使用 NEXT_PUBLIC_API_URL
 * - fetchWithAuth 处理认证
 * - 简单直接的 fetch 请求
 */

import { getAuthTokens } from '../utils/auth';

// ==================== Types ====================

export interface WritingProject {
  id: string;
  name: string;
  description?: string;
  genre?: string;
  targetWords: number;
  currentWords: number;
  status: 'PLANNING' | 'OUTLINING' | 'WRITING' | 'REVISING' | 'COMPLETED';
  createdAt: string;
  updatedAt: string;
}

export interface Chapter {
  id: string;
  volumeId: string;
  title: string;
  content?: string;
  outline?: string; // 章节大纲
  wordCount: number;
  chapterNumber: number;
  status: string;
}

export interface Volume {
  id: string;
  projectId: string;
  title: string;
  volumeNumber: number;
  synopsis?: string;
  targetWords?: number;
  chapters?: Chapter[];
}

export interface WorldSetting {
  id: string;
  bibleId: string;
  category: string;
  key: string;
  value: string;
  description?: string;
}

export interface StoryBible {
  id: string;
  projectId: string;
  premise?: string;
  theme?: string;
  tone?: string;
  worldType?: string;
  // Relations (arrays, not rendered directly)
  worldSettings?: WorldSetting[];
  characters?: Character[];
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: string;
  description?: string;
  personality?: string;
  background?: string;
}

export interface WritingMission {
  id: string;
  projectId: string;
  type: 'outline' | 'chapter' | 'full_story';
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: string;
  createdAt?: string;
  updatedAt?: string;
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

export interface StartMissionDto {
  prompt: string;
  missionType?:
    | 'outline'
    | 'chapter'
    | 'full_story'
    | 'edit'
    | 'consistency_check';
  targetWordCount?: number;
  additionalInstructions?: string;
  targetAgent?: string; // @mention 的目标 Agent (leader, keeper, writer, checker, editor)
  chapterNumber?: number; // 针对特定章节的操作
}

// ==================== API Base ====================

// Use relative URLs to leverage Next.js rewrites proxy (avoids CORS)
// Next.js rewrites /api/v1/* to the backend URL

async function fetchWithAuth<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const tokens = getAuthTokens();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (tokens?.accessToken) {
    (headers as Record<string, string>)['Authorization'] =
      `Bearer ${tokens.accessToken}`;
  }

  // Use relative URL to leverage Next.js proxy
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

  // Handle empty responses
  const text = await response.text();
  if (!text) {
    return {} as T;
  }

  const data = JSON.parse(text);

  // Unwrap { success, data } format if present
  if (data && typeof data === 'object' && 'success' in data && 'data' in data) {
    return data.data as T;
  }

  return data as T;
}

// ==================== Project API ====================

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

export async function getProject(id: string): Promise<WritingProject> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${id}`);
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
  id: string,
  dto: UpdateProjectDto
): Promise<WritingProject> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function deleteProject(id: string): Promise<void> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${id}`, {
    method: 'DELETE',
  });
}

// ==================== Volume & Chapter API ====================

export async function getVolumes(projectId: string): Promise<Volume[]> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/volumes`);
}

export async function createVolume(
  projectId: string,
  dto: {
    title: string;
    volumeNumber: number;
    synopsis?: string;
    targetWords?: number;
  }
): Promise<Volume> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/volumes`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function getChapters(volumeId: string): Promise<Chapter[]> {
  return fetchWithAuth(`/api/v1/ai-writing/volumes/${volumeId}/chapters`);
}

export async function getChapter(id: string): Promise<Chapter> {
  return fetchWithAuth(`/api/v1/ai-writing/chapters/${id}`);
}

export async function updateChapter(
  id: string,
  dto: { title?: string; content?: string; synopsis?: string }
): Promise<Chapter> {
  return fetchWithAuth(`/api/v1/ai-writing/chapters/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function createChapter(
  volumeId: string,
  dto: { title: string; chapterNumber: number; synopsis?: string }
): Promise<Chapter> {
  return fetchWithAuth(`/api/v1/ai-writing/volumes/${volumeId}/chapters`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

// ==================== Story Bible API ====================

export async function getStoryBible(projectId: string): Promise<StoryBible> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/bible`);
}

export async function updateStoryBible(
  projectId: string,
  dto: Partial<StoryBible>
): Promise<StoryBible> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/bible`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

// ==================== Character API ====================

export async function getCharacters(projectId: string): Promise<Character[]> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/characters`);
}

export async function createCharacter(
  projectId: string,
  dto: Omit<Character, 'id' | 'projectId'>
): Promise<Character> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/characters`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function updateCharacter(
  projectId: string,
  characterId: string,
  dto: Partial<Character>
): Promise<Character> {
  return fetchWithAuth(
    `/api/v1/ai-writing/projects/${projectId}/characters/${characterId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }
  );
}

export async function deleteCharacter(
  projectId: string,
  characterId: string
): Promise<void> {
  return fetchWithAuth(
    `/api/v1/ai-writing/projects/${projectId}/characters/${characterId}`,
    {
      method: 'DELETE',
    }
  );
}

// ==================== AI Mission API ====================

export async function startMission(
  projectId: string,
  dto: StartMissionDto
): Promise<{
  success: boolean;
  message: string;
  projectId: string;
  missionId: string;
  missionType: string;
}> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/missions`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export interface MissionStatusResponse {
  id: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  missionType: string;
  startedAt: string;
  completedAt?: string;
  result?: {
    success?: boolean;
    content?: string;
    wordCount?: number;
    progress?: number;
    currentStep?: string;
    error?: string;
  };
  orchestratorState?: {
    phase: string;
    completedSteps: string[];
    currentSteps: string[];
    progress: number;
    tokensUsed: number;
    costUsed: number;
  };
}

export async function getMissionStatus(
  missionId: string
): Promise<MissionStatusResponse> {
  return fetchWithAuth(`/api/v1/ai-writing/missions/${missionId}`);
}

export async function cancelMission(
  missionId: string
): Promise<{ success: boolean }> {
  return fetchWithAuth(`/api/v1/ai-writing/missions/${missionId}/cancel`, {
    method: 'POST',
  });
}

export async function getProjectMissions(
  projectId: string
): Promise<{ items: WritingMission[]; total: number }> {
  return fetchWithAuth(`/api/v1/ai-writing/projects/${projectId}/missions`);
}

export interface MissionLogItem {
  id: string;
  eventType: string;
  agentId?: string;
  agentName?: string;
  content: string;
  detail?: Record<string, unknown>;
  createdAt: string;
}

export async function getMissionLogs(
  missionId: string,
  limit?: number
): Promise<{ items: MissionLogItem[]; total: number }> {
  const params = limit ? `?limit=${limit}` : '';
  return fetchWithAuth(
    `/api/v1/ai-writing/missions/${missionId}/logs${params}`
  );
}

// ==================== Writing Actions ====================

export async function startChapterWriting(
  chapterId: string,
  dto: { prompt?: string; continueFrom?: string }
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/api/v1/ai-writing/chapters/${chapterId}/write`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}
