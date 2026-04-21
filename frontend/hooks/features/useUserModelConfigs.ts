'use client';

import { useCallback, useState } from 'react';
import { useApiGet } from '@/hooks/core';
import { apiClient } from '@/lib/api/client';
import { toast } from '@/stores';

export type UserModelType =
  | 'CHAT'
  | 'CHAT_FAST'
  | 'CODE'
  | 'MULTIMODAL'
  | 'IMAGE_GENERATION'
  | 'IMAGE_EDITING'
  | 'EMBEDDING'
  | 'RERANK'
  | 'EVALUATOR';

export interface UserModelConfig {
  id: string;
  userId: string;
  provider: string;
  modelId: string;
  displayName: string;
  modelType: UserModelType;
  apiEndpoint: string | null;
  maxTokens: number;
  temperature: number;
  embeddingDimensions: number | null;
  maxInputTokens: number | null;
  isReasoning: boolean;
  apiFormat: string;
  supportsTemperature: boolean;
  supportsStreaming: boolean;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  tokenParamName: string;
  defaultTimeoutMs: number;
  priceInputPerMillion: number | null;
  priceOutputPerMillion: number | null;
  priority: number;
  isEnabled: boolean;
  isDefault: boolean;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export type CreateUserModelConfigInput = Omit<
  UserModelConfig,
  'id' | 'userId' | 'createdAt' | 'updatedAt'
> &
  Partial<Pick<UserModelConfig, 'maxTokens' | 'temperature'>>;

export type UpdateUserModelConfigInput = Partial<CreateUserModelConfigInput>;

export function useUserModelConfigs(provider?: string) {
  const qs = provider ? `?provider=${encodeURIComponent(provider)}` : '';
  const {
    data,
    loading,
    error,
    execute: refresh,
  } = useApiGet<{
    items: UserModelConfig[];
  }>(`/user/model-configs${qs}`, {
    immediate: true,
    deps: [provider],
  });

  const [mutating, setMutating] = useState(false);

  const create = useCallback(
    async (
      input: CreateUserModelConfigInput
    ): Promise<UserModelConfig | null> => {
      setMutating(true);
      try {
        const created = await apiClient.post<UserModelConfig>(
          '/user/model-configs',
          input
        );
        await refresh();
        toast.success('模型已添加');
        return created;
      } catch (e) {
        toast.error((e as Error).message || '创建失败');
        return null;
      } finally {
        setMutating(false);
      }
    },
    [refresh]
  );

  const update = useCallback(
    async (id: string, patch: UpdateUserModelConfigInput): Promise<boolean> => {
      setMutating(true);
      try {
        await apiClient.patch(`/user/model-configs/${id}`, patch);
        await refresh();
        toast.success('已更新');
        return true;
      } catch (e) {
        toast.error((e as Error).message || '更新失败');
        return false;
      } finally {
        setMutating(false);
      }
    },
    [refresh]
  );

  const remove = useCallback(
    async (id: string): Promise<boolean> => {
      setMutating(true);
      try {
        await apiClient.delete(`/user/model-configs/${id}`);
        await refresh();
        toast.success('已删除');
        return true;
      } catch (e) {
        toast.error((e as Error).message || '删除失败');
        return false;
      } finally {
        setMutating(false);
      }
    },
    [refresh]
  );

  const setDefault = useCallback(
    async (id: string): Promise<boolean> => {
      setMutating(true);
      try {
        await apiClient.post(`/user/model-configs/${id}/set-default`, {});
        await refresh();
        toast.success('已设为该类型默认');
        return true;
      } catch (e) {
        toast.error((e as Error).message || '设置失败');
        return false;
      } finally {
        setMutating(false);
      }
    },
    [refresh]
  );

  return {
    items: data?.items ?? [],
    loading,
    error,
    mutating,
    refresh,
    create,
    update,
    remove,
    setDefault,
  };
}

export const USER_MODEL_TYPE_OPTIONS: Array<{
  value: UserModelType;
  label: string;
  description: string;
}> = [
  {
    value: 'CHAT',
    label: '标准聊天',
    description: 'GPT-4, Claude, Gemini Pro 等 - 用于复杂对话和深度分析',
  },
  {
    value: 'CHAT_FAST',
    label: '快速聊天',
    description: 'GPT-4o-mini, Claude Haiku 等 - 分类/翻译/摘要等低成本任务',
  },
  {
    value: 'CODE',
    label: '代码生成',
    description: 'Claude Sonnet, GPT-4o 等 - 代码生成和分析',
  },
  {
    value: 'MULTIMODAL',
    label: '多模态',
    description: '同时支持文本和图片输入',
  },
  {
    value: 'IMAGE_GENERATION',
    label: '图片生成',
    description: 'DALL-E 3, Imagen 等',
  },
  { value: 'IMAGE_EDITING', label: '图片编辑', description: '' },
  {
    value: 'EMBEDDING',
    label: '向量嵌入',
    description: 'text-embedding-3-* - 知识库向量化',
  },
  { value: 'RERANK', label: '重排序', description: 'Cohere rerank' },
  { value: 'EVALUATOR', label: '报告评审', description: '评分/评审专用' },
];
