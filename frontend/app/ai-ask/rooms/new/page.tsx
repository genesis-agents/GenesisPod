'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, ArrowLeft } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { askRoomService } from '@/services/ai-ask-room.service';
import type { AskRoomMode } from '@/types/ask-room';

interface DraftMember {
  displayName: string;
  modelId: string;
  role: 'LEADER' | 'MEMBER';
  systemPrompt: string;
}

const DEFAULT_MODES: { value: AskRoomMode; label: string }[] = [
  { value: 'FREECHAT', label: '自由群聊（推荐）' },
  { value: 'PARALLEL_MERGE', label: '并行合并' },
  { value: 'DEBATE', label: '辩论' },
  { value: 'VOTE', label: '投票' },
  { value: 'REVIEW', label: '评审' },
  { value: 'HANDOFF', label: '交接' },
];

export default function NewAskRoomPage() {
  const router = useRouter();
  const [title, setTitle] = useState('AI 团队房间');
  const [defaultMode, setDefaultMode] = useState<AskRoomMode>('FREECHAT');
  const [members, setMembers] = useState<DraftMember[]>([
    { displayName: 'Leader', modelId: '', role: 'LEADER', systemPrompt: '' },
    { displayName: 'Alice', modelId: '', role: 'MEMBER', systemPrompt: '' },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateMember = (idx: number, patch: Partial<DraftMember>) => {
    setMembers((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, ...patch } : m))
    );
  };

  const addMember = () => {
    if (members.length >= 8) return;
    setMembers((prev) => [
      ...prev,
      {
        displayName: `Member ${prev.length + 1}`,
        modelId: '',
        role: 'MEMBER',
        systemPrompt: '',
      },
    ]);
  };

  const removeMember = (idx: number) => {
    setMembers((prev) => prev.filter((_, i) => i !== idx));
  };

  const submit = async () => {
    setError(null);
    if (members.length < 2) {
      setError('至少需要 2 个 AI 成员');
      return;
    }
    if (members.some((m) => !m.displayName.trim() || !m.modelId.trim())) {
      setError('每个成员的 显示名 + 模型 ID 必填');
      return;
    }
    setSubmitting(true);
    try {
      const created = await askRoomService.createRoom({
        title: title.trim() || 'AI 团队房间',
        roomConfig: { defaultMode, maxParticipants: 8 },
        initialMembers: members.map((m, i) => ({
          memberType: 'VIRTUAL',
          modelId: m.modelId.trim(),
          displayName: m.displayName.trim(),
          role: m.role,
          systemPrompt: m.systemPrompt.trim() || undefined,
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

  return (
    <AppShell>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <button
          type="button"
          onClick={() => router.push('/ai-ask')}
          className="mb-4 flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
        >
          <ArrowLeft size={16} />
          返回
        </button>

        <h1 className="mb-1 text-2xl font-semibold">新建 AI 团队房间</h1>
        <p className="mb-6 text-sm text-gray-500">
          多个 AI 成员一起群聊；支持自由群聊、并行合并、辩论、投票、评审、交接 6
          种模式。
        </p>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">房间名</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          />
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">默认协作模式</label>
          <select
            value={defaultMode}
            onChange={(e) => setDefaultMode(e.target.value as AskRoomMode)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-800"
          >
            {DEFAULT_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="mb-1 block text-sm font-medium">
            AI 成员（{members.length} / 8）
          </label>
          <div className="space-y-2">
            {members.map((m, i) => (
              <div
                key={i}
                className="grid grid-cols-12 gap-2 rounded border border-gray-200 p-2 dark:border-gray-700"
              >
                <input
                  className="col-span-3 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                  placeholder="显示名"
                  value={m.displayName}
                  onChange={(e) =>
                    updateMember(i, { displayName: e.target.value })
                  }
                />
                <input
                  className="col-span-3 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                  placeholder="模型 ID"
                  value={m.modelId}
                  onChange={(e) => updateMember(i, { modelId: e.target.value })}
                />
                <select
                  className="col-span-2 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                  value={m.role}
                  onChange={(e) =>
                    updateMember(i, {
                      role: e.target.value as 'LEADER' | 'MEMBER',
                    })
                  }
                >
                  <option value="MEMBER">成员</option>
                  <option value="LEADER">主持</option>
                </select>
                <input
                  className="col-span-3 rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
                  placeholder="System Prompt（可选）"
                  value={m.systemPrompt}
                  onChange={(e) =>
                    updateMember(i, { systemPrompt: e.target.value })
                  }
                />
                <button
                  type="button"
                  onClick={() => removeMember(i)}
                  className="col-span-1 rounded text-xs text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
                >
                  删除
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addMember}
            disabled={members.length >= 8}
            className="mt-2 flex items-center gap-1 rounded border border-dashed border-gray-300 px-3 py-1 text-sm text-gray-500 hover:bg-gray-50 disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <Plus size={12} />
            添加成员
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-900/20 dark:text-red-300">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={submitting}
          className="rounded bg-blue-500 px-6 py-2 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
        >
          {submitting ? '创建中...' : '创建房间'}
        </button>
      </div>
    </AppShell>
  );
}
