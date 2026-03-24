/**
 * useConsciousness - 意识上传系统 Hook
 *
 * 管理意识档案、数据源、记忆、对话等功能
 */

import { useState, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';
import { useApiGet, type UseApiGetResult } from '../core/useApi';

// ─── Types ───

export interface ConsciousnessProfile {
  id: string;
  userId: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  status: 'DRAFT' | 'COLLECTING' | 'ANALYZING' | 'READY' | 'ARCHIVED';
  personalityModel: Record<string, number> | null;
  writingStyle: Record<string, string> | null;
  knowledgeDomains: Array<{ domain: string; confidence: number }> | null;
  sharePermission: 'PRIVATE' | 'SHARED' | 'PUBLIC';
  totalDataSources: number;
  totalMemories: number;
  totalConversations: number;
  createdAt: string;
  updatedAt: string;
  analyzedAt: string | null;
  dataSources?: ConsciousnessDataSource[];
  _count?: {
    memories: number;
    conversations: number;
    dataSources: number;
  };
}

export interface ConsciousnessDataSource {
  id: string;
  profileId: string;
  type: 'TEXT' | 'DOCUMENT' | 'CHAT_HISTORY' | 'SOCIAL_MEDIA' | 'KNOWLEDGE_BASE' | 'NOTES';
  name: string;
  content: string | null;
  fileUrl: string | null;
  fileSize: number | null;
  mimeType: string | null;
  isProcessed: boolean;
  processedAt: string | null;
  createdAt: string;
}

export interface ConsciousnessMemory {
  id: string;
  profileId: string;
  category: string;
  topic: string;
  content: string;
  importance: number;
  confidence: number;
  createdAt: string;
}

export interface ConsciousnessConversation {
  id: string;
  profileId: string;
  userId: string;
  title: string;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  _count?: { messages: number };
}

export interface ConsciousnessMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'avatar';
  content: string;
  memoriesUsed: Array<{ id: string; topic: string }> | null;
  tokens: number | null;
  createdAt: string;
}

export interface AnalysisResult {
  memoriesExtracted: number;
  sourcesProcessed: number;
  personalityModel: Record<string, number>;
  knowledgeDomains: Array<{ domain: string; confidence: number }>;
}

// ─── Hook ───

export function useConsciousness() {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // ─── Profile Operations ───

  const createProfile = useCallback(
    async (data: { name: string; description?: string; avatarUrl?: string }) => {
      return apiClient.post<ConsciousnessProfile>(
        '/api/v1/consciousness/profiles',
        data,
      );
    },
    [],
  );

  const updateProfile = useCallback(
    async (
      profileId: string,
      data: { name?: string; description?: string; sharePermission?: string },
    ) => {
      return apiClient.patch<ConsciousnessProfile>(
        `/api/v1/consciousness/profiles/${profileId}`,
        data,
      );
    },
    [],
  );

  const deleteProfile = useCallback(async (profileId: string) => {
    return apiClient.delete(`/api/v1/consciousness/profiles/${profileId}`);
  }, []);

  // ─── Data Source Operations ───

  const addDataSource = useCallback(
    async (
      profileId: string,
      data: {
        type: string;
        name: string;
        content?: string;
        fileUrl?: string;
        fileSize?: number;
        mimeType?: string;
      },
    ) => {
      return apiClient.post<ConsciousnessDataSource>(
        `/api/v1/consciousness/profiles/${profileId}/sources`,
        data,
      );
    },
    [],
  );

  const deleteDataSource = useCallback(
    async (profileId: string, sourceId: string) => {
      return apiClient.delete(
        `/api/v1/consciousness/profiles/${profileId}/sources/${sourceId}`,
      );
    },
    [],
  );

  // ─── Analysis ───

  const analyzeProfile = useCallback(async (profileId: string) => {
    setIsAnalyzing(true);
    try {
      const result = await apiClient.post<AnalysisResult>(
        `/api/v1/consciousness/profiles/${profileId}/analyze`,
      );
      return result;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  // ─── Conversation Operations ───

  const createConversation = useCallback(
    async (profileId: string, title: string) => {
      return apiClient.post<ConsciousnessConversation>(
        `/api/v1/consciousness/profiles/${profileId}/conversations`,
        { title },
      );
    },
    [],
  );

  const sendMessage = useCallback(
    async (conversationId: string, content: string) => {
      setIsSending(true);
      try {
        const result = await apiClient.post<ConsciousnessMessage>(
          `/api/v1/consciousness/conversations/${conversationId}/messages`,
          { content },
        );
        return result;
      } finally {
        setIsSending(false);
      }
    },
    [],
  );

  // ─── Sharing ───

  const shareProfile = useCallback(
    async (
      profileId: string,
      data: {
        sharedWithUserId: string;
        canChat?: boolean;
        canViewMemories?: boolean;
      },
    ) => {
      return apiClient.post(
        `/api/v1/consciousness/profiles/${profileId}/share`,
        data,
      );
    },
    [],
  );

  const removeShare = useCallback(
    async (profileId: string, sharedWithUserId: string) => {
      return apiClient.delete(
        `/api/v1/consciousness/profiles/${profileId}/share/${sharedWithUserId}`,
      );
    },
    [],
  );

  return {
    // Profile
    createProfile,
    updateProfile,
    deleteProfile,

    // Data sources
    addDataSource,
    deleteDataSource,

    // Analysis
    analyzeProfile,
    isAnalyzing,

    // Conversations
    createConversation,
    sendMessage,
    isSending,

    // Sharing
    shareProfile,
    removeShare,
  };
}

// ─── Data Fetching Hooks ───

export function useConsciousnessProfiles(): UseApiGetResult<ConsciousnessProfile[]> {
  return useApiGet<ConsciousnessProfile[]>(
    '/api/v1/consciousness/profiles',
    { cacheKey: 'consciousness-profiles' },
  );
}

export function useConsciousnessProfile(
  profileId: string | null,
): UseApiGetResult<ConsciousnessProfile> {
  return useApiGet<ConsciousnessProfile>(
    profileId ? `/api/v1/consciousness/profiles/${profileId}` : '',
    { cacheKey: profileId ? `consciousness-profile-${profileId}` : undefined },
  );
}

export function useConsciousnessMemories(
  profileId: string | null,
  category?: string,
): UseApiGetResult<ConsciousnessMemory[]> {
  const params = category ? `?category=${encodeURIComponent(category)}` : '';
  return useApiGet<ConsciousnessMemory[]>(
    profileId
      ? `/api/v1/consciousness/profiles/${profileId}/memories${params}`
      : '',
  );
}

export function useConsciousnessConversations(
  profileId: string | null,
): UseApiGetResult<ConsciousnessConversation[]> {
  return useApiGet<ConsciousnessConversation[]>(
    profileId
      ? `/api/v1/consciousness/profiles/${profileId}/conversations`
      : '',
  );
}

export function useConsciousnessConversation(
  conversationId: string | null,
): UseApiGetResult<ConsciousnessConversation & { messages: ConsciousnessMessage[] }> {
  return useApiGet<ConsciousnessConversation & { messages: ConsciousnessMessage[] }>(
    conversationId
      ? `/api/v1/consciousness/conversations/${conversationId}`
      : '',
  );
}
