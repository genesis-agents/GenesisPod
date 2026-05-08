/**
 * AI Ask Room - REST 客户端
 *
 * 后端路径前缀：/api/v1/ask/rooms
 * 持久化复用：会话列表 / 详情仍走 /api/v1/ask/sessions（设计文档 §8.0）
 */

import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import type {
  AskRoomMember,
  AskRoomMemberRole,
  AskRoomMemberType,
  AskRoomMode,
  AskRoomSession,
  AskRoomTurn,
} from '@/types/ask-room';

interface CreateRoomInput {
  title?: string;
  fromSessionId?: string;
  roomConfig?: {
    defaultMode?: AskRoomMode;
    leaderModelId?: string;
    maxParticipants?: number;
    debateRounds?: number;
  };
  initialMembers?: AddMemberInput[];
}

interface AddMemberInput {
  memberType: AskRoomMemberType;
  agentId?: string;
  modelId: string;
  displayName: string;
  role?: AskRoomMemberRole;
  systemPrompt?: string;
  persona?: Record<string, unknown>;
  order?: number;
  enabled?: boolean;
}

interface UpdateMemberInput {
  displayName?: string;
  role?: AskRoomMemberRole;
  systemPrompt?: string;
  persona?: Record<string, unknown>;
  order?: number;
  enabled?: boolean;
}

interface SendRoomMessageInput {
  content: string;
  mode?: AskRoomMode;
  mentionedMemberIds?: string[];
  knowledgeBaseIds?: string[];
  enableTools?: boolean;
  modeOptions?: Record<string, unknown>;
}

interface RoomDetail {
  session: AskRoomSession;
  members: AskRoomMember[];
  recentTurns: AskRoomTurn[];
}

async function jsonRequest<T>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const url = config.getApiPath(path);
  const res = await fetch(url, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeader(),
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const askRoomService = {
  createRoom(input: CreateRoomInput): Promise<AskRoomSession> {
    return jsonRequest<AskRoomSession>('/ask/rooms', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getRoom(id: string): Promise<RoomDetail> {
    return jsonRequest<RoomDetail>(`/ask/rooms/${id}`);
  },

  updateRoom(
    id: string,
    input: { roomConfig?: CreateRoomInput['roomConfig'] }
  ): Promise<AskRoomSession> {
    return jsonRequest<AskRoomSession>(`/ask/rooms/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(input),
    });
  },

  addMember(roomId: string, input: AddMemberInput): Promise<AskRoomMember> {
    return jsonRequest<AskRoomMember>(`/ask/rooms/${roomId}/members`, {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateMember(
    roomId: string,
    memberId: string,
    input: UpdateMemberInput
  ): Promise<AskRoomMember> {
    return jsonRequest<AskRoomMember>(
      `/ask/rooms/${roomId}/members/${memberId}`,
      {
        method: 'PATCH',
        body: JSON.stringify(input),
      }
    );
  },

  removeMember(roomId: string, memberId: string): Promise<{ ok: boolean }> {
    return jsonRequest<{ ok: boolean }>(
      `/ask/rooms/${roomId}/members/${memberId}`,
      { method: 'DELETE' }
    );
  },

  sendMessage(
    roomId: string,
    input: SendRoomMessageInput
  ): Promise<{ turnId: string; userMessageId: string }> {
    return jsonRequest<{ turnId: string; userMessageId: string }>(
      `/ask/rooms/${roomId}/messages`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      }
    );
  },

  cancelTurn(roomId: string, turnId: string): Promise<{ ok: boolean }> {
    return jsonRequest<{ ok: boolean }>(
      `/ask/rooms/${roomId}/turns/${turnId}/cancel`,
      { method: 'POST' }
    );
  },
};
