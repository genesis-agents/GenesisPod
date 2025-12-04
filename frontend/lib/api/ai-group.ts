import { getAuthTokens } from '../auth';
import {
  Topic,
  TopicMember,
  TopicAIMember,
  TopicAIMemberWithTeamRole,
  TopicMessage,
  TopicResource,
  TopicSummary,
  CreateTopicDto,
  UpdateTopicDto,
  AddMemberDto,
  AddAIMemberDto,
  UpdateAIMemberDto,
  SendMessageDto,
  AddResourceDto,
  GenerateSummaryDto,
  MessagesResponse,
  TopicType,
  TopicRole,
  // Team Mission types
  TeamMission,
  MissionLog,
  CreateMissionDto,
  UpdateAIMemberTeamRoleDto,
  MissionStatus,
} from '@/types/ai-group';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

  const response = await fetch(`${API_BASE}${url}`, {
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

// ==================== Topic API ====================

export async function createTopic(dto: CreateTopicDto): Promise<Topic> {
  return fetchWithAuth('/api/v1/topics', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function getTopics(options?: {
  type?: TopicType;
  search?: string;
}): Promise<Topic[]> {
  const params = new URLSearchParams();
  if (options?.type) params.set('type', options.type);
  if (options?.search) params.set('search', options.search);

  const query = params.toString();
  return fetchWithAuth(`/api/v1/topics${query ? `?${query}` : ''}`);
}

export async function getTopicById(topicId: string): Promise<Topic> {
  return fetchWithAuth(`/api/v1/topics/${topicId}`);
}

export async function updateTopic(
  topicId: string,
  dto: UpdateTopicDto
): Promise<Topic> {
  return fetchWithAuth(`/api/v1/topics/${topicId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function archiveTopic(topicId: string): Promise<Topic> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/archive`, {
    method: 'POST',
  });
}

export async function deleteTopic(topicId: string): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}`, {
    method: 'DELETE',
  });
}

// ==================== Member API ====================

export async function getMembers(topicId: string): Promise<TopicMember[]> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/members`);
}

export async function addMember(
  topicId: string,
  dto: AddMemberDto
): Promise<TopicMember> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/members`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function addMemberByEmail(
  topicId: string,
  email: string,
  role?: TopicRole
): Promise<TopicMember> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/members/invite`, {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  });
}

export async function addMembers(
  topicId: string,
  userIds: string[],
  role?: TopicRole
): Promise<{ added: number }> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/members/batch`, {
    method: 'POST',
    body: JSON.stringify({ userIds, role }),
  });
}

export async function updateMember(
  topicId: string,
  memberId: string,
  dto: { role?: TopicRole; nickname?: string }
): Promise<TopicMember> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/members/${memberId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function removeMember(
  topicId: string,
  memberId: string
): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/members/${memberId}`, {
    method: 'DELETE',
  });
}

export async function leaveTopic(topicId: string): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/leave`, {
    method: 'POST',
  });
}

// ==================== AI Member API ====================

export async function getAIMembers(topicId: string): Promise<TopicAIMember[]> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/ai-members`);
}

export async function addAIMember(
  topicId: string,
  dto: AddAIMemberDto
): Promise<TopicAIMember> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/ai-members`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function updateAIMember(
  topicId: string,
  aiMemberId: string,
  dto: UpdateAIMemberDto
): Promise<TopicAIMember> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/ai-members/${aiMemberId}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

export async function removeAIMember(
  topicId: string,
  aiMemberId: string
): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/ai-members/${aiMemberId}`, {
    method: 'DELETE',
  });
}

// ==================== Message API ====================

export async function getMessages(
  topicId: string,
  options?: { cursor?: string; limit?: number }
): Promise<MessagesResponse> {
  const params = new URLSearchParams();
  if (options?.cursor) params.set('cursor', options.cursor);
  if (options?.limit) params.set('limit', options.limit.toString());

  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/topics/${topicId}/messages${query ? `?${query}` : ''}`
  );
}

export async function sendMessage(
  topicId: string,
  dto: SendMessageDto
): Promise<TopicMessage> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/messages`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function deleteMessage(
  topicId: string,
  messageId: string
): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/messages/${messageId}`, {
    method: 'DELETE',
  });
}

export async function addReaction(
  topicId: string,
  messageId: string,
  emoji: string
): Promise<{
  id: string;
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: string;
}> {
  return fetchWithAuth(
    `/api/v1/topics/${topicId}/messages/${messageId}/reactions`,
    {
      method: 'POST',
      body: JSON.stringify({ emoji }),
    }
  );
}

export async function removeReaction(
  topicId: string,
  messageId: string,
  emoji: string
): Promise<void> {
  return fetchWithAuth(
    `/api/v1/topics/${topicId}/messages/${messageId}/reactions/${emoji}`,
    {
      method: 'DELETE',
    }
  );
}

export async function markAsRead(
  topicId: string,
  messageId?: string
): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/read`, {
    method: 'POST',
    body: JSON.stringify({ messageId }),
  });
}

// ==================== AI Response API ====================

export async function generateAIResponse(
  topicId: string,
  aiMemberId: string,
  contextMessageIds?: string[]
): Promise<TopicMessage> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/ai/generate`, {
    method: 'POST',
    body: JSON.stringify({ aiMemberId, contextMessageIds }),
  });
}

// ==================== Resource API ====================

export async function getResources(topicId: string): Promise<TopicResource[]> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/resources`);
}

export async function addResource(
  topicId: string,
  dto: AddResourceDto
): Promise<TopicResource> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/resources`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function removeResource(
  topicId: string,
  resourceId: string
): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/resources/${resourceId}`, {
    method: 'DELETE',
  });
}

// ==================== Summary API ====================

export async function getSummaries(topicId: string): Promise<TopicSummary[]> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/summaries`);
}

export async function generateSummary(
  topicId: string,
  dto: GenerateSummaryDto
): Promise<TopicSummary> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/summaries`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

export async function deleteSummary(
  topicId: string,
  summaryId: string
): Promise<void> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/summaries/${summaryId}`, {
    method: 'DELETE',
  });
}

// ==================== Team Mission API ====================

/**
 * 创建团队任务
 */
export async function createMission(
  topicId: string,
  dto: CreateMissionDto
): Promise<TeamMission> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/missions`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * 获取任务列表
 */
export async function getMissions(
  topicId: string,
  options?: {
    status?: MissionStatus;
    limit?: number;
    offset?: number;
  }
): Promise<{ missions: TeamMission[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/topics/${topicId}/missions${query ? `?${query}` : ''}`
  );
}

/**
 * 获取任务详情
 */
export async function getMissionById(
  topicId: string,
  missionId: string
): Promise<TeamMission> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/missions/${missionId}`);
}

/**
 * 取消任务
 */
export async function cancelMission(
  topicId: string,
  missionId: string
): Promise<TeamMission> {
  return fetchWithAuth(
    `/api/v1/topics/${topicId}/missions/${missionId}/cancel`,
    {
      method: 'POST',
    }
  );
}

/**
 * 获取任务执行日志
 */
export async function getMissionLogs(
  topicId: string,
  missionId: string,
  options?: { limit?: number; offset?: number }
): Promise<{ logs: MissionLog[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/topics/${topicId}/missions/${missionId}/logs${query ? `?${query}` : ''}`
  );
}

// ==================== Team Role API ====================

/**
 * 设置团队领导
 */
export async function setTeamLeader(
  topicId: string,
  aiMemberId: string
): Promise<TopicAIMemberWithTeamRole> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/team/leader`, {
    method: 'POST',
    body: JSON.stringify({ aiMemberId }),
  });
}

/**
 * 更新AI成员的团队角色配置
 */
export async function updateTeamRole(
  topicId: string,
  aiMemberId: string,
  dto: UpdateAIMemberTeamRoleDto
): Promise<TopicAIMemberWithTeamRole> {
  return fetchWithAuth(
    `/api/v1/topics/${topicId}/ai-members/${aiMemberId}/team-role`,
    {
      method: 'PATCH',
      body: JSON.stringify(dto),
    }
  );
}

/**
 * 获取团队成员（包含团队角色信息）
 */
export async function getTeamMembers(topicId: string): Promise<{
  leader?: TopicAIMemberWithTeamRole;
  members: TopicAIMemberWithTeamRole[];
  all: TopicAIMemberWithTeamRole[];
}> {
  return fetchWithAuth(`/api/v1/topics/${topicId}/team`);
}
