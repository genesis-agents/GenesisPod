import { create } from 'zustand';
import {
  Topic,
  TopicMessage,
  TopicResource,
  TopicRole,
  TopicType,
  SendMessageDto,
  CreateTopicDto,
  UpdateTopicDto,
  AddAIMemberDto,
  UpdateAIMemberDto,
  AddResourceDto,
  // Team Mission types
  TeamMission,
  MissionLog,
  CreateMissionDto,
  UpdateAIMemberTeamRoleDto,
  TopicAIMemberWithTeamRole,
  MissionStatus,
  AgentTaskStatus,
  AgentTask,
} from '@/types/ai-teams';
import * as api from '@/lib/api/ai-teams';
import { getAuthTokens } from '@/lib/utils/auth';
import { io, Socket } from 'socket.io-client';

import { logger } from '@/lib/utils/logger';
// Performance: Maximum messages to keep in memory to prevent browser memory overflow
// Older messages will be discarded when this limit is exceeded
const MAX_MESSAGES_IN_MEMORY = 200;

interface AiGroupState {
  // Topics
  topics: Topic[];
  currentTopic: Topic | null;
  isLoadingTopics: boolean;

  // Messages
  messages: TopicMessage[];
  isLoadingMessages: boolean;
  hasMoreMessages: boolean;
  nextCursor: string | null;

  // Resources
  resources: TopicResource[];
  isLoadingResources: boolean;

  // WebSocket
  socket: Socket | null;
  isConnected: boolean;
  currentUserId: string | null;
  onlineUsers: Set<string>;
  typingUsers: Set<string>;
  typingAIs: Set<string>;

  // Team Mission
  missions: TeamMission[];
  currentMission: TeamMission | null;
  isLoadingMissions: boolean;
  teamMembers: TopicAIMemberWithTeamRole[];
  isLoadingTeamMembers: boolean;

  // Actions - Topics
  fetchTopics: (options?: { type?: TopicType; search?: string }) => Promise<void>;
  fetchTopic: (topicId: string) => Promise<void>;
  createTopic: (dto: CreateTopicDto) => Promise<Topic>;
  updateTopic: (topicId: string, dto: UpdateTopicDto) => Promise<void>;
  deleteTopic: (topicId: string) => Promise<void>;
  setCurrentTopic: (topic: Topic | null) => void;

  // Actions - Messages
  fetchMessages: (topicId: string, cursor?: string) => Promise<void>;
  sendMessage: (topicId: string, dto: SendMessageDto) => Promise<TopicMessage>;
  deleteMessage: (topicId: string, messageId: string) => Promise<void>;
  addReaction: (
    topicId: string,
    messageId: string,
    emoji: string
  ) => Promise<void>;
  removeReaction: (
    topicId: string,
    messageId: string,
    emoji: string
  ) => Promise<void>;

  // Actions - Members
  addMember: (topicId: string, userId: string, role?: TopicRole) => Promise<void>;
  removeMember: (topicId: string, memberId: string) => Promise<void>;
  leaveTopicAsMember: (topicId: string) => Promise<void>;

  // Actions - AI Members
  addAIMember: (topicId: string, dto: AddAIMemberDto) => Promise<void>;
  updateAIMember: (
    topicId: string,
    aiMemberId: string,
    dto: UpdateAIMemberDto
  ) => Promise<void>;
  removeAIMember: (topicId: string, aiMemberId: string) => Promise<void>;
  generateAIResponse: (
    topicId: string,
    aiMemberId: string
  ) => Promise<TopicMessage>;

  // Actions - Resources
  fetchResources: (topicId: string) => Promise<void>;
  addResource: (topicId: string, dto: AddResourceDto) => Promise<void>;
  removeResource: (topicId: string, resourceId: string) => Promise<void>;

  // Actions - WebSocket
  connectSocket: (userId: string) => void;
  disconnectSocket: () => void;
  joinTopicRoom: (topicId: string) => void;
  leaveTopicRoom: (topicId: string) => void;
  sendTyping: (topicId: string) => void;

  // Actions - Team Mission
  fetchMissions: (
    topicId: string,
    options?: { status?: MissionStatus }
  ) => Promise<void>;
  fetchMission: (topicId: string, missionId: string) => Promise<void>;
  createMission: (
    topicId: string,
    dto: CreateMissionDto
  ) => Promise<TeamMission>;
  cancelMission: (topicId: string, missionId: string) => Promise<void>;
  deleteMission: (topicId: string, missionId: string) => Promise<void>;
  pauseMission: (topicId: string, missionId: string) => Promise<void>;
  resumeMission: (topicId: string, missionId: string) => Promise<void>;
  retryMission: (
    topicId: string,
    missionId: string,
    options?: { mode?: 'full' | 'continue' }
  ) => Promise<void>;
  setCurrentMission: (mission: TeamMission | null) => void;

  // Actions - Team Role
  fetchTeamMembers: (topicId: string) => Promise<void>;
  setTeamLeader: (topicId: string, aiMemberId: string) => Promise<void>;
  updateTeamRole: (
    topicId: string,
    aiMemberId: string,
    dto: UpdateAIMemberTeamRoleDto
  ) => Promise<void>;

  // Actions - UI
  clearMessages: () => void;
  resetStore: () => void;
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const useAiGroupStore = create<AiGroupState>((set, get) => ({
  // Initial state
  topics: [],
  currentTopic: null,
  isLoadingTopics: false,
  messages: [],
  isLoadingMessages: false,
  hasMoreMessages: false,
  nextCursor: null,
  resources: [],
  isLoadingResources: false,
  socket: null,
  isConnected: false,
  currentUserId: null,
  onlineUsers: new Set(),
  typingUsers: new Set(),
  typingAIs: new Set(),
  // Team Mission initial state
  missions: [],
  currentMission: null,
  isLoadingMissions: false,
  teamMembers: [],
  isLoadingTeamMembers: false,

  // ==================== Topics ====================

  fetchTopics: async (options) => {
    set({ isLoadingTopics: true });
    try {
      const topics = await api.getTopics(options);
      set({ topics, isLoadingTopics: false });
    } catch (error) {
      logger.error('Failed to fetch topics:', error);
      set({ isLoadingTopics: false });
    }
  },

  fetchTopic: async (topicId) => {
    try {
      const topic = await api.getTopicById(topicId);
      set({ currentTopic: topic });
      // 更新topics列表中的对应项
      set((state) => ({
        topics: state.topics.map((t) => (t.id === topicId ? topic : t)),
      }));
    } catch (error) {
      logger.error('Failed to fetch topic:', error);
    }
  },

  createTopic: async (dto) => {
    const topic = await api.createTopic(dto);
    set((state) => ({ topics: [topic, ...state.topics] }));
    return topic;
  },

  updateTopic: async (topicId, dto) => {
    const topic = await api.updateTopic(topicId, dto);
    set((state) => ({
      topics: state.topics.map((t) =>
        t.id === topicId ? { ...t, ...topic } : t
      ),
      currentTopic:
        state.currentTopic?.id === topicId
          ? { ...state.currentTopic, ...topic }
          : state.currentTopic,
    }));
  },

  deleteTopic: async (topicId) => {
    await api.deleteTopic(topicId);
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== topicId),
      currentTopic:
        state.currentTopic?.id === topicId ? null : state.currentTopic,
    }));
  },

  setCurrentTopic: (topic) => {
    set({ currentTopic: topic });
  },

  // ==================== Messages ====================

  fetchMessages: async (topicId, cursor) => {
    set({ isLoadingMessages: true });
    try {
      const response = await api.getMessages(topicId, { cursor, limit: 50 });

      // Debug: Log image message content lengths
      response.messages.forEach((m) => {
        if (m.content?.includes('![')) {
          logger.debug('[fetchMessages] Image message found:', {
            messageId: m.id,
            contentLength: m.content.length,
            hasBase64: m.content.includes('data:image'),
            preview: m.content.substring(0, 100),
          });
        }
      });

      set((state) => {
        let newMessages = cursor
          ? [...response.messages, ...state.messages]
          : response.messages;

        // Performance: Limit messages in memory
        if (newMessages.length > MAX_MESSAGES_IN_MEMORY) {
          // Keep the most recent messages (at the end of the array)
          newMessages = newMessages.slice(-MAX_MESSAGES_IN_MEMORY);
          logger.debug(
            `[Messages] Trimmed to ${MAX_MESSAGES_IN_MEMORY} most recent messages`
          );
        }

        return {
          messages: newMessages,
          hasMoreMessages: response.hasMore,
          nextCursor: response.nextCursor,
          isLoadingMessages: false,
        };
      });
    } catch (error) {
      logger.error('Failed to fetch messages:', error);
      set({ isLoadingMessages: false });
    }
  },

  sendMessage: async (topicId, dto) => {
    const message = await api.sendMessage(topicId, dto);
    // WebSocket已实现message:new事件，会自动添加消息到state，不需要手动更新
    // 注释掉手动更新以避免重复消息
    return message;
  },

  deleteMessage: async (topicId, messageId) => {
    await api.deleteMessage(topicId, messageId);
    set((state) => ({
      messages: state.messages.filter((m) => m.id !== messageId),
    }));
  },

  addReaction: async (topicId, messageId, emoji) => {
    await api.addReaction(topicId, messageId, emoji);
    // WebSocket已实现reaction:add事件，会自动更新state，不需要手动更新
  },

  removeReaction: async (topicId, messageId, emoji) => {
    await api.removeReaction(topicId, messageId, emoji);
    // WebSocket已实现reaction:remove事件，会自动更新state，不需要手动更新
  },

  // ==================== Members ====================

  addMember: async (topicId, userIdOrEmail, role) => {
    // Check if input looks like an email
    if (userIdOrEmail.includes('@')) {
      await api.addMemberByEmail(topicId, userIdOrEmail, role);
    } else {
      await api.addMember(topicId, {
        userId: userIdOrEmail,
        role: role,
      });
    }
    await get().fetchTopic(topicId);
  },

  removeMember: async (topicId, memberId) => {
    await api.removeMember(topicId, memberId);
    await get().fetchTopic(topicId);
  },

  leaveTopicAsMember: async (topicId) => {
    await api.leaveTopic(topicId);
    set((state) => ({
      topics: state.topics.filter((t) => t.id !== topicId),
      currentTopic:
        state.currentTopic?.id === topicId ? null : state.currentTopic,
    }));
  },

  // ==================== AI Members ====================

  addAIMember: async (topicId, dto) => {
    await api.addAIMember(topicId, dto);
    await get().fetchTopic(topicId);
  },

  updateAIMember: async (topicId, aiMemberId, dto) => {
    await api.updateAIMember(topicId, aiMemberId, dto);
    await get().fetchTopic(topicId);
  },

  removeAIMember: async (topicId, aiMemberId) => {
    await api.removeAIMember(topicId, aiMemberId);
    await get().fetchTopic(topicId);
  },

  generateAIResponse: async (topicId, aiMemberId) => {
    // Set AI as typing
    set((state) => {
      const newSet = new Set(state.typingAIs);
      newSet.add(aiMemberId);
      return { typingAIs: newSet };
    });

    try {
      const message = await api.generateAIResponse(topicId, aiMemberId);
      // WebSocket未实现，需要手动更新state
      set((state) => ({
        messages: [...state.messages, message],
      }));
      return message;
    } catch (error) {
      // Log the error but don't re-throw to prevent UI disruption
      logger.error('Failed to generate AI response:', error);
      // Return a placeholder message indicating the error
      throw error; // Re-throw for the caller to handle
    } finally {
      // Remove AI from typing
      set((state) => {
        const newSet = new Set(state.typingAIs);
        newSet.delete(aiMemberId);
        return { typingAIs: newSet };
      });
    }
  },

  // ==================== Resources ====================

  fetchResources: async (topicId) => {
    set({ isLoadingResources: true });
    try {
      const resources = await api.getResources(topicId);
      set({ resources, isLoadingResources: false });
    } catch (error) {
      logger.error('Failed to fetch resources:', error);
      set({ isLoadingResources: false });
    }
  },

  addResource: async (topicId, dto) => {
    const resource = await api.addResource(topicId, dto);
    set((state) => ({ resources: [resource, ...state.resources] }));
  },

  removeResource: async (topicId, resourceId) => {
    await api.removeResource(topicId, resourceId);
    set((state) => ({
      resources: state.resources.filter((r) => r.id !== resourceId),
    }));
  },

  // ==================== WebSocket ====================

  connectSocket: (userId) => {
    const { socket } = get();
    if (socket?.connected) return;

    // Store current user ID
    set({ currentUserId: userId });

    const tokens = getAuthTokens();
    const newSocket = io(`${API_URL}/ai-teams`, {
      auth: { userId, token: tokens?.accessToken },
      query: { userId },
      // 代理环境兼容性配置
      transports: ['websocket', 'polling'],
      upgrade: true, // 允许从 polling 升级到 websocket
      rememberUpgrade: true, // 记住升级状态
      // 重连策略
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      randomizationFactor: 0.5,
      // 超时配置
      timeout: 20000,
      // 代理相关配置
      forceNew: false,
      multiplex: true,
    });

    newSocket.on('connect', () => {
      logger.debug('[WS] Connected', {
        socketId: newSocket.id,
        transport: newSocket.io.engine?.transport?.name,
      });
      set({ isConnected: true });
    });

    newSocket.on('disconnect', (reason) => {
      logger.debug('[WS] Disconnected', { reason, socketId: newSocket.id });
      set({
        isConnected: false,
        onlineUsers: new Set(),
        typingUsers: new Set(),
        typingAIs: new Set(),
      });
    });

    newSocket.on('connect_error', (error) => {
      logger.error('[WS] Connection error:', error.message);
      // 如果是代理导致的 WebSocket 连接失败，Socket.IO 会自动降级到 polling
    });

    // 重连事件
    newSocket.io.on('reconnect', (attempt) => {
      logger.debug('[WS] Reconnected', {
        attempts: attempt,
        transport: newSocket.io.engine?.transport?.name,
      });
    });

    newSocket.io.on('reconnect_attempt', (attempt) => {
      logger.debug('[WS] Reconnection attempt', attempt);
    });

    newSocket.io.on('reconnect_error', (error) => {
      logger.error('[WS] Reconnection error:', error.message);
    });

    newSocket.io.on('reconnect_failed', () => {
      logger.error('[WS] Reconnection failed after all attempts');
    });

    // 传输层升级事件（从 polling 升级到 websocket）
    newSocket.io.engine?.on('upgrade', (transport: { name: string }) => {
      logger.debug('[WS] Transport upgraded to:', transport.name);
    });

    // 新消息
    newSocket.on('message:new', (message: TopicMessage) => {
      logger.debug('[WS] Received message:new event:', {
        messageId: message.id,
        topicId: message.topicId,
        senderId: message.senderId,
        aiMemberId: message.aiMemberId,
        contentLength: message.content?.length || 0,
        contentPreview: message.content?.substring(0, 100),
        hasImageMarkdown: message.content?.includes('!['),
        socketId: newSocket.id,
      });
      set((state) => {
        // 防止重复添加消息
        if (state.messages.some((m) => m.id === message.id)) {
          logger.debug('[WS] Message already exists, skipping:', message.id);
          return state;
        }
        logger.debug('[WS] Adding new message to state:', message.id);

        // Performance: Trim old messages if exceeding limit
        let newMessages = [...state.messages, message];
        if (newMessages.length > MAX_MESSAGES_IN_MEMORY) {
          const trimCount = newMessages.length - MAX_MESSAGES_IN_MEMORY;
          logger.debug(
            `[WS] Trimming ${trimCount} old messages to stay within ${MAX_MESSAGES_IN_MEMORY} limit`
          );
          newMessages = newMessages.slice(trimCount);
        }

        return {
          messages: newMessages,
        };
      });
    });

    // 消息删除
    newSocket.on('message:delete', ({ messageId }: { messageId: string }) => {
      set((state) => ({
        messages: state.messages.filter((m) => m.id !== messageId),
      }));
    });

    // 成员上线
    newSocket.on(
      'member:online',
      ({ userId: onlineUserId }: { userId: string }) => {
        set((state) => {
          const newSet = new Set(state.onlineUsers);
          newSet.add(onlineUserId);
          return { onlineUsers: newSet };
        });
      }
    );

    // 成员下线
    newSocket.on(
      'member:offline',
      ({ userId: offlineUserId }: { userId: string }) => {
        set((state) => {
          const newSet = new Set(state.onlineUsers);
          newSet.delete(offlineUserId);
          return { onlineUsers: newSet };
        });
      }
    );

    // 成员正在输入
    newSocket.on(
      'member:typing',
      ({ userId: typingUserId }: { userId: string }) => {
        set((state) => {
          const newSet = new Set(state.typingUsers);
          newSet.add(typingUserId);
          return { typingUsers: newSet };
        });
        // 3秒后自动移除
        setTimeout(() => {
          set((state) => {
            const newSet = new Set(state.typingUsers);
            newSet.delete(typingUserId);
            return { typingUsers: newSet };
          });
        }, 3000);
      }
    );

    // AI正在输入
    newSocket.on('ai:typing', ({ aiMemberId }: { aiMemberId: string }) => {
      set((state) => {
        const newSet = new Set(state.typingAIs);
        newSet.add(aiMemberId);
        return { typingAIs: newSet };
      });
    });

    // AI响应完成（只清除typing状态，消息通过message:new事件添加）
    newSocket.on(
      'ai:response',
      ({ aiMemberId }: { aiMemberId: string; messageId: string }) => {
        set((state) => {
          const newSet = new Set(state.typingAIs);
          newSet.delete(aiMemberId);
          return { typingAIs: newSet };
        });
      }
    );

    // AI错误
    newSocket.on(
      'ai:error',
      ({ aiMemberId, error }: { aiMemberId: string; error: string }) => {
        logger.error(`AI ${aiMemberId} error:`, error);
        set((state) => {
          const newSet = new Set(state.typingAIs);
          newSet.delete(aiMemberId);
          return { typingAIs: newSet };
        });
      }
    );

    // 反应添加
    newSocket.on(
      'reaction:add',
      ({
        messageId,
        userId: reactionUserId,
        emoji,
      }: {
        messageId: string;
        userId: string;
        emoji: string;
      }) => {
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id === messageId) {
              const reactions = m.reactions || [];
              const existingReaction = reactions.find(
                (r) => r.userId === reactionUserId && r.emoji === emoji
              );
              if (!existingReaction) {
                return {
                  ...m,
                  reactions: [
                    ...reactions,
                    {
                      id: '',
                      messageId,
                      userId: reactionUserId,
                      emoji,
                      createdAt: new Date().toISOString(),
                    },
                  ],
                };
              }
            }
            return m;
          }),
        }));
      }
    );

    // 反应移除
    newSocket.on(
      'reaction:remove',
      ({
        messageId,
        userId: removeUserId,
        emoji,
      }: {
        messageId: string;
        userId: string;
        emoji: string;
      }) => {
        set((state) => ({
          messages: state.messages.map((m) => {
            if (m.id === messageId) {
              return {
                ...m,
                reactions: (m.reactions || []).filter(
                  (r) => !(r.userId === removeUserId && r.emoji === emoji)
                ),
              };
            }
            return m;
          }),
        }));
      }
    );

    // ==================== Team Mission Events ====================

    // Helper function for updating mission state
    const updateMissionState = (
      missionId: string,
      updates: Partial<TeamMission>
    ) => {
      set((state) => ({
        missions: state.missions.map((m) =>
          m.id === missionId ? { ...m, ...updates } : m
        ),
        currentMission:
          state.currentMission?.id === missionId
            ? { ...state.currentMission, ...updates }
            : state.currentMission,
      }));
    };

    // 任务创建事件
    newSocket.on(
      'mission:created',
      ({ mission }: { mission: TeamMission; messageId?: string }) => {
        logger.debug('[WS] Mission created:', mission.id);
        set((state) => ({
          missions: [
            mission,
            ...state.missions.filter((m) => m.id !== mission.id),
          ],
        }));
      }
    );

    // 任务状态变更 (后端使用 mission:status_changed)
    newSocket.on(
      'mission:status_changed',
      ({
        missionId,
        status,
        previousStatus,
        totalTasks,
        tasks,
      }: {
        missionId: string;
        status: MissionStatus;
        previousStatus: MissionStatus;
        totalTasks?: number;
        tasks?: Array<{
          id: string;
          title: string;
          description: string;
          status: string;
          priority: string;
          taskType: string;
          assignedToId: string;
          dependsOnIds: string[];
        }>;
      }) => {
        logger.debug('[WS] Mission status changed:', {
          missionId,
          status,
          previousStatus,
          totalTasks,
          tasksCount: tasks?.length,
        });
        updateMissionState(missionId, {
          status,
          ...(totalTasks !== undefined && { totalTasks }),
          // ★ 更新 tasks 数据用于 Canvas 渲染连线
          // WebSocket 发送的 tasks 是简化版本，需要转换为 Partial<AgentTask>[]
          ...(tasks && { tasks: tasks as unknown as AgentTask[] }),
        });
      }
    );

    // 任务进度更新 (后端使用 mission:progress_updated)
    newSocket.on(
      'mission:progress_updated',
      ({
        missionId,
        completedTasks,
        totalTasks,
        progressPercent,
      }: {
        missionId: string;
        completedTasks: number;
        totalTasks: number;
        progressPercent: number;
      }) => {
        logger.debug('[WS] Mission progress updated:', {
          missionId,
          completedTasks,
          totalTasks,
          progressPercent,
        });
        updateMissionState(missionId, {
          completedTasks,
          totalTasks,
          progressPercent,
        });
      }
    );

    // 任务状态更新 (保留旧事件名兼容)
    newSocket.on(
      'mission:status',
      ({
        missionId,
        status,
        progressPercent,
        completedTasks,
        totalTasks,
      }: {
        missionId: string;
        status: MissionStatus;
        progressPercent: number;
        completedTasks: number;
        totalTasks: number;
      }) => {
        logger.debug('[WS] Mission status update:', {
          missionId,
          status,
          progressPercent,
        });
        updateMissionState(missionId, {
          status,
          progressPercent,
          completedTasks,
          totalTasks,
        });
      }
    );

    // 子任务完成 (后端使用 task:completed)
    newSocket.on(
      'task:completed',
      ({
        missionId,
        taskId,
        agentId,
      }: {
        missionId: string;
        taskId: string;
        agentId: string;
      }) => {
        logger.debug('[WS] Task completed:', { missionId, taskId, agentId });
        set((state) => {
          const updateTasks = (tasks?: AgentTask[]) =>
            tasks?.map((t) =>
              t.id === taskId
                ? { ...t, status: 'AWAITING_REVIEW' as AgentTaskStatus }
                : t
            );

          // 同时清除该Agent的typing状态 (备份机制)
          const newTypingAIs = new Set(state.typingAIs);
          newTypingAIs.delete(agentId);

          return {
            missions: state.missions.map((m) =>
              m.id === missionId ? { ...m, tasks: updateTasks(m.tasks) } : m
            ),
            currentMission:
              state.currentMission?.id === missionId
                ? {
                    ...state.currentMission,
                    tasks: updateTasks(state.currentMission.tasks),
                  }
                : state.currentMission,
            typingAIs: newTypingAIs,
          };
        });
      }
    );

    // 子任务状态更新 (保留旧事件名兼容)
    newSocket.on(
      'task:status',
      ({
        missionId,
        taskId,
        status,
        result,
        leaderFeedback,
      }: {
        missionId: string;
        taskId: string;
        status: AgentTaskStatus;
        result?: string;
        leaderFeedback?: string;
      }) => {
        logger.debug('[WS] Task status update:', { missionId, taskId, status });
        set((state) => {
          const updateTasks = (tasks?: AgentTask[]) =>
            tasks?.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    status,
                    result: result ?? t.result,
                    leaderFeedback: leaderFeedback ?? t.leaderFeedback,
                  }
                : t
            );

          return {
            missions: state.missions.map((m) =>
              m.id === missionId ? { ...m, tasks: updateTasks(m.tasks) } : m
            ),
            currentMission:
              state.currentMission?.id === missionId
                ? {
                    ...state.currentMission,
                    tasks: updateTasks(state.currentMission.tasks),
                  }
                : state.currentMission,
          };
        });
      }
    );

    // Agent工作中 (Mission 协作场景)
    newSocket.on(
      'mission:agent_working',
      ({
        missionId,
        agentId,
        taskId,
        agentName,
        status,
      }: {
        missionId: string;
        agentId: string;
        taskId: string | null;
        agentName?: string;
        status?: string; // planning, started, reviewing
      }) => {
        logger.debug('[WS] Mission agent working:', {
          missionId,
          agentId,
          taskId,
          agentName,
          status,
        });
        set((state) => {
          const newSet = new Set(state.typingAIs);
          newSet.add(agentId);
          return { typingAIs: newSet };
        });
      }
    );

    // Agent完成工作 (Mission 协作场景)
    newSocket.on(
      'mission:agent_done',
      ({
        missionId,
        agentId,
        taskId,
      }: {
        missionId: string;
        agentId: string;
        taskId: string | null;
      }) => {
        logger.debug('[WS] Mission agent done:', {
          missionId,
          agentId,
          taskId,
        });
        set((state) => {
          const newSet = new Set(state.typingAIs);
          newSet.delete(agentId);
          return { typingAIs: newSet };
        });
      }
    );

    // 任务完成
    newSocket.on(
      'mission:completed',
      ({
        missionId,
        finalResult,
        summary,
        participantAIIds,
      }: {
        missionId: string;
        finalResult: string;
        summary: string;
        participantAIIds?: string[];
      }) => {
        logger.debug('[WS] Mission completed:', {
          missionId,
          participantAIIds,
        });
        set((state) => {
          // 【关键修复】Mission 完成时，清除所有相关 AI 的 typing 状态
          // 优先使用后端传递的 participantAIIds，否则从本地 mission 中提取
          const participantAIs = new Set<string>(participantAIIds || []);

          // 如果后端没有传递，则从本地 mission 中提取（兼容旧版本）
          if (participantAIs.size === 0) {
            const mission = state.missions.find((m) => m.id === missionId);
            if (mission?.tasks) {
              mission.tasks.forEach((task) => {
                if (task.assignedToId) {
                  participantAIs.add(task.assignedToId);
                }
              });
            }
          }

          // 从 typingAIs 中移除所有参与者
          const newTypingAIs = new Set(state.typingAIs);
          participantAIs.forEach((aiId) => newTypingAIs.delete(aiId));

          return {
            typingAIs: newTypingAIs,
            missions: state.missions.map((m) =>
              m.id === missionId
                ? {
                    ...m,
                    status: 'COMPLETED' as MissionStatus,
                    finalResult,
                    summary,
                    completedAt: new Date().toISOString(),
                  }
                : m
            ),
            currentMission:
              state.currentMission?.id === missionId
                ? {
                    ...state.currentMission,
                    status: 'COMPLETED' as MissionStatus,
                    finalResult,
                    summary,
                    completedAt: new Date().toISOString(),
                  }
                : state.currentMission,
          };
        });
      }
    );

    // 任务失败
    newSocket.on(
      'mission:failed',
      ({ missionId, error }: { missionId: string; error: string }) => {
        logger.error('[WS] Mission failed:', { missionId, error });
        set((state) => {
          // 【关键修复】Mission 失败时，也要清除所有相关 AI 的 typing 状态
          const mission = state.missions.find((m) => m.id === missionId);
          const participantAIs = new Set<string>();
          if (mission?.tasks) {
            mission.tasks.forEach((task) => {
              if (task.assignedToId) {
                participantAIs.add(task.assignedToId);
              }
            });
          }
          const newTypingAIs = new Set(state.typingAIs);
          participantAIs.forEach((aiId) => newTypingAIs.delete(aiId));

          return {
            typingAIs: newTypingAIs,
            missions: state.missions.map((m) =>
              m.id === missionId
                ? { ...m, status: 'FAILED' as MissionStatus }
                : m
            ),
            currentMission:
              state.currentMission?.id === missionId
                ? { ...state.currentMission, status: 'FAILED' as MissionStatus }
                : state.currentMission,
          };
        });
      }
    );

    set({ socket: newSocket });
  },

  disconnectSocket: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
      set({
        socket: null,
        isConnected: false,
        currentUserId: null,
        onlineUsers: new Set(),
      });
    }
  },

  joinTopicRoom: (topicId) => {
    const { socket } = get();
    logger.debug(
      `[WS] joinTopicRoom called for topic ${topicId}, socket connected: ${socket?.connected}, socket id: ${socket?.id}`
    );
    if (socket?.connected) {
      socket.emit(
        'topic:join',
        { topicId },
        (response: {
          success?: boolean;
          onlineUsers?: string[];
          error?: string;
        }) => {
          logger.debug(`[WS] topic:join response for ${topicId}:`, response);
          if (response.success && response.onlineUsers) {
            // 设置在线用户列表（后端已经包含当前用户）
            set({ onlineUsers: new Set(response.onlineUsers) });
            logger.debug(
              '[WS] Joined topic room, online users:',
              response.onlineUsers
            );
          } else if (response.error) {
            logger.error('[WS] Failed to join topic room:', response.error);
          }
        }
      );
    } else {
      // 如果 socket 还没连接，等待连接后再加入
      logger.debug('[WS] Socket not connected, waiting...');
      const checkAndJoin = () => {
        const { socket: currentSocket } = get();
        logger.debug(
          `[WS] Retry join: socket connected: ${currentSocket?.connected}, socket id: ${currentSocket?.id}`
        );
        if (currentSocket?.connected) {
          currentSocket.emit(
            'topic:join',
            { topicId },
            (response: {
              success?: boolean;
              onlineUsers?: string[];
              error?: string;
            }) => {
              logger.debug(
                `[WS] topic:join response (delayed) for ${topicId}:`,
                response
              );
              if (response.success && response.onlineUsers) {
                set({ onlineUsers: new Set(response.onlineUsers) });
                logger.debug(
                  '[WS] Joined topic room (delayed), online users:',
                  response.onlineUsers
                );
              }
            }
          );
        } else {
          setTimeout(checkAndJoin, 500);
        }
      };
      setTimeout(checkAndJoin, 500);
    }
  },

  leaveTopicRoom: (topicId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('topic:leave', { topicId });
    }
  },

  sendTyping: (topicId) => {
    const { socket } = get();
    if (socket?.connected) {
      socket.emit('message:typing', { topicId });
    }
  },

  // ==================== Team Mission ====================

  fetchMissions: async (topicId, options) => {
    // Only show loading spinner on initial load (when no data exists)
    // This prevents blank flashing during refresh/polling
    const currentMissions = get().missions;
    if (!currentMissions || currentMissions.length === 0) {
      set({ isLoadingMissions: true });
    }
    try {
      const response = await api.getMissions(topicId, options);
      // Backend returns array directly, not { missions: [...] }
      // Handle both cases for safety
      const missions = Array.isArray(response)
        ? response
        : response?.missions || [];
      set({ missions, isLoadingMissions: false });
    } catch (error) {
      logger.error('Failed to fetch missions:', error);
      // On error during refresh, keep existing data instead of clearing
      if (!currentMissions || currentMissions.length === 0) {
        set({ missions: [], isLoadingMissions: false });
      } else {
        set({ isLoadingMissions: false });
      }
    }
  },

  fetchMission: async (topicId, missionId) => {
    try {
      const mission = await api.getMissionById(topicId, missionId);
      set({ currentMission: mission });
      // 更新missions列表中的对应项
      set((state) => ({
        missions: state.missions.map((m) => (m.id === missionId ? mission : m)),
      }));
    } catch (error) {
      logger.error('Failed to fetch mission:', error);
    }
  },

  createMission: async (topicId, dto) => {
    const mission = await api.createMission(topicId, dto);
    set((state) => ({
      missions: [mission, ...state.missions],
      currentMission: mission,
    }));
    return mission;
  },

  cancelMission: async (topicId, missionId) => {
    const mission = await api.cancelMission(topicId, missionId);
    set((state) => ({
      missions: state.missions.map((m) => (m.id === missionId ? mission : m)),
      currentMission:
        state.currentMission?.id === missionId ? mission : state.currentMission,
    }));
  },

  deleteMission: async (topicId, missionId) => {
    await api.deleteMission(topicId, missionId);
    // 从列表中移除已删除的任务
    set((state) => ({
      missions: state.missions.filter((m) => m.id !== missionId),
      currentMission:
        state.currentMission?.id === missionId ? null : state.currentMission,
    }));
  },

  pauseMission: async (topicId, missionId) => {
    await api.pauseMission(topicId, missionId);
    // 刷新任务列表以获取最新状态
    const response = await api.getMissions(topicId);
    const missions = response.missions || [];
    const pausedMission = missions.find((m: TeamMission) => m.id === missionId);
    set((state) => ({
      missions,
      currentMission:
        state.currentMission?.id === missionId
          ? pausedMission || state.currentMission
          : state.currentMission,
    }));
  },

  resumeMission: async (topicId, missionId) => {
    await api.resumeMission(topicId, missionId);
    // 刷新任务列表以获取最新状态
    const response = await api.getMissions(topicId);
    const missions = response.missions || [];
    const resumedMission = missions.find(
      (m: TeamMission) => m.id === missionId
    );
    set((state) => ({
      missions,
      currentMission:
        state.currentMission?.id === missionId
          ? resumedMission || state.currentMission
          : state.currentMission,
    }));
  },

  retryMission: async (topicId, missionId, options) => {
    await api.retryMission(topicId, missionId, options);
    // 刷新任务列表以获取最新状态
    const response = await api.getMissions(topicId);
    const missions = response.missions || [];
    const retriedMission = missions.find(
      (m: TeamMission) => m.id === missionId
    );
    set((state) => ({
      missions,
      currentMission:
        state.currentMission?.id === missionId
          ? retriedMission || state.currentMission
          : state.currentMission,
    }));
  },

  setCurrentMission: (mission) => {
    set({ currentMission: mission });
  },

  // ==================== Team Role ====================

  fetchTeamMembers: async (topicId) => {
    set({ isLoadingTeamMembers: true });
    try {
      const response = await api.getTeamMembers(topicId);
      // API returns { leader, members, all } - we need the 'all' array
      const teamMembers = response?.all || [];
      set({ teamMembers, isLoadingTeamMembers: false });
    } catch (error) {
      logger.error('Failed to fetch team members:', error);
      set({ teamMembers: [], isLoadingTeamMembers: false });
    }
  },

  setTeamLeader: async (topicId, aiMemberId) => {
    await api.setTeamLeader(topicId, aiMemberId);
    // 刷新团队成员列表
    await get().fetchTeamMembers(topicId);
    // 刷新Topic以更新aiMembers
    await get().fetchTopic(topicId);
  },

  updateTeamRole: async (topicId, aiMemberId, dto) => {
    await api.updateTeamRole(topicId, aiMemberId, dto);
    // 刷新团队成员列表
    await get().fetchTeamMembers(topicId);
    // 刷新Topic以更新aiMembers
    await get().fetchTopic(topicId);
  },

  // ==================== UI ====================

  clearMessages: () => {
    set({ messages: [], hasMoreMessages: false, nextCursor: null });
  },

  resetStore: () => {
    const { socket } = get();
    if (socket) {
      socket.disconnect();
    }
    set({
      topics: [],
      currentTopic: null,
      isLoadingTopics: false,
      messages: [],
      isLoadingMessages: false,
      hasMoreMessages: false,
      nextCursor: null,
      resources: [],
      isLoadingResources: false,
      socket: null,
      isConnected: false,
      onlineUsers: new Set(),
      typingUsers: new Set(),
      typingAIs: new Set(),
      // Team Mission reset
      missions: [],
      currentMission: null,
      isLoadingMissions: false,
      teamMembers: [],
      isLoadingTeamMembers: false,
    });
  },
}));
