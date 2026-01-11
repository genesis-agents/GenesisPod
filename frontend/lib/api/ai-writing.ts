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
  writingStyle?: string;
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
  name: string; // 设定名称
  description: string; // 设定描述
  rules?: string[]; // 规则/限制
  references?: Record<string, unknown>; // 相关引用
}

// 时间线事件
export interface TimelineEvent {
  id: string;
  bibleId: string;
  eventName: string;
  description: string;
  storyTime: string; // 故事内时间
  importance: number; // 重要程度 1-5
  involvedCharacterIds?: string[];
  relatedChapterId?: string;
}

// 术语/专有名词
export interface Terminology {
  id: string;
  bibleId: string;
  term: string;
  definition: string;
  category: string; // 功法、地名、物品、称谓等
  variants?: string[]; // 同义词/变体
  usage?: string;
}

// 势力/组织
export interface Faction {
  id: string;
  bibleId: string;
  name: string;
  type: string; // 国家、门派、公司、家族等
  description?: string;
  hierarchy?: Record<string, unknown>;
  territory?: string;
}

export interface StoryBible {
  id: string;
  projectId: string;
  premise?: string;
  theme?: string;
  tone?: string;
  worldType?: string;
  // Relations
  worldSettings?: WorldSetting[];
  characters?: Character[];
  timelineEvents?: TimelineEvent[];
  terminologies?: Terminology[];
  factions?: Faction[];
}

export interface CharacterPersonality {
  arc?: string;
  traits?: string[];
  motivation?: string;
}

export interface Character {
  id: string;
  projectId: string;
  name: string;
  role: string;
  description?: string;
  personality?: string | CharacterPersonality;
  background?: string;
}

export interface WritingMission {
  id: string;
  projectId: string;
  type?: 'outline' | 'chapter' | 'full_story';
  missionType?: 'outline' | 'chapter' | 'full_story'; // 后端返回的字段名
  status:
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed'
    | 'IN_PROGRESS'
    | 'COMPLETED'
    | 'FAILED';
  progress?: number;
  result?: string;
  createdAt?: string;
  startedAt?: string; // 后端也返回这个字段
  updatedAt?: string;
  completedAt?: string;
}

export interface CreateProjectDto {
  name: string;
  description?: string;
  genre?: string;
  targetWords?: number;
  writingStyle?: string;
}

// ==================== Writing Style Presets ====================

export interface WritingStylePreset {
  id: string;
  name: string;
  category: string;
  description: string;
  representative?: string;
}

export interface UpdateProjectDto {
  name?: string;
  description?: string;
  genre?: string;
  targetWords?: number;
  status?: string;
  writingStyle?: string;
}

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
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
  conversationHistory?: ConversationMessage[]; // 多轮对话历史
  chapterNumber?: number; // 针对特定章节的操作
}

// ==================== API Base ====================

// Use relative URLs to leverage Next.js rewrites proxy (avoids CORS)
// Next.js rewrites /api/v1/* to the backend URL

// 自定义 API 错误类，保留 HTTP 状态码
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

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
    throw new ApiError(
      error.message || `HTTP ${response.status}`,
      response.status
    );
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

// ==================== Writing Style Presets API ====================

/**
 * 获取所有写作风格预设
 */
export async function getStylePresets(): Promise<{
  presets: WritingStylePreset[];
}> {
  return fetchWithAuth('/api/v1/ai-writing/style-presets');
}

/**
 * 根据类型获取推荐的写作风格
 */
export async function getRecommendedStyles(genre: string): Promise<{
  genre: string;
  recommended: WritingStylePreset[];
  all: WritingStylePreset[];
}> {
  return fetchWithAuth(
    `/api/v1/ai-writing/style-presets/recommend?genre=${encodeURIComponent(genre)}`
  );
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

// ==================== Character Relationships API ====================

export interface RelationshipNode {
  id: string;
  name: string;
  role: string;
  aliases: string[];
  traits: string[];
}

export interface RelationshipEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label: string;
  description?: string;
}

export interface RelationshipGraph {
  nodes: RelationshipNode[];
  edges: RelationshipEdge[];
}

export async function getRelationshipGraph(
  projectId: string
): Promise<RelationshipGraph> {
  return fetchWithAuth(
    `/api/v1/ai-writing/projects/${projectId}/relationships/graph`
  );
}

export async function addCharacterRelationship(
  projectId: string,
  characterId: string,
  dto: {
    targetCharacterId: string;
    relationshipType: string;
    description?: string;
  }
): Promise<{ id: string; targetCharacter: { id: string; name: string } }> {
  return fetchWithAuth(
    `/api/v1/ai-writing/projects/${projectId}/characters/${characterId}/relationships`,
    {
      method: 'POST',
      body: JSON.stringify(dto),
    }
  );
}

export async function deleteCharacterRelationship(
  projectId: string,
  relationshipId: string
): Promise<void> {
  return fetchWithAuth(
    `/api/v1/ai-writing/projects/${projectId}/relationships/${relationshipId}`,
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
  limit?: number,
  offset?: number
): Promise<{ items: MissionLogItem[]; total: number }> {
  const params = new URLSearchParams();
  if (limit) params.set('limit', limit.toString());
  if (offset) params.set('offset', offset.toString());
  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/ai-writing/missions/${missionId}/logs${query ? `?${query}` : ''}`
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
