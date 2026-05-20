'use client';

/**
 * LaunchMissionModal (R-CA 2026-05-05 风险#4 清零)
 *
 * 在 /custom-agents/:id 主页 inline 弹窗输入 topic + 启动 mission，
 * 不再跳到独立的 /run 页（消除"主页 ↔ 启动页"两次跳转的体验割裂）。
 *
 * 提交后立即调 launchCustomAgentMission（一站式 endpoint：translate + 启动 + 写 launch 行），
 * 关闭 Modal 后 onLaunched 回调让主页 reload mission 列表，新 mission 卡片直接出现。
 */
import { useEffect, useRef, useState } from 'react';
import { Loader2, Play } from 'lucide-react';
import { launchCustomAgentMission } from '@/services/custom-agents/api';
import { Modal } from '@/components/ui/dialogs/Modal';
import type { CustomAgentRecord } from './types';

export function LaunchMissionModal({
  agent,
  open,
  onClose,
  onLaunched,
}: {
  agent: CustomAgentRecord;
  open: boolean;
  onClose: () => void;
  /** 启动成功后回调（主页用来 reload mission 列表）*/
  onLaunched: (missionId: string) => void;
}) {
  const [topic, setTopic] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTopic('');
      setError(null);
      // 等 modal 渲染完再聚焦
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const submit = async () => {
    if (topic.trim().length < 2) {
      setError('topic 至少 2 个字符');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const launched = await launchCustomAgentMission(agent.id, {
        topic: topic.trim(),
      });
      onLaunched(launched.missionId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败');
    } finally {
      setSubmitting(false);
    }
  };

  const goal = agent.config?.topicSchema?.goalTemplate;

  return (
    <Modal
      open={open}
      onClose={() => !submitting && onClose()}
      title="启动新 Mission"
      subtitle={`用「${agent.displayName}」做一次研究`}
      size="sm"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            disabled={submitting}
            className="rounded border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            取消
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={submitting || topic.trim().length < 2}
            className="inline-flex items-center gap-2 rounded bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-1.5 text-sm font-medium text-white shadow-md shadow-rose-500/25 transition-all hover:shadow-lg disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            {submitting ? '启动中…' : '启动 Mission'}
          </button>
        </div>
      }
    >
      <label className="mb-1 block text-sm font-medium text-gray-700">
        研究主题
      </label>
      <input
        ref={inputRef}
        value={topic}
        onChange={(e) => setTopic(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !submitting) void submit();
        }}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20"
        placeholder="例如：2026 中国新能源车出海机会分析"
        disabled={submitting}
      />
      {goal && (
        <p className="mt-1 text-xs text-gray-500">
          启动时 topic 自动拼接为：「
          {topic.trim() || '{你的主题}'}（聚焦：{goal}）」
        </p>
      )}

      {error && (
        <div className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}
    </Modal>
  );
}
