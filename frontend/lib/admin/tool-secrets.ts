'use client';

/**
 * Tool drawer secret suggestion hook —— APIServicesTable / BuiltinToolsTable
 * 共享真源，避免双源（feedback_no_dual_sources）。
 *
 * 行为：
 *  1) 拉 GET /admin/secrets/names 仅 INTEGRATION + OTHER（屏蔽 AI_MODEL /
 *     SYSTEM / USER_DONATED——这些不该在工具抽屉里出现）
 *  2) 按 name 含 toolId token 优先排，剩下按字母序
 *  3) 失败静默——返回空数组让 admin 手输
 */
import { useEffect, useState } from 'react';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { logger } from '@/lib/utils/logger';

function unwrapNames(raw: unknown): string[] {
  if (!raw || typeof raw !== 'object') return [];
  const r = raw as { data?: unknown };
  const arr = Array.isArray(r.data)
    ? r.data
    : Array.isArray(raw)
      ? (raw as unknown[])
      : [];
  return arr.filter((n): n is string => typeof n === 'string');
}

function sortBySimilarity(names: string[], toolId: string): string[] {
  const tokens = toolId
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter((t) => t.length >= 3);
  const score = (n: string): number => {
    const lc = n.toLowerCase();
    let s = 0;
    for (const t of tokens) if (lc.includes(t)) s += 10;
    return s;
  };
  return [...names].sort((a, b) => {
    const diff = score(b) - score(a);
    if (diff !== 0) return diff;
    return a.localeCompare(b);
  });
}

/**
 * Returns Secret Manager name suggestions filtered to tool-relevant categories
 * and sorted with toolId-similar names first. Re-fetches when toolId changes.
 */
export function useToolSecretSuggestions(toolId: string | undefined): string[] {
  const [names, setNames] = useState<string[]>([]);

  useEffect(() => {
    if (!toolId) {
      setNames([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const [integ, other] = await Promise.all([
          fetch(`${config.apiUrl}/admin/secrets/names?category=INTEGRATION`, {
            headers: getAuthHeader(),
          }).then((r) => (r.ok ? r.json() : null)),
          fetch(`${config.apiUrl}/admin/secrets/names?category=OTHER`, {
            headers: getAuthHeader(),
          }).then((r) => (r.ok ? r.json() : null)),
        ]);
        const merged = Array.from(
          new Set([...unwrapNames(integ), ...unwrapNames(other)])
        );
        if (!cancelled) setNames(sortBySimilarity(merged, toolId));
      } catch (e) {
        logger.error('[useToolSecretSuggestions] load failed', e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toolId]);

  return names;
}
