/**
 * AI Ask SSE 流式客户端（2026-05-10 §4 god-class 拆分）
 *
 * 职责：消费 backend POST /ask/sessions/:id/messages/stream 的 SSE 帧，
 * 通过 onChunk 回调把累积内容回传调用方实现打字机效果，最终返回与旧
 * sendMessage JSON endpoint 兼容的 result shape（含 userMessage /
 * assistantMessage / ragSources）。
 *
 * 从 app/ai-ask/page.tsx 拆出，原文件已是 god-class（>2800 行），
 * pre-push 红线对单次净增 >50 行硬拒，故新增 SSE 逻辑必须独立放置。
 */

import { logger } from '@/lib/utils/logger';
import { config } from '@/lib/utils/config';

export interface AskRagSource {
  documentTitle: string;
  excerpt: string;
  score: number;
}

export interface AskStreamRequestBody {
  content: string;
  modelId?: string;
  webSearch: boolean;
  knowledgeBaseIds?: string[];
}

export interface AskStreamResult {
  userMessage: {
    id: string;
    content: string;
    createdAt: string;
    modelId?: string;
    modelName?: string;
  };
  assistantMessage: {
    id: string;
    content: string;
    createdAt: string;
    modelId?: string;
    modelName?: string;
    tokens: number;
  };
  ragSources?: AskRagSource[];
  /**
   * suggestedActions 链路 2026-04-30 后端已删（ai-ask.service.ts 注释明示），
   * 字段保留为 undefined 仅为兼容旧调用站签名。
   */
  suggestedActions?: Array<{ type: string; label: string; data?: unknown }>;
}

export type AskOnChunk = (
  accumulated: string,
  sources?: AskRagSource[]
) => void;

interface SseEventBase {
  type: string;
}

interface SourcesEvent extends SseEventBase {
  type: 'sources';
  sources: AskRagSource[];
}

interface ChunkEvent extends SseEventBase {
  type: 'chunk';
  content: string;
}

interface DoneEvent extends SseEventBase {
  type: 'done';
  userMessageId: string;
  assistantMessageId: string;
  tokensUsed: number;
  fullContent?: string;
}

interface ErrorEvent extends SseEventBase {
  type: 'error';
  message: string;
}

type SseEvent =
  | { type: 'status'; stage: 'rag' | 'generating' }
  | SourcesEvent
  | ChunkEvent
  | DoneEvent
  | ErrorEvent;

/**
 * 发起 SSE 流式发送消息。
 *
 * 失败语义：
 * - 非 2xx 或 body 缺失 → 返回 null（caller 应清理临时消息）
 * - 流中 type='error' event → 返回 null
 * - 网络层抛错 → 返回 null（错误已 logger.error）
 */
export async function streamAskMessage(
  sessionId: string,
  token: string,
  body: AskStreamRequestBody,
  onChunk?: AskOnChunk
): Promise<AskStreamResult | null> {
  try {
    const response = await fetch(
      `${config.apiUrl}/ask/sessions/${sessionId}/messages/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok || !response.body) {
      const errorData = await response.json().catch(() => ({}));
      logger.error('[AiAsk] Failed to start stream:', {
        status: response.status,
        error: errorData,
      });
      return null;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulatedContent = '';
    let ragSources: AskRagSource[] | undefined;
    let userMessageId: string | null = null;
    let assistantMessageId: string | null = null;
    let tokensUsed = 0;
    let errorMsg: string | null = null;

    const handleEvent = (event: SseEvent): void => {
      if (event.type === 'sources') {
        ragSources = event.sources;
      } else if (event.type === 'chunk') {
        accumulatedContent += event.content;
        onChunk?.(accumulatedContent, ragSources);
      } else if (event.type === 'done') {
        userMessageId = event.userMessageId;
        assistantMessageId = event.assistantMessageId;
        tokensUsed = event.tokensUsed;
        if (event.fullContent) accumulatedContent = event.fullContent;
      } else if (event.type === 'error') {
        errorMsg = event.message;
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';
      for (const raw of events) {
        const line = raw.trim();
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (!payload) continue;
        try {
          handleEvent(JSON.parse(payload) as SseEvent);
        } catch (parseErr) {
          logger.warn('[AiAsk] Failed to parse SSE event:', parseErr);
        }
      }
    }

    if (errorMsg) {
      logger.error('[AiAsk] Stream error:', errorMsg);
      return null;
    }

    return {
      userMessage: {
        id: userMessageId ?? 'temp-user',
        content: body.content,
        createdAt: new Date().toISOString(),
        modelId: body.modelId,
        modelName: undefined,
      },
      assistantMessage: {
        id: assistantMessageId ?? 'temp-assistant',
        content: accumulatedContent,
        createdAt: new Date().toISOString(),
        modelId: body.modelId,
        modelName: undefined,
        tokens: tokensUsed,
      },
      ragSources,
      suggestedActions: undefined,
    };
  } catch (error) {
    logger.error('[AiAsk] streamAskMessage failed:', error);
    return null;
  }
}
