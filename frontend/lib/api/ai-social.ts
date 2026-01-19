/**
 * AI Social API Client
 *
 * API client for social media content publishing (WeChat MP, Xiaohongshu)
 * Uses the same pattern as AI Writing:
 * - fetchWithAuth for authentication
 * - Relative URLs for Next.js proxy
 */

import { getAuthTokens } from '../utils/auth';

// ==================== Types ====================

export type SocialPlatformType = 'WECHAT_MP' | 'XIAOHONGSHU';

export type SocialContentType = 'WECHAT_ARTICLE' | 'XIAOHONGSHU_NOTE';

export type SocialContentStatus =
  | 'DRAFT'
  | 'PENDING'
  | 'SCHEDULED'
  | 'PUBLISHING'
  | 'PUBLISHED'
  | 'FAILED';

export type SocialContentSourceType =
  | 'MANUAL'
  | 'EXTERNAL_URL'
  | 'AI_EXPLORE'
  | 'AI_RESEARCH'
  | 'AI_OFFICE'
  | 'AI_WRITING';

export type SocialReviewStatus =
  | 'PENDING'
  | 'APPROVED'
  | 'REJECTED'
  | 'REVISION_REQUESTED';

export interface SocialPlatformConnection {
  id: string;
  userId: string;
  platformType: SocialPlatformType;
  accountName: string | null;
  accountId: string | null;
  isActive: boolean;
  lastSyncAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SocialContent {
  id: string;
  userId: string;
  connectionId: string | null;
  contentType: SocialContentType;
  sourceType: SocialContentSourceType;
  sourceId: string | null;
  sourceUrl: string | null;
  title: string;
  content: string;
  digest: string | null;
  coverImageUrl: string | null;
  images: string[];
  tags: string[];
  status: SocialContentStatus;
  reviewStatus: SocialReviewStatus;
  reviewNotes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  complianceCheck: Record<string, unknown> | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  externalId: string | null;
  externalUrl: string | null;
  errorMessage: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  connection?: SocialPlatformConnection;
}

export interface SocialPublishLog {
  id: string;
  contentId: string;
  action: string;
  status: string;
  details: Record<string, unknown> | null;
  errorMessage: string | null;
  screenshotUrl: string | null;
  createdAt: string;
}

export interface ComplianceCheckResult {
  passed: boolean;
  issues: Array<{
    type: string;
    message: string;
    severity: 'warning' | 'error';
  }>;
  checkedAt: string;
}

// ==================== DTOs ====================

export interface CreateContentDto {
  contentType: SocialContentType;
  sourceType?: SocialContentSourceType;
  sourceId?: string;
  sourceUrl?: string;
  title: string;
  content: string;
  digest?: string;
  coverImageUrl?: string;
  images?: string[];
  tags?: string[];
  connectionId?: string;
  scheduledAt?: string;
}

export interface UpdateContentDto {
  title?: string;
  content?: string;
  digest?: string;
  coverImageUrl?: string;
  images?: string[];
  tags?: string[];
  connectionId?: string;
  scheduledAt?: string;
}

export interface ProcessUrlDto {
  url: string;
  targetType: SocialContentType;
  additionalInstructions?: string;
}

export interface ProcessSourceDto {
  sourceType: SocialContentSourceType;
  sourceId: string;
  targetType: SocialContentType;
  additionalInstructions?: string;
}

export interface PublishContentDto {
  connectionId: string;
  scheduledAt?: string;
}

export interface PlatformConfigDto {
  cookies?: string;
  sessionData?: Record<string, unknown>;
}

// ==================== API Base ====================

class ApiError extends Error {
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

// ==================== Platform Connection API ====================

/**
 * Get all platform connections for the current user
 */
export async function getConnections(): Promise<SocialPlatformConnection[]> {
  return fetchWithAuth('/api/v1/ai-social/connections');
}

/**
 * Get a specific platform connection
 */
export async function getConnection(
  id: string
): Promise<SocialPlatformConnection> {
  return fetchWithAuth(`/api/v1/ai-social/connections/${id}`);
}

/**
 * Get connection by platform type
 */
export async function getConnectionByPlatform(
  platformType: SocialPlatformType
): Promise<SocialPlatformConnection | null> {
  return fetchWithAuth(
    `/api/v1/ai-social/connections/platform/${platformType}`
  );
}

/**
 * Create or update platform connection
 */
export async function upsertConnection(
  platformType: SocialPlatformType,
  config: PlatformConfigDto
): Promise<SocialPlatformConnection> {
  return fetchWithAuth(
    `/api/v1/ai-social/connections/platform/${platformType}`,
    {
      method: 'POST',
      body: JSON.stringify(config),
    }
  );
}

/**
 * Delete a platform connection
 */
export async function deleteConnection(id: string): Promise<void> {
  return fetchWithAuth(`/api/v1/ai-social/connections/${id}`, {
    method: 'DELETE',
  });
}

/**
 * Test platform connection
 */
export async function testConnection(
  id: string
): Promise<{ success: boolean; message: string }> {
  return fetchWithAuth(`/api/v1/ai-social/connections/${id}/test`, {
    method: 'POST',
  });
}

/**
 * Refresh platform connection session
 */
export async function refreshConnection(
  id: string
): Promise<SocialPlatformConnection> {
  return fetchWithAuth(`/api/v1/ai-social/connections/${id}/refresh`, {
    method: 'POST',
  });
}

// ==================== Content API ====================

/**
 * Get all contents with optional filters
 */
export async function getContents(options?: {
  status?: SocialContentStatus;
  contentType?: SocialContentType;
  sourceType?: SocialContentSourceType;
  reviewStatus?: SocialReviewStatus;
  limit?: number;
  offset?: number;
}): Promise<{ items: SocialContent[]; total: number }> {
  const params = new URLSearchParams();
  if (options?.status) params.set('status', options.status);
  if (options?.contentType) params.set('contentType', options.contentType);
  if (options?.sourceType) params.set('sourceType', options.sourceType);
  if (options?.reviewStatus) params.set('reviewStatus', options.reviewStatus);
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());

  const query = params.toString();
  return fetchWithAuth(`/api/v1/ai-social/contents${query ? `?${query}` : ''}`);
}

/**
 * Get a specific content
 */
export async function getContent(id: string): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/contents/${id}`);
}

/**
 * Create new content
 */
export async function createContent(
  dto: CreateContentDto
): Promise<SocialContent> {
  return fetchWithAuth('/api/v1/ai-social/contents', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Update content
 */
export async function updateContent(
  id: string,
  dto: UpdateContentDto
): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/contents/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dto),
  });
}

/**
 * Delete content
 */
export async function deleteContent(id: string): Promise<void> {
  return fetchWithAuth(`/api/v1/ai-social/contents/${id}`, {
    method: 'DELETE',
  });
}

// ==================== AI Engine API ====================

/**
 * Process external URL - AI extracts and transforms content
 */
export async function processUrl(dto: ProcessUrlDto): Promise<{
  content: SocialContent;
  checkResult: ComplianceCheckResult;
  message: string;
}> {
  return fetchWithAuth('/api/v1/ai-social/engine/process-url', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Process internal source - AI transforms content from AI Explore/Research/Office/Writing
 */
export async function processSource(dto: ProcessSourceDto): Promise<{
  content: SocialContent;
  checkResult: ComplianceCheckResult;
  message: string;
}> {
  return fetchWithAuth('/api/v1/ai-social/engine/process-source', {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}

/**
 * Regenerate content using AI
 */
export async function regenerateContent(contentId: string): Promise<{
  content: SocialContent;
  checkResult: ComplianceCheckResult;
  message: string;
}> {
  return fetchWithAuth(`/api/v1/ai-social/engine/regenerate/${contentId}`, {
    method: 'POST',
  });
}

/**
 * Run compliance check on content
 */
export async function checkCompliance(
  contentId: string
): Promise<ComplianceCheckResult> {
  return fetchWithAuth(`/api/v1/ai-social/engine/check/${contentId}`, {
    method: 'POST',
  });
}

// ==================== Review API ====================

/**
 * Approve content for publishing
 */
export async function approveContent(
  contentId: string,
  notes?: string
): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/review/${contentId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/**
 * Reject content
 */
export async function rejectContent(
  contentId: string,
  notes: string
): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/review/${contentId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/**
 * Request revision for content
 */
export async function requestRevision(
  contentId: string,
  notes: string
): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/review/${contentId}/revision`, {
    method: 'POST',
    body: JSON.stringify({ notes }),
  });
}

/**
 * Resubmit content for review after revision
 */
export async function resubmitForReview(
  contentId: string
): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/review/${contentId}/resubmit`, {
    method: 'POST',
  });
}

// ==================== Publish API ====================

/**
 * Publish content to platform
 */
export async function publishContent(
  contentId: string,
  dto?: PublishContentDto
): Promise<{
  success: boolean;
  externalUrl?: string;
  externalId?: string;
  errorMessage?: string;
}> {
  return fetchWithAuth(`/api/v1/ai-social/contents/${contentId}/publish`, {
    method: 'POST',
    body: JSON.stringify(dto || {}),
  });
}

/**
 * Schedule content for future publishing
 */
export async function scheduleContent(
  contentId: string,
  scheduledAt: string,
  connectionId?: string
): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/contents/${contentId}/schedule`, {
    method: 'POST',
    body: JSON.stringify({ scheduledAt, connectionId }),
  });
}

/**
 * Cancel scheduled publishing
 */
export async function cancelSchedule(
  contentId: string
): Promise<SocialContent> {
  return fetchWithAuth(`/api/v1/ai-social/contents/${contentId}/unschedule`, {
    method: 'POST',
  });
}

/**
 * Get publish logs for content
 */
export async function getPublishLogs(
  contentId: string
): Promise<SocialPublishLog[]> {
  return fetchWithAuth(`/api/v1/ai-social/contents/${contentId}/logs`);
}

// ==================== Source Fetcher API ====================

/**
 * Get available sources from AI Explore
 */
export async function getExploreSources(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  items: Array<{
    id: string;
    title: string;
    url: string;
    type: string;
    thumbnail?: string;
  }>;
  total: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/ai-social/sources/explore${query ? `?${query}` : ''}`
  );
}

/**
 * Get available sources from AI Research
 */
export async function getResearchSources(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  items: Array<{
    id: string;
    title: string;
    type: string;
    createdAt: string;
  }>;
  total: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/ai-social/sources/research${query ? `?${query}` : ''}`
  );
}

/**
 * Get available sources from AI Office
 */
export async function getOfficeSources(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  items: Array<{
    id: string;
    title: string;
    type: string;
    createdAt: string;
  }>;
  total: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/ai-social/sources/office${query ? `?${query}` : ''}`
  );
}

/**
 * Get available sources from AI Writing
 */
export async function getWritingSources(options?: {
  limit?: number;
  offset?: number;
}): Promise<{
  items: Array<{
    id: string;
    title: string;
    type: string;
    wordCount: number;
    createdAt: string;
  }>;
  total: number;
}> {
  const params = new URLSearchParams();
  if (options?.limit) params.set('limit', options.limit.toString());
  if (options?.offset) params.set('offset', options.offset.toString());
  const query = params.toString();
  return fetchWithAuth(
    `/api/v1/ai-social/sources/writing${query ? `?${query}` : ''}`
  );
}
