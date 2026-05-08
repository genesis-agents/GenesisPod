'use client';

import { useState } from 'react';
import { Plus, Trash2, Crown, X } from 'lucide-react';
import type {
  AskRoomMember,
  AskRoomMemberRole,
  AskRoomMemberType,
} from '@/types/ask-room';

interface RoomMemberPanelProps {
  members: AskRoomMember[];
  onAdd: (input: {
    memberType: AskRoomMemberType;
    agentId?: string;
    modelId: string;
    displayName: string;
    role: AskRoomMemberRole;
    systemPrompt?: string;
  }) => Promise<void>;
  onRemove: (memberId: string) => Promise<void>;
  onClose: () => void;
}

export function RoomMemberPanel({
  members,
  onAdd,
  onRemove,
  onClose,
}: RoomMemberPanelProps) {
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    displayName: '',
    modelId: '',
    role: 'MEMBER' as AskRoomMemberRole,
    systemPrompt: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const enabled = members.filter((m) => !m.deletedAt);

  const submit = async () => {
    setError(null);
    if (!form.displayName.trim() || !form.modelId.trim()) {
      setError('显示名和模型必填');
      return;
    }
    setSubmitting(true);
    try {
      await onAdd({
        memberType: 'VIRTUAL',
        modelId: form.modelId.trim(),
        displayName: form.displayName.trim(),
        role: form.role,
        systemPrompt: form.systemPrompt.trim() || undefined,
      });
      setForm({
        displayName: '',
        modelId: '',
        role: 'MEMBER',
        systemPrompt: '',
      });
      setAdding(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-y-0 right-0 z-30 w-full max-w-sm border-l border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <h2 className="text-base font-medium">
          房间成员（{enabled.length}/8）
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          <X size={18} />
        </button>
      </div>

      <div className="max-h-[calc(100vh-60px)] overflow-y-auto p-4">
        <ul className="space-y-2">
          {enabled.map((m) => (
            <li
              key={m.id}
              className="flex items-center gap-2 rounded border border-gray-200 px-2 py-2 dark:border-gray-700"
            >
              <div className="flex-1">
                <div className="flex items-center gap-1 text-sm font-medium">
                  {m.role === 'LEADER' && (
                    <Crown size={12} className="text-amber-500" />
                  )}
                  {m.displayName}
                </div>
                <div className="text-xs text-gray-500">
                  {m.modelId} · {m.memberType}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onRemove(m.id)}
                className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/30"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>

        {!adding ? (
          <button
            type="button"
            onClick={() => setAdding(true)}
            disabled={enabled.length >= 8}
            className="mt-3 flex w-full items-center justify-center gap-1 rounded border border-dashed border-gray-300 py-2 text-sm text-gray-500 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-gray-600 dark:hover:bg-gray-800"
          >
            <Plus size={14} />
            添加 AI 成员
          </button>
        ) : (
          <div className="mt-3 space-y-2 rounded border border-gray-200 p-3 dark:border-gray-700">
            <input
              type="text"
              placeholder="显示名（如 Alice）"
              value={form.displayName}
              onChange={(e) =>
                setForm((f) => ({ ...f, displayName: e.target.value }))
              }
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
            <input
              type="text"
              placeholder="模型 ID（与后端 AIModel 一致）"
              value={form.modelId}
              onChange={(e) =>
                setForm((f) => ({ ...f, modelId: e.target.value }))
              }
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
            <select
              value={form.role}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  role: e.target.value as AskRoomMemberRole,
                }))
              }
              className="w-full rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            >
              <option value="MEMBER">成员</option>
              <option value="LEADER">主持人 (Leader)</option>
            </select>
            <textarea
              placeholder="System Prompt（可选）"
              value={form.systemPrompt}
              onChange={(e) =>
                setForm((f) => ({ ...f, systemPrompt: e.target.value }))
              }
              rows={3}
              className="w-full resize-none rounded border border-gray-300 px-2 py-1 text-sm dark:border-gray-600 dark:bg-gray-800"
            />
            {error && <div className="text-xs text-red-500">{error}</div>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="flex-1 rounded bg-blue-500 py-1 text-sm text-white hover:bg-blue-600 disabled:opacity-50"
              >
                {submitting ? '添加中...' : '确认'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAdding(false);
                  setError(null);
                }}
                className="rounded border border-gray-300 px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
