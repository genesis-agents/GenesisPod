/**
 * SWR Hooks Tests for AI Social Module
 *
 * Basic smoke tests to verify SWR hooks functionality
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useSocialConnectionsSWR, useSocialContentsSWR } from './useSocialSWR';
import * as api from '@/lib/api/ai-social';

// Mock the API
vi.mock('@/lib/api/ai-social', () => ({
  getConnections: vi.fn(),
  getContents: vi.fn(),
}));

describe('useSocialConnectionsSWR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch connections successfully', async () => {
    const mockConnections = [
      {
        id: '1',
        userId: 'user-1',
        platformType: 'WECHAT_MP' as const,
        accountId: 'account-1',
        accountName: 'Test Account',
        avatarUrl: null,
        isActive: true,
        sessionData: null,
        lastCheckAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    vi.mocked(api.getConnections).mockResolvedValue(mockConnections as any);

    const { result } = renderHook(() => useSocialConnectionsSWR());

    // Initially loading
    expect(result.current.isLoading).toBe(true);
    expect(result.current.connections).toEqual([]);

    // Wait for data to load
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.connections).toEqual(mockConnections);
    expect(api.getConnections).toHaveBeenCalledTimes(1);
  });
});

describe('useSocialContentsSWR', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch contents successfully', async () => {
    const mockData = {
      items: [
        {
          id: '1',
          userId: 'user-1',
          connectionId: null,
          title: 'Test Content',
          content: 'Test content body',
          contentType: 'WECHAT_ARTICLE' as const,
          sourceType: 'MANUAL' as const,
          sourceId: null,
          externalUrl: null,
          status: 'DRAFT' as const,
          reviewStatus: 'NOT_SUBMITTED' as const,
          scheduledAt: null,
          publishedAt: null,
          platformArticleId: null,
          platformArticleUrl: null,
          coverImage: null,
          excerpt: null,
          tags: [],
          metadata: null,
          retryCount: 0,
          lastError: null,
          complianceCheckedAt: null,
          complianceResult: null,
          aiGeneratedAt: null,
          aiModelUsed: null,
          aiPrompt: null,
          regenerationCount: 0,
          reviewedBy: null,
          reviewedAt: null,
          reviewNotes: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      total: 1,
    };

    vi.mocked(api.getContents).mockResolvedValue(mockData as any);

    const { result } = renderHook(() => useSocialContentsSWR());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.contents).toEqual(mockData.items);
    expect(result.current.total).toBe(1);
  });

  it('should support filtering by status', async () => {
    const mockData = {
      items: [],
      total: 0,
    };

    vi.mocked(api.getContents).mockResolvedValue(mockData);

    const { result } = renderHook(() =>
      useSocialContentsSWR({ status: 'PUBLISHED' })
    );

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(api.getContents).toHaveBeenCalledWith({ status: 'PUBLISHED' });
  });
});
