'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Step 6 — 复核与发布
 *
 * 显示完整 config JSON 预览 + publish 按钮。
 * publish 失败时（后端 BadRequest with issues[]）逐项展示。
 */
import { useState } from 'react';
import { CheckCircle, AlertCircle } from 'lucide-react';
import { apiClient } from '@/lib/api/client';
import type { CustomAgentConfig } from './types';
import { notifyCustomAgentPublished } from './usePublishedCustomAgents';

interface PublishIssue {
  step: string;
  field: string;
  message: string;
}

export function ReviewStep({
  config,
  agentId,
  status,
  onPublished,
}: {
  config: CustomAgentConfig;
  agentId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  onPublished: () => void;
}) {
  const [submitting, setSubmitting] = useState(false);
  const [issues, setIssues] = useState<PublishIssue[]>([]);
  const [error, setError] = useState<string | null>(null);

  const publish = async () => {
    setSubmitting(true);
    setError(null);
    setIssues([]);
    try {
      await apiClient.post(`/user/custom-agents/${agentId}/publish`);
      // ★ R-CA: 通知 Sidebar 立即重新拉 published agents 列表
      notifyCustomAgentPublished();
      onPublished();
    } catch (e) {
      // ★ 2026-05-05 修：apiClient 抛 ApiError { message, code, status, details }，
      //   不是 axios 风格 err.response.data。details 里才是后端原始 errorData
      //   （含 issues 数组）。原代码取 err.response.data.issues 永远 undefined，
      //   issues 数组被吞，UI 只剩泛泛 message → 用户看不到具体缺啥。
      const err = e as {
        message?: string;
        details?: { issues?: PublishIssue[]; message?: string };
      };
      const detailIssues = Array.isArray(err?.details?.issues)
        ? err.details.issues
        : undefined;
      if (detailIssues && detailIssues.length > 0) {
        setIssues(detailIssues);
      } else {
        setError(
          err?.details?.message ?? err?.message ?? '发布失败（未知原因）'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="mb-1 block text-sm font-medium">配置 JSON 预览</label>
        <pre className="max-h-[420px] overflow-auto rounded border border-gray-200 bg-gray-50 p-3 text-xs">
          {JSON.stringify(config, null, 2)}
        </pre>
      </div>

      {issues.length > 0 && (
        <div className="rounded border border-red-200 bg-red-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-red-700">
            <AlertCircle className="h-4 w-4" /> 配置不完整（{issues.length} 项）
          </div>
          <ul className="space-y-1 text-xs text-red-700">
            {issues.map((i, idx) => (
              <li key={idx}>
                · <code>{i.field}</code> — {i.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-gray-200 pt-4">
        <div className="text-sm text-gray-600">
          当前状态：
          <span
            className={`ml-2 rounded px-2 py-0.5 text-xs ${
              status === 'PUBLISHED'
                ? 'bg-green-100 text-green-700'
                : 'bg-gray-100 text-gray-700'
            }`}
          >
            {status}
          </span>
        </div>
        <button
          onClick={publish}
          disabled={submitting || status === 'PUBLISHED'}
          className="inline-flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:opacity-50"
        >
          <CheckCircle className="h-4 w-4" />
          {status === 'PUBLISHED'
            ? '已发布'
            : submitting
              ? '发布中...'
              : '发布'}
        </button>
      </div>
    </div>
  );
}
