'use client';

/**
 * BrokenResourcesCard — 无效资源（AI 探索里失效的 URL）一键清理
 *
 * 挂在 /admin/data-management 页面，给管理员清理健康检查标记的
 * linkHealth='BROKEN' 资源。YouTube 视频已删除、外链 404 等情况。
 *
 * 逻辑：
 * - 点击"清理"弹 ConfirmDialog
 * - 后端 POST /resources/cleanup/broken：
 *   * 无 notes/comments 的 BROKEN → 物理删除
 *   * 有 notes/comments 的 BROKEN → 保守改 ARCHIVED（保留用户数据）
 * - Toast 显示删除/归档数
 */

import { useCallback, useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { toast } from '@/stores';
import { ConfirmDialog } from '@/components/ui/dialogs/ConfirmDialog';
import ResponsiveCard, {
  ResponsiveCardContent,
  ResponsiveCardHeader,
  ResponsiveCardTitle,
} from '@/components/ui/primitives/ResponsiveCard';

export default function BrokenResourcesCard() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [lastResult, setLastResult] = useState<{
    deleted: number;
    archived: number;
  } | null>(null);

  const runCleanup = useCallback(async () => {
    setConfirmOpen(false);
    setRunning(true);
    try {
      const res = await fetch(`${config.apiUrl}/resources/cleanup/broken`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as
        | { deleted: number; archived: number }
        | { data?: { deleted: number; archived: number } };
      const result =
        (raw as { data?: { deleted: number; archived: number } }).data ??
        (raw as { deleted: number; archived: number });
      setLastResult(result);
      toast.success(
        '清理完成',
        `删除 ${result.deleted} 条，归档 ${result.archived} 条（有用户笔记/评论的保留）`
      );
    } catch (e) {
      toast.error('清理失败', (e as Error).message);
    } finally {
      setRunning(false);
    }
  }, []);

  return (
    <>
      <ResponsiveCard>
        <ResponsiveCardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <ResponsiveCardTitle>无效资源清理</ResponsiveCardTitle>
            </div>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            清理 AI 探索里健康检查标记为 BROKEN 的资源（YouTube 视频已删 / 外链
            404 / 私有视频等）。有笔记或评论的资源会保守改为 ARCHIVED
            保留用户数据。
          </p>
        </ResponsiveCardHeader>
        <ResponsiveCardContent>
          <div className="flex items-center justify-between gap-4">
            <div className="text-xs text-gray-500">
              {lastResult ? (
                <span>
                  上次清理：删除{' '}
                  <span className="font-medium text-red-600">
                    {lastResult.deleted}
                  </span>
                  ，归档{' '}
                  <span className="font-medium text-amber-600">
                    {lastResult.archived}
                  </span>
                </span>
              ) : (
                <span>
                  健康检查每 6 小时自动扫描一次，手动触发立刻清理已标记的 BROKEN
                </span>
              )}
            </div>
            <button
              onClick={() => setConfirmOpen(true)}
              disabled={running}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {running ? '清理中...' : '立即清理'}
            </button>
          </div>
        </ResponsiveCardContent>
      </ResponsiveCard>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={runCleanup}
        title="确认清理无效资源？"
        description="无笔记/评论的 BROKEN 资源将被物理删除，有用户数据的改为 ARCHIVED 保留。此操作不可撤销。"
        type="warning"
        confirmText="确认清理"
        loading={running}
      />
    </>
  );
}
