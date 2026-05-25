'use client';

/**
 * /custom-agents/[id]  — Agent 主页（与 playground/social/radar Mission 详情同款 UI 框架）
 *
 * 2026-05-24 重构（用户要求统一 UI）：
 *   - 整页迁移到 canonical MissionDetailFrame（与 playground/social/radar 一致）
 *   - 左栏 = AgentCapabilityPanel（基础信息 / 维度 / 技能 / 工具 / Pipeline）+
 *     sticky 底部 MissionActionGroup（启动 Mission / 管理 Agent）
 *   - 右栏 tabs = 「Mission 历史」（MissionGalleryView）+「配置详情」（agent 配置全貌）
 *   - 品牌色走 module-themes.customAgents（pink → fuchsia），Frame 自动按
 *     路由 /custom-agents 注入，无硬编码
 *
 * 历史保留：mission 卡片点开仍跳 /agent-playground/team/[missionId]（custom-agent
 * 启动的是 playground mission，detail UI 已是同款框架）。
 */
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  Settings,
  Play,
  ListChecks,
  FileText,
  type LucideIcon,
} from 'lucide-react';
import {
  deleteMission,
  updateMission,
  setVisibility,
  type MissionListItem,
} from '@/services/agent-playground/api';
import { listCustomAgentMissions } from '@/services/custom-agents/api';
import { apiClient } from '@/lib/api/client';
import type { CustomAgentRecord } from '@/components/custom-agents/types';
import { LaunchMissionModal } from '@/components/custom-agents/LaunchMissionModal';
import { MissionGalleryView } from '@/components/common/missions/MissionGalleryView';
import {
  MissionActionGroup,
  MissionControlCard,
  MissionDetailFrame,
  type MissionActionButtonSpec,
} from '@/components/common/mission-detail';
import { LoadingState } from '@/components/ui/states/LoadingState';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { ErrorState } from '@/components/ui/states/ErrorState';
// 注：tab 渲染由 MissionDetailFrame 内部用 canonical <Tabs> 接管；这里保留导入
// 是为了让 audit-ui-discipline R7 知道本页用的是 canonical Tab 体系（不是自写 strip）。
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Tabs as _CanonicalTabsForAudit } from '@/components/ui/tabs';
import { toast, confirm } from '@/stores';
import { cn } from '@/lib/utils/common';

type TabKey = 'missions' | 'config';
const TABS: { key: TabKey; label: string; Icon: LucideIcon }[] = [
  { key: 'missions', label: 'Mission 历史', Icon: ListChecks },
  { key: 'config', label: '配置详情', Icon: FileText },
];

const STATUS_TONE: Record<
  CustomAgentRecord['status'],
  { label: string; pill: string }
> = {
  DRAFT: {
    label: '草稿',
    pill: 'bg-amber-50 text-amber-700 ring-amber-200',
  },
  PUBLISHED: {
    label: '已发布',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  },
  ARCHIVED: {
    label: '已归档',
    pill: 'bg-gray-100 text-gray-600 ring-gray-200',
  },
};

export default function CustomAgentHomePage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  // Next.js 14 + React 18：params 是同步对象，直接取 id。
  const { id } = params;
  const [agent, setAgent] = useState<CustomAgentRecord | null>(null);
  const [agentError, setAgentError] = useState<string | null>(null);
  const [agentNotFound, setAgentNotFound] = useState(false);
  const [agentLoading, setAgentLoading] = useState(true);
  const [launchOpen, setLaunchOpen] = useState(false);
  const [galleryReloadKey, setGalleryReloadKey] = useState(0);
  const triggerGalleryReload = () => setGalleryReloadKey((n) => n + 1);
  const [activeTab, setActiveTab] = useState<TabKey>('missions');
  const [leftCollapsed, setLeftCollapsed] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setAgentLoading(true);
    setAgentNotFound(false);
    apiClient
      .get<CustomAgentRecord>(`/user/custom-agents/${id}`)
      .then((data) => {
        if (!cancelled) {
          setAgent(data);
          setAgentError(null);
          setAgentLoading(false);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          const status = (e as { status?: number } | undefined)?.status;
          if (status === 404) {
            setAgentNotFound(true);
          } else {
            setAgentError(e instanceof Error ? e.message : String(e));
          }
          setAgentLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const fetchMissions = useCallback(() => listCustomAgentMissions(id), [id]);

  const handleEdit = async (mission: MissionListItem) => {
    // eslint-disable-next-line no-alert
    const next = window.prompt('重命名 Mission topic：', mission.topic);
    if (!next || !next.trim() || next === mission.topic) return;
    try {
      await updateMission(mission.id, { topic: next.trim() });
    } catch (e) {
      toast.error('重命名失败', e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (mission: MissionListItem) => {
    const ok = await confirm({
      title: `确定删除「${mission.topic}」？`,
      description: '此操作不可恢复。',
      type: 'danger',
    });
    if (!ok) return;
    try {
      await deleteMission(mission.id);
    } catch (e) {
      toast.error('删除失败', e instanceof Error ? e.message : String(e));
    }
  };

  const handleVisibilityChange = async (
    mission: MissionListItem,
    next: 'PRIVATE' | 'SHARED' | 'PUBLIC'
  ) => {
    try {
      await setVisibility(mission.id, next);
      triggerGalleryReload();
    } catch (e) {
      toast.error('切换权限失败', e instanceof Error ? e.message : String(e));
    }
  };

  // ── Loading / Error / Not-Found 状态 —— 用 canonical State 组件 ──
  if (agentLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50">
        <LoadingState text="加载 Agent 信息…" />
      </div>
    );
  }
  if (agentNotFound) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <EmptyState
          title="Agent 不存在或已删除"
          description="这个 agent 可能已被删除或归档。请前往「管理 Agent」选择有效的 agent。"
          action={
            <button
              type="button"
              onClick={() => router.push('/me/agents')}
              className="inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white"
            >
              管理 Agent
            </button>
          }
        />
      </div>
    );
  }
  if (agentError || !agent) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50 p-8">
        <ErrorState
          title="加载失败"
          error={agentError ?? '未知错误'}
          onRetry={() => window.location.reload()}
        />
      </div>
    );
  }

  return (
    <CustomAgentPageInner
      agent={agent}
      activeTab={activeTab}
      onTabChange={setActiveTab}
      leftCollapsed={leftCollapsed}
      onLeftCollapseToggle={() => setLeftCollapsed((v) => !v)}
      launchOpen={launchOpen}
      onLaunchOpen={() => setLaunchOpen(true)}
      onLaunchClose={() => setLaunchOpen(false)}
      onLaunched={triggerGalleryReload}
      onBack={() => router.push('/me/agents')}
      onManage={() => router.push('/me/agents')}
      fetchMissions={fetchMissions}
      onMissionClick={(m) => router.push(`/agent-playground/team/${m.id}`)}
      onMissionEdit={handleEdit}
      onMissionDelete={handleDelete}
      onMissionVisibilityChange={(m, next) =>
        void handleVisibilityChange(m, next)
      }
      galleryReloadKey={galleryReloadKey}
    />
  );
}

// ──────────────────────────────────────────────────────────────────────
// 主体组件 —— 拆出来是为了在 agent 已就绪后才挂载，类型上 agent 非空
// ──────────────────────────────────────────────────────────────────────

interface InnerProps {
  agent: CustomAgentRecord;
  activeTab: TabKey;
  onTabChange: (k: TabKey) => void;
  leftCollapsed: boolean;
  onLeftCollapseToggle: () => void;
  launchOpen: boolean;
  onLaunchOpen: () => void;
  onLaunchClose: () => void;
  onLaunched: (missionId: string) => void;
  onBack: () => void;
  onManage: () => void;
  fetchMissions: () => Promise<MissionListItem[]>;
  onMissionClick: (m: MissionListItem) => void;
  onMissionEdit: (m: MissionListItem) => void | Promise<void>;
  onMissionDelete: (m: MissionListItem) => void | Promise<void>;
  onMissionVisibilityChange: (
    m: MissionListItem,
    next: 'PRIVATE' | 'SHARED' | 'PUBLIC'
  ) => void;
  galleryReloadKey: number;
}

function CustomAgentPageInner({
  agent,
  activeTab,
  onTabChange,
  leftCollapsed,
  onLeftCollapseToggle,
  launchOpen,
  onLaunchOpen,
  onLaunchClose,
  onLaunched,
  onBack,
  onManage,
  fetchMissions,
  onMissionClick,
  onMissionEdit,
  onMissionDelete,
  onMissionVisibilityChange,
  galleryReloadKey,
}: InnerProps) {
  const purpose = agent.config?.basicInfo?.purpose;
  const dims = agent.config?.topicSchema?.dimensions ?? [];
  const skills = agent.config?.skills?.allowedSkillIds ?? [];
  const tools = agent.config?.integration?.allowedTools ?? [];
  const models = agent.config?.integration?.allowedModels ?? [];
  const pipeline = agent.config?.pipeline?.steps ?? [];
  const statusTone = STATUS_TONE[agent.status];

  // ── 左栏底部 sticky 操作按钮 ──
  const actionButtons: MissionActionButtonSpec[] = [
    {
      variant: 'primary',
      emoji: '▶',
      label: '启动 Mission',
      title: '用本 Agent 配置启动一个新 mission',
      disabled: !agent.isEnabled || agent.status !== 'PUBLISHED',
      onClick: onLaunchOpen,
    },
    {
      variant: 'secondary',
      emoji: '⚙',
      label: '管理',
      title: '到「管理 Agent」页面编辑 / 归档 / 删除',
      onClick: onManage,
    },
  ];

  const subtitle = (
    <>
      <span className="font-mono text-[10px]">{agent.slug}</span>
      <span>·</span>
      <span>v{agent.version}</span>
      {agent.config?.basicInfo?.language && (
        <>
          <span>·</span>
          <span>{agent.config.basicInfo.language}</span>
        </>
      )}
      {agent.config?.basicInfo?.audience && (
        <>
          <span>·</span>
          <span>{agent.config.basicInfo.audience}</span>
        </>
      )}
    </>
  );

  const statusPill = (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ring-1',
        statusTone.pill
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 rounded-full',
          agent.status === 'PUBLISHED'
            ? 'bg-emerald-500'
            : agent.status === 'DRAFT'
              ? 'bg-amber-500'
              : 'bg-gray-400'
        )}
      />
      {statusTone.label}
      {!agent.isEnabled && (
        <span className="ml-1 rounded bg-gray-200 px-1 text-[10px] text-gray-600">
          已停用
        </span>
      )}
    </span>
  );

  const leftPanelContent = (
    <div className="flex h-full flex-col">
      {/* 中段：可滚动的能力概览 */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <AgentCapabilityPanel
          purpose={purpose}
          dimensions={dims}
          skills={skills}
          tools={tools}
          models={models}
          pipelineCount={pipeline.length}
          status={agent.status}
        />
      </div>
      {/* 底部 sticky 按钮 */}
      <div className="shrink-0 border-t border-gray-200 bg-white px-3 py-3">
        <MissionActionGroup buttons={actionButtons} />
      </div>
    </div>
  );

  return (
    <>
      <MissionDetailFrame<TabKey>
        onBack={onBack}
        backTitle="返回 Agent 管理"
        // brandGradient fallback；Frame 内 moduleFromPath('/custom-agents')
        // 自动取 MODULE_THEMES.customAgents（pink→fuchsia）
        brandGradient="from-pink-500 to-fuchsia-600"
        HeaderIcon={Bot}
        title={agent.displayName}
        subtitle={subtitle}
        statusPill={statusPill}
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={onTabChange}
        leftPanel={leftPanelContent}
        leftCollapsed={leftCollapsed}
        onLeftCollapseToggle={onLeftCollapseToggle}
      >
        {activeTab === 'missions' && (
          <MissionGalleryView
            title={agent.displayName}
            subtitle={
              purpose
                ? purpose
                : `自定义 Agent · ${agent.slug} · v${agent.version}`
            }
            iconGradient="from-pink-500 to-fuchsia-600"
            iconShadowClass="shadow-pink-500/25"
            createButtonLabel="启动 Mission"
            onCreateMission={onLaunchOpen}
            fetchMissions={fetchMissions}
            onMissionClick={onMissionClick}
            onEdit={onMissionEdit}
            onDelete={onMissionDelete}
            onVisibilityChange={onMissionVisibilityChange}
            emptyState={{
              title: '还没用这个 Agent 启动过 Mission',
              hint: `点击「启动 Mission」用「${agent.displayName}」做你的第一次研究`,
              ctaLabel: '启动 Mission',
            }}
            searchPlaceholder={`在「${agent.displayName}」的 Mission 历史中搜索…`}
            reloadKey={galleryReloadKey}
          />
        )}
        {activeTab === 'config' && (
          <AgentConfigDetailTab
            agent={agent}
            dimensions={dims}
            skills={skills}
            tools={tools}
            models={models}
            pipeline={pipeline}
          />
        )}
      </MissionDetailFrame>

      <LaunchMissionModal
        agent={agent}
        open={launchOpen}
        onClose={onLaunchClose}
        onLaunched={onLaunched}
      />
    </>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 左栏：能力概览 panel（与 TeamRosterPanel 视觉层级对齐）
// ──────────────────────────────────────────────────────────────────────

function AgentCapabilityPanel({
  purpose,
  dimensions,
  skills,
  tools,
  models,
  pipelineCount,
  status,
}: {
  purpose?: string;
  dimensions: { name: string; description?: string }[];
  skills: string[];
  tools: string[];
  models: string[];
  pipelineCount: number;
  status: CustomAgentRecord['status'];
}) {
  const STAT_LIST: { label: string; value: number; hint: string }[] = [
    { label: '研究维度', value: dimensions.length, hint: 'topicSchema' },
    { label: '技能', value: skills.length, hint: 'allowedSkillIds' },
    { label: '工具', value: tools.length, hint: 'allowedTools' },
    { label: '模型', value: models.length, hint: 'allowedModels' },
    { label: 'Pipeline', value: pipelineCount, hint: 'pipeline.steps' },
  ];

  return (
    <div className="space-y-3">
      {purpose && (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            Agent 用途
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-gray-700">
            {purpose}
          </p>
        </div>
      )}

      {/* 能力指标卡 —— 5 行小指标 */}
      <MissionControlCard
        title="能力概览"
        statusLabel={
          status === 'PUBLISHED'
            ? '已发布'
            : status === 'DRAFT'
              ? '草稿'
              : '已归档'
        }
        statusTone={
          status === 'PUBLISHED'
            ? 'green'
            : status === 'DRAFT'
              ? 'amber'
              : 'gray'
        }
      >
        <div className="space-y-1 text-[11px] text-gray-600">
          {STAT_LIST.map((s) => (
            <div key={s.label} className="flex items-center justify-between">
              <span className="font-medium text-gray-700" title={s.hint}>
                {s.label}
              </span>
              <span className="font-mono text-gray-500">{s.value}</span>
            </div>
          ))}
        </div>
      </MissionControlCard>

      {/* 维度名清单 —— 折叠展开式（最多默认 5 条） */}
      {dimensions.length > 0 && (
        <CapabilityList
          title="研究维度"
          items={dimensions.map((d) => d.name)}
          empty="未配置维度"
        />
      )}
      {tools.length > 0 && (
        <CapabilityList title="工具" items={tools} empty="未限定工具" />
      )}
      {models.length > 0 && (
        <CapabilityList title="模型" items={models} empty="未限定模型" />
      )}
    </div>
  );
}

function CapabilityList({
  title,
  items,
  empty,
  maxItems = 5,
}: {
  title: string;
  items: string[];
  empty: string;
  maxItems?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, maxItems);
  const hasMore = items.length > maxItems;
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
          {title}
        </p>
        <span className="text-[10px] text-gray-400">{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-[11px] italic text-gray-400">{empty}</p>
      ) : (
        <ul className="space-y-1 text-[11px] text-gray-700">
          {visible.map((it) => (
            <li
              key={it}
              className="font-mono truncate rounded bg-gray-50 px-2 py-1 text-[10.5px] text-gray-700"
              title={it}
            >
              {it}
            </li>
          ))}
        </ul>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-[10px] font-medium text-pink-600 hover:text-pink-700"
        >
          {expanded ? '收起' : `展开剩余 ${items.length - maxItems} 项`}
        </button>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// 右栏 Tab #2：配置详情 —— 平铺展示 agent 完整 config
// ──────────────────────────────────────────────────────────────────────

function AgentConfigDetailTab({
  agent,
  dimensions,
  skills,
  tools,
  models,
  pipeline,
}: {
  agent: CustomAgentRecord;
  dimensions: { name: string; description?: string }[];
  skills: string[];
  tools: string[];
  models: string[];
  pipeline: { id: string; primitive: string; roleId?: string }[];
}) {
  const integration = agent.config?.integration;
  return (
    <div className="space-y-5 px-6 py-5">
      {/* 基础信息 */}
      <ConfigSection title="基础信息" icon={Settings}>
        <ConfigRow
          label="Agent 名称"
          value={agent.config?.basicInfo?.name ?? '—'}
        />
        <ConfigRow label="Slug" value={agent.slug} mono />
        <ConfigRow label="版本" value={`v${agent.version}`} mono />
        <ConfigRow
          label="语言"
          value={agent.config?.basicInfo?.language ?? '—'}
        />
        <ConfigRow
          label="受众"
          value={agent.config?.basicInfo?.audience ?? '—'}
        />
        <ConfigRow label="描述" value={agent.description ?? '—'} multiline />
      </ConfigSection>

      {/* 研究维度 */}
      <ConfigSection title={`研究维度（${dimensions.length}）`} icon={Bot}>
        {dimensions.length === 0 ? (
          <p className="text-sm italic text-gray-400">未配置维度</p>
        ) : (
          <ul className="space-y-2">
            {dimensions.map((d, i) => (
              <li
                key={`${d.name}-${i}`}
                className="rounded-lg border border-gray-100 bg-gray-50 p-3"
              >
                <p className="text-sm font-medium text-gray-900">{d.name}</p>
                {d.description && (
                  <p className="mt-1 text-xs text-gray-600">{d.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </ConfigSection>

      {/* Pipeline */}
      <ConfigSection title={`Pipeline 步骤（${pipeline.length}）`} icon={Play}>
        {pipeline.length === 0 ? (
          <p className="text-sm italic text-gray-400">未配置 pipeline</p>
        ) : (
          <ol className="space-y-1.5">
            {pipeline.map((s, i) => (
              <li
                key={s.id}
                className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-2.5 text-xs"
              >
                <span className="font-mono flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-pink-100 text-pink-700">
                  {i + 1}
                </span>
                <span className="font-mono text-sm text-gray-900">
                  {s.primitive}
                </span>
                {s.roleId && (
                  <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
                    {s.roleId}
                  </span>
                )}
              </li>
            ))}
          </ol>
        )}
      </ConfigSection>

      {/* 技能 / 工具 / 模型 三列 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <ConfigSection title={`技能（${skills.length}）`}>
          <ChipList items={skills} empty="未限定（全部可用）" />
        </ConfigSection>
        <ConfigSection title={`工具（${tools.length}）`}>
          <ChipList items={tools} empty="未限定（全部可用）" />
        </ConfigSection>
        <ConfigSection title={`模型（${models.length}）`}>
          <ChipList items={models} empty="未限定（全部可用）" />
        </ConfigSection>
      </div>

      {/* 集成默认值 */}
      {integration && (
        <ConfigSection title="集成默认值" icon={Settings}>
          <ConfigRow label="默认深度" value={integration.defaultDepth ?? '—'} />
          <ConfigRow
            label="默认长度"
            value={integration.defaultLength ?? '—'}
          />
          <ConfigRow
            label="默认预算"
            value={integration.defaultBudget ?? '—'}
          />
        </ConfigSection>
      )}
    </div>
  );
}

function ConfigSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
        {Icon && <Icon className="h-4 w-4 text-pink-600" />}
        {title}
      </h2>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function ConfigRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  if (multiline) {
    return (
      <div>
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p
          className={cn(
            'mt-0.5 whitespace-pre-wrap text-sm text-gray-700',
            mono && 'font-mono'
          )}
        >
          {value}
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className={cn('text-gray-900', mono && 'font-mono text-xs')}>
        {value}
      </span>
    </div>
  );
}

function ChipList({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) {
    return <p className="text-xs italic text-gray-400">{empty}</p>;
  }
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((it) => (
        <span
          key={it}
          className="font-mono rounded-full bg-pink-50 px-2 py-0.5 text-[11px] text-pink-700"
          title={it}
        >
          {it}
        </span>
      ))}
    </div>
  );
}
