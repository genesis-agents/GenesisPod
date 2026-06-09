'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Crown,
  Cpu,
  Settings2,
  Trash2,
  Send,
  Store,
  Pencil,
  Check,
  X,
} from 'lucide-react';
import { PageHeaderHero } from '@/components/ui/page-header-hero';
import { EmptyState } from '@/components/ui/states';
import { Modal, ConfirmDialog } from '@/components/ui/dialogs';
import { Button } from '@/components/ui/primitives/button';
import { cn } from '@/lib/utils/common';
import { AVATAR_GRADIENTS } from '@/lib/design/tokens';
import { useCompanyStore, type Hero } from '@/stores/company/companyStore';
import { useAIModels } from '@/hooks/features/useAIModels';
import { findListing } from '@/components/marketplace/marketplace.catalog';

const CONTROL_CLS =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

/** 按 id 哈希取头像渐变（与 store 一致的纯装饰着色）。 */
function gradientForId(id: string): string {
  let h = 5381;
  for (let i = 0; i < id.length; i++) h = ((h << 5) + h + id.charCodeAt(i)) | 0;
  return AVATAR_GRADIENTS[Math.abs(h) % AVATAR_GRADIENTS.length];
}

/** 从市场 catalog 解析 capability 的展示信息（标题 + 阶段 chips）。 */
function resolveCapability(capabilityId: string): {
  title?: string;
  stages: string[];
} {
  const listing = findListing(capabilityId);
  if (!listing) return { stages: [] };
  // workflow / team listing 带 stages；其余 listing 无此字段
  const stages =
    'stages' in listing && Array.isArray(listing.stages) ? listing.stages : [];
  return { title: listing.name, stages };
}

/**
 * HeroRosterView —— 一人公司「我的英雄」。
 * 每位英雄 = 单能力官（如深度研究官），可配置模型 fallback 链、改名、下任务、移除。
 * 模型选择复用 AgentConfigModal 的有序 fallback 链 + 自动 fallback UX。
 */
export function HeroRosterView() {
  const { heroes, loadHeroes } = useCompanyStore();
  const [configId, setConfigId] = useState<string | null>(null);

  useEffect(() => {
    void loadHeroes();
  }, [loadHeroes]);

  const configHero = useMemo(
    () => heroes.find((h) => h.id === configId) ?? null,
    [heroes, configId]
  );

  return (
    <div className="mx-auto max-w-6xl pb-16">
      <PageHeaderHero
        module="ask"
        icon={<Crown className="h-7 w-7 text-white" />}
        title="我的英雄"
        subtitle="麾下英雄各司其职，配好模型即可下任务，调遣他们替你完成深度工作"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/marketplace">
              <Store className="mr-2 h-4 w-4" />
              去英雄市场
            </Link>
          </Button>
        }
      />

      <div className="px-8">
        {heroes.length === 0 ? (
          <EmptyState
            type="noData"
            icon={<Crown className="h-12 w-12" />}
            title="还没有英雄"
            description="去英雄市场招募你的第一位单能力官"
            action={
              <Button asChild>
                <Link href="/marketplace">
                  <Store className="mr-2 h-4 w-4" />
                  去英雄市场
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {heroes.map((hero) => (
              <HeroCard
                key={hero.id}
                hero={hero}
                onConfig={() => setConfigId(hero.id)}
              />
            ))}
          </div>
        )}
      </div>

      {configHero && (
        <HeroConfigModal hero={configHero} onClose={() => setConfigId(null)} />
      )}
    </div>
  );
}

function HeroCard({ hero, onConfig }: { hero: Hero; onConfig: () => void }) {
  const { configHero, removeHero } = useCompanyStore();
  const [renaming, setRenaming] = useState(false);
  const [draftName, setDraftName] = useState(hero.name);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const capability = useMemo(
    () => resolveCapability(hero.capabilityId),
    [hero.capabilityId]
  );
  const gradient = gradientForId(hero.id);

  const commitRename = () => {
    const next = draftName.trim();
    if (next && next !== hero.name) {
      void configHero(hero.id, { name: next });
    } else {
      setDraftName(hero.name);
    }
    setRenaming(false);
  };

  return (
    <div className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      {/* 身份头 */}
      <div className="flex items-start gap-3">
        <div
          className={cn(
            'flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br shadow-sm',
            gradient
          )}
        >
          <Crown className="h-5 w-5 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          {renaming ? (
            <div className="flex items-center gap-1">
              <input
                autoFocus
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') {
                    setDraftName(hero.name);
                    setRenaming(false);
                  }
                }}
                className="min-w-0 flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={commitRename}
                aria-label="保存名称"
                className="rounded-md p-1 text-emerald-600 hover:bg-emerald-50"
              >
                <Check className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setDraftName(hero.name);
                  setRenaming(false);
                }}
                aria-label="取消"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <h3 className="truncate text-base font-semibold text-gray-900">
                {hero.name}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setDraftName(hero.name);
                  setRenaming(true);
                }}
                aria-label="重命名"
                className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          {capability.title && (
            <p className="truncate text-xs text-gray-500">{capability.title}</p>
          )}
        </div>
      </div>

      {/* 能力阶段 chips */}
      {capability.stages.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {capability.stages.slice(0, 5).map((stage) => (
            <span
              key={stage}
              className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
            >
              {stage}
            </span>
          ))}
        </div>
      )}

      {/* 模型摘要 */}
      <div className="mt-4 flex items-start gap-2 text-xs text-gray-600">
        <Cpu className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        {hero.models.length > 0 ? (
          <span className="flex flex-wrap gap-1">
            {hero.models.map((m, idx) => (
              <span
                key={m}
                className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 font-medium text-primary"
              >
                <span className="rounded bg-primary/20 px-1 text-xs">
                  {idx === 0 ? '主' : `备${idx}`}
                </span>
                {m}
              </span>
            ))}
          </span>
        ) : (
          <span className="text-gray-400">未配置模型 · 引擎自动择优</span>
        )}
      </div>

      {/* 操作区 */}
      <div className="mt-5 flex items-center gap-2 border-t border-gray-100 pt-4">
        <Button asChild size="sm" className="flex-1">
          <Link href="/missions">
            <Send className="mr-2 h-4 w-4" />
            下任务
          </Link>
        </Button>
        <Button variant="outline" size="sm" onClick={onConfig}>
          <Settings2 className="mr-2 h-4 w-4" />
          配置
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setConfirmOpen(true)}
          aria-label="移除英雄"
          className="h-9 w-9 text-gray-400 hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => removeHero(hero.id)}
        type="danger"
        title={`移除「${hero.name}」？`}
        description="移除后该英雄将从你的麾下消失，可随时再去市场招募。"
        confirmText="移除"
      />
    </div>
  );
}

/**
 * HeroConfigModal —— 配置英雄的模型 fallback 链 + 自动 fallback。
 * 复用 AgentConfigModal 的有序 fallback 链 UX（主/备标记、下拉添加、标签移除）。
 */
function HeroConfigModal({
  hero,
  onClose,
}: {
  hero: Hero;
  onClose: () => void;
}) {
  const { configHero } = useCompanyStore();
  const { models: aiModels } = useAIModels();

  const available = aiModels
    .filter(
      (m) =>
        m.modelType !== 'IMAGE_GENERATION' && m.modelType !== 'IMAGE_EDITING'
    )
    .filter((m) => !hero.models.includes(m.modelId))
    .map((m) => ({ id: m.modelId, name: m.name }));

  const nameOf = (id: string) =>
    aiModels.find((m) => m.modelId === id)?.name ?? id;

  const setModels = (models: string[]) => void configHero(hero.id, { models });

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`配置 · ${hero.name}`}
      subtitle="模型 fallback 链（主 → 备）与自动 fallback"
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div>
        <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <Cpu className="h-4 w-4 text-slate-500" /> 模型
          <span className="text-xs font-normal text-gray-400">
            已选 {hero.models.length}
          </span>
        </div>

        {/* 已选有序标签 */}
        {hero.models.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {hero.models.map((id, idx) => (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
              >
                <span className="rounded bg-white/25 px-1 text-xs">
                  {idx === 0 ? '主' : `备${idx}`}
                </span>
                {nameOf(id)}
                <button
                  type="button"
                  onClick={() => setModels(hero.models.filter((m) => m !== id))}
                  className="rounded-full p-0.5 hover:bg-white/20"
                  aria-label="移除"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="mb-2 text-xs text-gray-400">
            未配置模型，引擎将自动择优
          </p>
        )}

        {/* 添加下拉 */}
        {available.length > 0 ? (
          <select
            className={cn(CONTROL_CLS, 'max-w-sm')}
            value=""
            onChange={(e) => {
              if (e.target.value) {
                setModels([...hero.models, e.target.value]);
              }
            }}
          >
            <option value="">+ 添加模型…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-xs text-gray-300">已全部添加</p>
        )}

        {/* 自动 fallback 开关 */}
        <label className="mt-3 flex items-center gap-2 text-xs text-gray-600">
          <input
            type="checkbox"
            checked={hero.autoFallback}
            onChange={(e) =>
              void configHero(hero.id, { autoFallback: e.target.checked })
            }
            className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
          />
          主模型不可用时，自动按链顺序 fallback 到备用模型
        </label>
      </div>
    </Modal>
  );
}

export default HeroRosterView;
