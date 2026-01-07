/**
 * AI Writing API Client
 *
 * Frontend API client for AI Writing backend endpoints
 * 完全按照 ai-coding.ts 的模式实现
 */

import { apiClient } from './client';

// ==================== Types ====================

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

export interface ProjectListResponse {
  items: WritingProject[];
  nextCursor?: string;
}

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

export interface StoryBible {
  id: string;
  premise?: string;
  theme?: string;
  tone?: string;
  setting?: string;
}

export interface Character {
  id: string;
  name: string;
  role: string;
  description?: string;
  personality?: string;
  background?: string;
}

export interface Volume {
  id: string;
  volumeNumber: number;
  title: string;
  synopsis?: string;
  targetWords?: number;
}

// ==================== Project API ====================

/**
 * Get list of user's writing projects
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
  const path = `/ai-writing/projects${queryString ? `?${queryString}` : ''}`;

  return apiClient.get<ProjectListResponse>(path);
}

/**
 * Get single project by ID
 */
export async function getProject(projectId: string): Promise<WritingProject> {
  return apiClient.get<WritingProject>(`/ai-writing/projects/${projectId}`);
}

/**
 * Create a new writing project
 */
export async function createProject(
  dto: CreateProjectDto
): Promise<WritingProject> {
  return apiClient.post<WritingProject>('/ai-writing/projects', dto);
}

/**
 * Update a writing project
 */
export async function updateProject(
  projectId: string,
  dto: UpdateProjectDto
): Promise<WritingProject> {
  return apiClient.patch<WritingProject>(
    `/ai-writing/projects/${projectId}`,
    dto
  );
}

/**
 * Delete a writing project
 */
export async function deleteProject(
  projectId: string
): Promise<{ success: boolean }> {
  return apiClient.delete<{ success: boolean }>(
    `/ai-writing/projects/${projectId}`
  );
}

// ==================== Mission API ====================

/**
 * Start AI writing mission
 */
export async function startMission(
  projectId: string,
  dto: StartMissionDto
): Promise<MissionResponse> {
  return apiClient.post<MissionResponse>(
    `/ai-writing/projects/${projectId}/missions`,
    dto
  );
}

/**
 * Get mission status
 */
export async function getMissionStatus(
  missionId: string
): Promise<{ status: string; progress?: number }> {
  return apiClient.get(`/ai-writing/missions/${missionId}`);
}

/**
 * Cancel a mission
 */
export async function cancelMission(
  missionId: string
): Promise<{ success: boolean }> {
  return apiClient.post(`/ai-writing/missions/${missionId}/cancel`, {});
}

// ==================== Story Bible API ====================

/**
 * Get story bible for a project
 */
export async function getStoryBible(projectId: string): Promise<StoryBible> {
  return apiClient.get<StoryBible>(`/ai-writing/projects/${projectId}/bible`);
}

/**
 * Update story bible
 */
export async function updateStoryBible(
  projectId: string,
  dto: Partial<StoryBible>
): Promise<StoryBible> {
  return apiClient.patch<StoryBible>(
    `/ai-writing/projects/${projectId}/bible`,
    dto
  );
}

// ==================== Characters API ====================

/**
 * Get characters for a project
 */
export async function getCharacters(projectId: string): Promise<Character[]> {
  return apiClient.get<Character[]>(
    `/ai-writing/projects/${projectId}/characters`
  );
}

/**
 * Create a character
 */
export async function createCharacter(
  projectId: string,
  dto: Omit<Character, 'id'>
): Promise<Character> {
  return apiClient.post<Character>(
    `/ai-writing/projects/${projectId}/characters`,
    dto
  );
}

// ==================== Volumes API ====================

/**
 * Get volumes for a project
 */
export async function getVolumes(projectId: string): Promise<Volume[]> {
  return apiClient.get<Volume[]>(`/ai-writing/projects/${projectId}/volumes`);
}

/**
 * Create a volume
 */
export async function createVolume(
  projectId: string,
  dto: Omit<Volume, 'id'>
): Promise<Volume> {
  return apiClient.post<Volume>(
    `/ai-writing/projects/${projectId}/volumes`,
    dto
  );
}

// ==================== Default Export ====================

export default {
  getProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  startMission,
  getMissionStatus,
  cancelMission,
  getStoryBible,
  updateStoryBible,
  getCharacters,
  createCharacter,
  getVolumes,
  createVolume,
};
