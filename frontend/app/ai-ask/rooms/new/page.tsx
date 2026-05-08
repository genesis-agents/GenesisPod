'use client';

/**
 * 新建 AI 团队房间
 *
 * 设计取向（参考 /ai-insights CreateTopicDialog 风格）：
 *   - 字段最小化：房间名 + 协作模式 + 勾选 AI 成员
 *   - 不让用户手填 model ID / system prompt（创建后再到房间里调）
 *   - 房主（当前用户）默认隐式存在 = AskSession.userId；UI 上展示一行"你"作为说明，不可勾选
 *   - 模型类型只列 CHAT / CHAT_FAST / CODE / MULTIMODAL（IMAGE_* 不能群聊）
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Check, Loader2, Users } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { useAIModels, type AIModel } from '@/hooks/features/useAIModels';
import { askRoomService } from '@/services/ai-ask-room.service';
import type { AskRoomMode } from '@/types/ask-room';

const MODE_OPTIONS: {
  value: AskRoomMode;
  label: string;
  description: string;
}[] = [
  {
    value: 'FREECHAT',
    label: '自由群聊',
    description: '推荐 / 多 AI 自由发言',
  },
  {
    value: 'PARALLEL_MERGE',
    label: '并行合并',
    description: '同时回答 → 汇总',
  },
  { value: 'DEBATE', label: '辩论', description: '正反方多轮辩论' },
  { value: 'VOTE', label: '投票', description: '各自投票 + 计票' },
  { value: 'REVIEW', label: '评审', description: '主稿 + 多审稿人' },
  { value: 'HANDOFF', label: '交接', description: '依次交接接力' },
];

// 群聊场景能用的模型类型——图片生成 / 编辑不在列
const CHAT_LIKE_TYPES: AIModel['modelType'][] = [
  'CHAT',
  'CHAT_FAST',
  'CODE',
  'MULTIMODAL',
];

export default function NewAskRoomPage() {
  const router = useRouter();
  const { user } = useAuth();
  const { models, loading: modelsLoading } = useAIModels();

  const [title, setTitle] = useState('AI 团队房间');
  const [defaultMode, setDefaultMode] = useState<AskRoomMode>('FREECHAT');
  const [selectedModelIds, setSelectedModelIds] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chatLikeModels = useMemo(
    () => models.filter((m) => CHAT_LIKE_TYPES.includes(m.modelType)),
    [models]
  );

  // 默认勾选前 2 个（如有）
  useEffect(() => {
    if (selectedModelIds.length === 0 && chatLikeModels.length > 0) {
      setSelectedModelIds(chatLikeModels.slice(0, 2).map((m) => m.id));
    }
  }, [chatLikeModels, selectedModelIds.length]);

  const toggleModel = (id: string) => {
    setSelectedModelIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 8) return prev; // 后端 max 8
      return [...prev, id];
    });
  };

  const handleCreate = async () => {
    setError(null);
    if (selectedModelIds.length < 2) {
      setError('至少勾选 2 个 AI 成员');
      return;
    }
    const picked = chatLikeModels.filter((m) =>
      selectedModelIds.includes(m.id)
    );
    if (picked.length < 2) {
      setError('选中的模型已下线，请重新勾选');
      return;
    }

    setSubmitting(true);
    try {
      const created = await askRoomService.createRoom({
        title: title.trim() || 'AI 团队房间',
        roomConfig: { defaultMode, maxParticipants: 8 },
        initialMembers: picked.map((m, i) => ({
          memberType: 'VIRTUAL',
          modelId: m.modelId,
          displayName: m.name,
          role: i === 0 ? 'LEADER' : 'MEMBER', // 第一个是主持，其余成员
          order: i,
        })),
      });
      router.push(`/ai-ask/rooms/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const userLabel =
    user?.fullName?.trim() || user?.username?.trim() || user?.email || '我';

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          type="button"
          onClick={() => router.push('/ai-ask')}
          className="mb-4 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft size={16} />
          返回
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            新建 AI 团队房间
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            勾选若干 AI 成员组成一个群聊房间；你作为主持人参与对话。
          </p>
        </div>

        {/* 房间名 */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700">
            房间名
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="给房间起个名字"
            className="mt-1 w-full rounded-lg border border-gray-300 bg-white px-4 py-2 text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>

        {/* 协作模式 */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            协作模式
          </label>
          <div className="grid grid-cols-3 gap-1.5">
            {MODE_OPTIONS.map((opt) => {
              const active = defaultMode === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setDefaultMode(opt.value)}
                  className={`rounded-lg border px-3 py-2 text-left transition-all ${
                    active
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div
                    className={`text-sm font-medium ${active ? 'text-blue-700' : 'text-gray-800'}`}
                  >
                    {opt.label}
                  </div>
                  <div
                    className={`mt-0.5 text-[11px] ${active ? 'text-blue-500' : 'text-gray-400'}`}
                  >
                    {opt.description}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 成员 */}
        <div className="mb-4">
          <label className="mb-1.5 block text-sm font-medium text-gray-700">
            成员
            <span className="ml-2 text-xs font-normal text-gray-400">
              你 + AI {selectedModelIds.length} 个（最多 8 个 AI）
            </span>
          </label>

          {/* 你 — 房主，固定不可移除 */}
          <div className="mb-2 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-500 text-white">
              <Users className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-blue-900">
                你（{userLabel}）
              </div>
              <div className="text-xs text-blue-600">
                房主 / 主持人，发消息触发 AI 协作
              </div>
            </div>
          </div>

          {/* AI 成员勾选列表 */}
          {modelsLoading ? (
            <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 py-8">
              <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
            </div>
          ) : chatLikeModels.length === 0 ? (
            <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 p-3 text-sm text-amber-700">
              暂无可用模型。先到「我的模型」配置 API Key，或向管理员申请系统
              Key。
            </div>
          ) : (
            <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-lg border border-gray-200 bg-white p-2">
              {chatLikeModels.map((m) => {
                const checked = selectedModelIds.includes(m.id);
                const reachedMax = !checked && selectedModelIds.length >= 8;
                return (
                  <label
                    key={m.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                      checked
                        ? 'border-blue-500 bg-blue-50'
                        : reachedMax
                          ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-60'
                          : 'border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded ${
                        checked
                          ? 'bg-blue-500 text-white'
                          : 'border border-gray-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="h-3 w-3" />}
                    </span>
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={checked}
                      disabled={reachedMax}
                      onChange={() => toggleModel(m.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-gray-900">
                          {m.name}
                        </span>
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] uppercase text-gray-500">
                          {m.modelType}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-gray-500">
                        {m.provider} / {m.modelId}
                      </div>
                    </div>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
          <button
            type="button"
            onClick={() => router.push('/ai-ask')}
            className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={submitting || selectedModelIds.length < 2}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting ? '创建中...' : '创建房间'}
          </button>
        </div>
      </div>
    </AppShell>
  );
}
