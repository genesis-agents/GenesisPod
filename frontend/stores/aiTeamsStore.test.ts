import { act, renderHook } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { useAiGroupStore } from './aiTeamsStore';
import * as api from '@/lib/api/ai-teams';
import { TopicResourceType } from '@/types/ai-teams';

// Mock the API module
vi.mock('@/lib/api/ai-teams');
vi.mock('@/lib/utils/auth', () => ({
  getAuthTokens: vi.fn(() => ({ accessToken: 'test-token' })),
}));

// Mock socket.io-client
vi.mock('socket.io-client', () => ({
  io: vi.fn(() => ({
    on: vi.fn(),
    emit: vi.fn(),
    disconnect: vi.fn(),
    connected: false,
    id: 'mock-socket-id',
    io: {
      on: vi.fn(),
      engine: { on: vi.fn() },
    },
  })),
}));

const mockApi = vi.mocked(api);

describe('aiTeamsStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const { result } = renderHook(() => useAiGroupStore());
    act(() => {
      result.current.resetStore();
    });
    vi.clearAllMocks();
  });

  describe('Topics', () => {
    const mockTopics = [
      {
        id: 'topic-1',
        name: 'Test Topic 1',
        description: 'Description 1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creatorId: 'user-1',
      },
      {
        id: 'topic-2',
        name: 'Test Topic 2',
        description: 'Description 2',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creatorId: 'user-1',
      },
    ];

    it('should fetch topics successfully', async () => {
      mockApi.getTopics.mockResolvedValue(mockTopics);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.fetchTopics();
      });

      expect(result.current.topics).toHaveLength(2);
      expect(result.current.topics[0].name).toBe('Test Topic 1');
      expect(result.current.isLoadingTopics).toBe(false);
    });

    it('should handle fetch topics error', async () => {
      mockApi.getTopics.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.fetchTopics();
      });

      expect(result.current.topics).toHaveLength(0);
      expect(result.current.isLoadingTopics).toBe(false);
    });

    it('should create a new topic', async () => {
      const newTopic = {
        id: 'topic-3',
        name: 'New Topic',
        description: 'New description',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        creatorId: 'user-1',
      };
      mockApi.createTopic.mockResolvedValue(newTopic);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.createTopic({
          name: 'New Topic',
          description: 'New description',
        });
      });

      expect(result.current.topics).toHaveLength(1);
      expect(result.current.topics[0].name).toBe('New Topic');
    });

    it('should update a topic', async () => {
      const updatedTopic = {
        id: 'topic-1',
        name: 'Updated Topic',
        description: 'Updated description',
      };
      mockApi.updateTopic.mockResolvedValue(updatedTopic);

      const { result } = renderHook(() => useAiGroupStore());

      // First add a topic to the store
      act(() => {
        result.current.setCurrentTopic({
          id: 'topic-1',
          name: 'Original Topic',
          description: 'Original description',
        });
      });

      await act(async () => {
        await result.current.updateTopic('topic-1', {
          name: 'Updated Topic',
        });
      });

      expect(result.current.currentTopic?.name).toBe('Updated Topic');
    });

    it('should delete a topic', async () => {
      mockApi.deleteTopic.mockResolvedValue(undefined);
      mockApi.getTopics.mockResolvedValue([
        { id: 'topic-1', name: 'Topic 1' },
      ]);

      const { result } = renderHook(() => useAiGroupStore());

      // First fetch topics
      await act(async () => {
        await result.current.fetchTopics();
      });
      expect(result.current.topics).toHaveLength(1);

      // Delete the topic
      await act(async () => {
        await result.current.deleteTopic('topic-1');
      });

      expect(result.current.topics).toHaveLength(0);
    });

    it('should set current topic', () => {
      const topic = {
        id: 'topic-1',
        name: 'Test Topic',
      };

      const { result } = renderHook(() => useAiGroupStore());

      act(() => {
        result.current.setCurrentTopic(topic);
      });

      expect(result.current.currentTopic).toEqual(topic);
    });
  });

  describe('Messages', () => {
    const mockMessagesResponse = {
      messages: [
        {
          id: 'msg-1',
          content: 'Hello',
          topicId: 'topic-1',
          senderId: 'user-1',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'msg-2',
          content: 'World',
          topicId: 'topic-1',
          senderId: 'user-2',
          createdAt: new Date().toISOString(),
        },
      ],
      hasMore: false,
      nextCursor: null,
    };

    it('should fetch messages successfully', async () => {
      mockApi.getMessages.mockResolvedValue(mockMessagesResponse);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.fetchMessages('topic-1');
      });

      expect(result.current.messages).toHaveLength(2);
      expect(result.current.messages[0].content).toBe('Hello');
      expect(result.current.isLoadingMessages).toBe(false);
    });

    it('should append messages when cursor is provided', async () => {
      const initialResponse = {
        messages: [{ id: 'msg-1', content: 'First' }],
        hasMore: true,
        nextCursor: 'cursor-1',
      };
      const appendResponse = {
        messages: [{ id: 'msg-2', content: 'Second' }],
        hasMore: false,
        nextCursor: null,
      };

      mockApi.getMessages
        .mockResolvedValueOnce(initialResponse)
        .mockResolvedValueOnce(appendResponse);

      const { result } = renderHook(() => useAiGroupStore());

      // First fetch
      await act(async () => {
        await result.current.fetchMessages('topic-1');
      });
      expect(result.current.messages).toHaveLength(1);

      // Fetch more with cursor
      await act(async () => {
        await result.current.fetchMessages('topic-1', 'cursor-1');
      });
      expect(result.current.messages).toHaveLength(2);
    });

    it('should send a message', async () => {
      const newMessage = {
        id: 'msg-new',
        content: 'New message',
        topicId: 'topic-1',
        senderId: 'user-1',
      };
      mockApi.sendMessage.mockResolvedValue(newMessage);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.sendMessage('topic-1', { content: 'New message' });
      });

      expect(mockApi.sendMessage).toHaveBeenCalledWith('topic-1', {
        content: 'New message',
      });
    });

    it('should delete a message', async () => {
      mockApi.deleteMessage.mockResolvedValue(undefined);
      mockApi.getMessages.mockResolvedValue({
        messages: [{ id: 'msg-1', content: 'Hello' }],
        hasMore: false,
        nextCursor: null,
      });

      const { result } = renderHook(() => useAiGroupStore());

      // First fetch messages
      await act(async () => {
        await result.current.fetchMessages('topic-1');
      });
      expect(result.current.messages).toHaveLength(1);

      // Delete message
      await act(async () => {
        await result.current.deleteMessage('topic-1', 'msg-1');
      });

      expect(result.current.messages).toHaveLength(0);
    });

    it('should clear messages', () => {
      const { result } = renderHook(() => useAiGroupStore());

      // Set some state first
      act(() => {
        result.current.clearMessages();
      });

      expect(result.current.messages).toHaveLength(0);
      expect(result.current.hasMoreMessages).toBe(false);
      expect(result.current.nextCursor).toBeNull();
    });
  });

  describe('Resources', () => {
    const mockResources = [
      {
        id: 'resource-1',
        resourceId: 'res-1',
        url: 'https://example.com/1',
        topicId: 'topic-1',
        addedAt: new Date().toISOString(),
      },
    ];

    it('should fetch resources successfully', async () => {
      mockApi.getResources.mockResolvedValue(mockResources);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.fetchResources('topic-1');
      });

      expect(result.current.resources).toHaveLength(1);
      expect(result.current.resources[0].id).toBe('resource-1');
      expect(result.current.isLoadingResources).toBe(false);
    });

    it('should add a resource', async () => {
      const newResource = {
        id: 'resource-2',
        resourceId: 'res-2',
        url: 'https://example.com/new',
        topicId: 'topic-1',
        addedAt: new Date().toISOString(),
      };
      mockApi.addResource.mockResolvedValue(newResource);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.addResource('topic-1', {
          type: TopicResourceType.LINK,
          name: 'Test Resource',
          url: 'https://example.com/new',
        });
      });

      expect(result.current.resources).toHaveLength(1);
      expect(result.current.resources[0].id).toBe('resource-2');
    });

    it('should remove a resource', async () => {
      mockApi.removeResource.mockResolvedValue(undefined);
      mockApi.getResources.mockResolvedValue([
        { id: 'resource-1', resourceId: 'res-1' },
      ]);

      const { result } = renderHook(() => useAiGroupStore());

      // First fetch resources
      await act(async () => {
        await result.current.fetchResources('topic-1');
      });
      expect(result.current.resources).toHaveLength(1);

      // Remove resource
      await act(async () => {
        await result.current.removeResource('topic-1', 'resource-1');
      });

      expect(result.current.resources).toHaveLength(0);
    });
  });

  describe('Team Missions', () => {
    const mockMissions = [
      {
        id: 'mission-1',
        title: 'Test Mission',
        status: 'PENDING',
        topicId: 'topic-1',
        leaderId: 'ai-1',
      },
    ];

    it('should fetch missions successfully', async () => {
      mockApi.getMissions.mockResolvedValue(mockMissions);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.fetchMissions('topic-1');
      });

      expect(result.current.missions).toHaveLength(1);
      expect(result.current.missions[0].title).toBe('Test Mission');
      expect(result.current.isLoadingMissions).toBe(false);
    });

    it('should create a mission', async () => {
      const newMission = {
        id: 'mission-2',
        title: 'New Mission',
        status: 'PENDING',
        topicId: 'topic-1',
        leaderId: 'ai-1',
      };
      mockApi.createMission.mockResolvedValue(newMission);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.createMission('topic-1', {
          title: 'New Mission',
          description: 'Test description',
          leaderId: 'ai-1',
        });
      });

      expect(result.current.missions).toHaveLength(1);
      expect(result.current.currentMission?.id).toBe('mission-2');
    });

    it('should cancel a mission', async () => {
      const cancelledMission = {
        id: 'mission-1',
        title: 'Test Mission',
        status: 'CANCELLED',
      };
      mockApi.cancelMission.mockResolvedValue(cancelledMission);
      mockApi.getMissions.mockResolvedValue([
        { id: 'mission-1', title: 'Test Mission', status: 'PENDING' },
      ]);

      const { result } = renderHook(() => useAiGroupStore());

      // First fetch missions
      await act(async () => {
        await result.current.fetchMissions('topic-1');
      });

      // Cancel mission
      await act(async () => {
        await result.current.cancelMission('topic-1', 'mission-1');
      });

      expect(result.current.missions[0].status).toBe('CANCELLED');
    });

    it('should set current mission', () => {
      const mission = {
        id: 'mission-1',
        title: 'Test Mission',
      };

      const { result } = renderHook(() => useAiGroupStore());

      act(() => {
        result.current.setCurrentMission(mission);
      });

      expect(result.current.currentMission).toEqual(mission);
    });
  });

  describe('Team Members', () => {
    const mockTeamMembers = {
      leader: { id: 'ai-1', isLeader: true },
      members: [{ id: 'ai-2', isLeader: false }],
      all: [
        { id: 'ai-1', isLeader: true },
        { id: 'ai-2', isLeader: false },
      ],
    };

    it('should fetch team members successfully', async () => {
      mockApi.getTeamMembers.mockResolvedValue(mockTeamMembers);

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.fetchTeamMembers('topic-1');
      });

      expect(result.current.teamMembers).toHaveLength(2);
      expect(result.current.isLoadingTeamMembers).toBe(false);
    });

    it('should set team leader', async () => {
      mockApi.setTeamLeader.mockResolvedValue({});
      mockApi.getTeamMembers.mockResolvedValue(mockTeamMembers);
      mockApi.getTopicById.mockResolvedValue({ id: 'topic-1' });

      const { result } = renderHook(() => useAiGroupStore());

      await act(async () => {
        await result.current.setTeamLeader('topic-1', 'ai-2');
      });

      expect(mockApi.setTeamLeader).toHaveBeenCalledWith('topic-1', 'ai-2');
    });
  });

  describe('Store Reset', () => {
    it('should reset all state', async () => {
      mockApi.getTopics.mockResolvedValue([{ id: 'topic-1' }]);
      mockApi.getMessages.mockResolvedValue({
        messages: [{ id: 'msg-1' }],
        hasMore: false,
        nextCursor: null,
      });

      const { result } = renderHook(() => useAiGroupStore());

      // Populate some state
      await act(async () => {
        await result.current.fetchTopics();
        await result.current.fetchMessages('topic-1');
      });

      expect(result.current.topics).toHaveLength(1);
      expect(result.current.messages).toHaveLength(1);

      // Reset store
      act(() => {
        result.current.resetStore();
      });

      expect(result.current.topics).toHaveLength(0);
      expect(result.current.messages).toHaveLength(0);
      expect(result.current.currentTopic).toBeNull();
      expect(result.current.missions).toHaveLength(0);
      expect(result.current.resources).toHaveLength(0);
    });
  });
});
