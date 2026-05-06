'use client';

/**
 * usePublishedCustomAgents (R-CA 2026-05-05)
 *
 * 给 Sidebar 拉当前用户的 PUBLISHED custom agents（动态菜单）。
 *
 * 行为：
 * - mount 时调一次 /user/custom-agents 拉全量；本地 filter status === 'PUBLISHED'
 * - 监听 'custom-agent:published' 全局事件做被动刷新（向导 publish 成功后 dispatch
 *   一次，无需用户刷新页面就能看到新菜单）
 * - 静默失败（侧栏功能性入口，无须红 banner）
 */
import { useEffect, useState } from 'react';
import { apiClient } from '@/lib/api/client';
import type { CustomAgentRecord } from './types';

// ★ 2026-05-05 R-CA bug #3/#4 防御：sidebar 不仅监听 published，也监听 update/archive/delete
//   让 displayName 改名 / unpublish / archive / delete 后 sidebar 立刻刷新
const REFRESH_EVENT = 'custom-agent:changed';
/** @deprecated 保留旧 published event 名以防外部调用，内部统一发 'custom-agent:changed' */
const LEGACY_PUBLISHED_EVENT = 'custom-agent:published';

export function usePublishedCustomAgents(): {
  items: CustomAgentRecord[];
  loading: boolean;
  refresh: () => void;
} {
  const [items, setItems] = useState<CustomAgentRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await apiClient.get<CustomAgentRecord[]>(
          '/user/custom-agents'
        );
        if (cancelled) return;
        setItems(
          (Array.isArray(data) ? data : []).filter(
            (it) => it.status === 'PUBLISHED' && it.isEnabled !== false
          )
        );
      } catch {
        if (cancelled) return;
        setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    const onRefresh = () => void load();
    if (typeof window !== 'undefined') {
      window.addEventListener(REFRESH_EVENT, onRefresh);
      // legacy 兼容：旧代码可能仍 dispatch 'custom-agent:published'
      window.addEventListener(LEGACY_PUBLISHED_EVENT, onRefresh);
    }
    return () => {
      cancelled = true;
      if (typeof window !== 'undefined') {
        window.removeEventListener(REFRESH_EVENT, onRefresh);
        window.removeEventListener(LEGACY_PUBLISHED_EVENT, onRefresh);
      }
    };
  }, []);

  return {
    items,
    loading,
    refresh: () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
      }
    },
  };
}

/** 通用通知 Sidebar 刷新 —— 任何 agent 写操作（publish / unpublish / archive / update / delete）后调一次 */
export function notifyCustomAgentChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(REFRESH_EVENT));
  }
}

/** @deprecated 用 notifyCustomAgentChanged 代替（统一覆盖 publish/update/delete 等）*/
export function notifyCustomAgentPublished(): void {
  notifyCustomAgentChanged();
}
