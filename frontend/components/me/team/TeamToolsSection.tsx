'use client';

import { useMemo, useState } from 'react';
import { FlaskConical, KeyRound, SendHorizonal } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { StatusBadge } from '@/components/ui/badges';
import { useUserTools, type UserToolItem } from '@/hooks/features/useUserTools';
import { useUserSecrets } from '@/hooks/features/useUserSecrets';
import {
  ConfigureKeyModal,
  RequestGrantModal,
} from '@/components/me/tools/tool-key-modals';
import {
  TeamResourceSection,
  type TeamResourceCard,
} from './TeamResourceSection';

const BTN = {
  test: 'inline-flex items-center gap-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50',
  ghost:
    'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-gray-500 hover:bg-gray-100',
  primary:
    'inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100',
  soft: 'inline-flex items-center gap-1 rounded-md bg-gray-50 px-2 py-1 text-[11px] font-medium text-gray-600 hover:bg-gray-100',
};

/**
 * 团队工具 —— 接真实后端（/user/tools）的工具库，按分类分组的卡片呈现。
 * 卡片上带 BYOK 操作：测试 / 使用我的 Key / 配置 Key / 申请授权（语义同原 UserToolsTab）。
 */
export function TeamToolsSection() {
  const { t } = useTranslation();
  const { tools, loading, error, refresh } = useUserTools();
  const { secrets, testSecret, testingId } = useUserSecrets();
  const [configureTarget, setConfigureTarget] = useState<UserToolItem | null>(
    null
  );
  const [requestTarget, setRequestTarget] = useState<UserToolItem | null>(null);

  const secretIdByName = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of secrets) map.set(s.name, s.id);
    return map;
  }, [secrets]);

  const cards: TeamResourceCard[] = useMemo(
    () =>
      tools.map((tl) => {
        const sid = secretIdByName.get(tl.secretName);
        return {
          id: tl.toolId,
          name: tl.name,
          category: tl.category,
          meta: (
            <StatusBadge
              tone={tl.source === 'none' ? 'warning' : 'success'}
              label={
                tl.source === 'user'
                  ? t('me.tools.status.configured')
                  : tl.source === 'granted'
                    ? t('me.tools.status.grantedSystem')
                    : tl.source === 'platform'
                      ? t('me.tools.status.systemAvailable')
                      : t('me.tools.status.notConfigured')
              }
            />
          ),
          usage: (
            <code className="font-mono text-[11px] text-gray-400">
              {tl.toolId}
            </code>
          ),
          actions:
            tl.source === 'user' ? (
              <>
                {sid && (
                  <button
                    onClick={() => void testSecret('secret', sid)}
                    disabled={testingId === sid}
                    className={BTN.test}
                  >
                    <FlaskConical className="h-3 w-3" />
                    {testingId === sid
                      ? t('me.apiKeys.testing')
                      : t('me.apiKeys.test')}
                  </button>
                )}
                <button
                  onClick={() => setConfigureTarget(tl)}
                  className={BTN.ghost}
                >
                  <KeyRound className="h-3 w-3" />
                  {t('me.tools.action.useMyKey')}
                </button>
              </>
            ) : tl.usable ? (
              <button
                onClick={() => setConfigureTarget(tl)}
                className={BTN.ghost}
              >
                <KeyRound className="h-3 w-3" />
                {t('me.tools.action.useMyKey')}
              </button>
            ) : (
              <>
                <button
                  onClick={() => setConfigureTarget(tl)}
                  className={BTN.primary}
                >
                  <KeyRound className="h-3 w-3" />
                  {t('me.tools.action.configureKey')}
                </button>
                {!tl.systemConfigured && (
                  <button
                    onClick={() => setRequestTarget(tl)}
                    className={BTN.soft}
                  >
                    <SendHorizonal className="h-3 w-3" />
                    {t('me.tools.action.requestGrant')}
                  </button>
                )}
              </>
            ),
        };
      }),
    [tools, secretIdByName, testSecret, testingId, t]
  );

  return (
    <>
      <TeamResourceSection
        kind="tool"
        cards={cards}
        loading={loading}
        error={error}
        onRetry={refresh}
        unitLabel="个工具"
        marketLabel="工具市场"
        hint="获取更多工具。"
        emptyTitle="还没有可用工具"
        emptyDesc="去工具市场获取团队可用的工具"
      />
      {configureTarget && (
        <ConfigureKeyModal
          tool={configureTarget}
          userSecrets={secrets}
          onClose={() => setConfigureTarget(null)}
          onSuccess={refresh}
        />
      )}
      {requestTarget && (
        <RequestGrantModal
          tool={requestTarget}
          onClose={() => setRequestTarget(null)}
          onSuccess={refresh}
        />
      )}
    </>
  );
}

export default TeamToolsSection;
