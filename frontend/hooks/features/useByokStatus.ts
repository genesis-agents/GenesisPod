'use client';

import { useCallback, useEffect, useState } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';

export interface ByokStatus {
  configured: boolean;
  activeProviders: string[];
  hasModelConfig: boolean;
}

/**
 * 新手三步引导阶段（从 status 推导，无需后端新字段）：
 *   needs_key   — 还没配 API Key
 *   needs_model — 配了 Key 但没有可用模型（多为 auto-configure 探测失败；此前 banner
 *                 在配 key 后就消失，用户卡在这步无引导 → App 跑不起来）
 *   ready       — 有可用模型，可以开始用
 */
export type ByokStage = 'needs_key' | 'needs_model' | 'ready';

export function deriveByokStage(status: ByokStatus | null): ByokStage | null {
  if (!status) return null;
  if (!status.configured) return 'needs_key';
  if (!status.hasModelConfig) return 'needs_model';
  return 'ready';
}

// 用于跨组件通知"key 配置完成，请重新拉 status"
export const BYOK_REFRESH_EVENT = 'byok-status-refresh';

/** 发广播：任何保存 key 成功的地方都该调一次，让 banner 自动消失 */
export function broadcastByokStatusRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(BYOK_REFRESH_EVENT));
}

const DISMISS_KEY = 'byok-onboarding-dismissed-at';
const DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000; // dismiss 后 30 天不再提示

/**
 * 全站共享的 BYOK 状态查询 hook。
 *
 * 返回：
 * - status: { configured, activeProviders, hasModelConfig, firstTime } | null
 * - loading
 * - error
 * - shouldShowBanner: boolean — 结合 dismiss 记录算出要不要显示引导 banner
 * - dismissBanner(): void — 用户主动关掉 banner，写 localStorage 30 天生效
 * - refresh(): void — 手动重拉
 *
 * 缓存策略：组件挂载时 fetch 一次，配好 key 后调用 refresh() 让状态立刻更新。
 */
export function useByokStatus() {
  const [status, setStatus] = useState<ByokStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dismissedAt, setDismissedAt] = useState<number | null>(null);

  // 初始读 dismiss 时间（SSR 不可用 localStorage，放 useEffect）
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (raw) {
      const ts = parseInt(raw, 10);
      if (!Number.isNaN(ts)) setDismissedAt(ts);
    }
  }, []);

  const fetchStatus = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${config.apiUrl}/user/api-keys/status`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = (await res.json()) as
        | ByokStatus
        | { success?: boolean; data?: ByokStatus };
      const payload =
        (raw as { data?: ByokStatus }).data ?? (raw as ByokStatus);
      setStatus(payload);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchStatus();
  }, [fetchStatus]);

  // 监听全局"配好 key 了"事件 → 自动 refresh banner 状态
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => void fetchStatus();
    window.addEventListener(BYOK_REFRESH_EVENT, handler);
    return () => window.removeEventListener(BYOK_REFRESH_EVENT, handler);
  }, [fetchStatus]);

  const dismissBanner = useCallback(() => {
    if (typeof window === 'undefined') return;
    const now = Date.now();
    window.localStorage.setItem(DISMISS_KEY, String(now));
    setDismissedAt(now);
  }, []);

  const stage = deriveByokStage(status);

  // 显示 banner 条件：已加载完 + 尚未就绪（缺 key 或缺模型）+ 未在 30 天 dismiss 窗口内。
  // ★ 2026-06-16：从「仅未配 key」扩到「未就绪」，覆盖「配了 key 但没模型」这步
  //   （此前 banner 在配 key 后消失，新用户卡在无模型态没人引导）。
  const shouldShowBanner =
    !loading &&
    stage !== null &&
    stage !== 'ready' &&
    (dismissedAt === null || Date.now() - dismissedAt > DISMISS_TTL_MS);

  return {
    status,
    stage,
    loading,
    error,
    shouldShowBanner,
    dismissBanner,
    refresh: fetchStatus,
  };
}
