'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';

interface ScenarioRun {
  id: string;
  status: string;
  currentRound?: number;
}

interface ScenarioCard {
  id: string;
  name: string;
  industry: string;
  region?: string;
  companies?: ScenarioFormCompany[];
  agents?: ScenarioFormAgent[];
  runs?: ScenarioRun[];
  goals?: ScenarioGoals;
  params?: ScenarioParams;
  createdAt: string;
  updatedAt: string;
}

interface ScenarioFormCompany {
  name: string;
  type: string;
  market: string;
  metrics?: any;
}

interface ScenarioFormAgent {
  role: string;
  team: 'BLUE' | 'RED' | 'GREEN' | 'CHAOS';
  companyName?: string;
  persona?: string;
  memoryPublic?: string;
  memoryPrivate?: string;
}

interface ScenarioTemplate {
  name: string;
  industry: string;
  region?: string;
  goals?: ScenarioGoals;
  constraints?: ScenarioParams;
  companies?: ScenarioFormCompany[];
  agents?: ScenarioFormAgent[];
  description?: string;
  badge?: string;
}

interface ScenarioGoals {
  targetShare?: string;
  risk?: string;
  growth?: string;
  custom?: string;
}

interface ScenarioParams {
  blindMove: boolean;
  cot: boolean;
  chaosProb: number;
  irrationalProb: number;
  humanBreakEvery: number;
}

interface ExternalSnapshot {
  snapshot: Record<string, any>;
  evidence: Array<{
    provider: string;
    ok: boolean;
    error?: string;
    endpoint?: string;
    timestamp: string;
  }>;
}

export default function AISimulationPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<ScenarioCard | null>(null);
  const [seed, setSeed] = useState<ScenarioTemplate | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const templates: ScenarioTemplate[] = useMemo(
    () => [
      {
        name: 'AI算力基础设施',
        industry: 'AI Compute Infrastructure',
        region: 'Global',
        goals: {
          targetShare: '守住份额并提升交付速度',
          risk: '控制合规与供应链黑天鹅',
          growth: '拉高算力利用率与现金流效率',
        },
        constraints: {
          blindMove: true,
          cot: true,
          chaosProb: 0.3,
          irrationalProb: 0.2,
          humanBreakEvery: 2,
        },
        companies: [
          { name: 'Benchmark Cloud GPU', type: 'benchmark', market: 'Global' },
          { name: 'Startup AI Infra', type: 'startup', market: 'US' },
        ],
        agents: [
          {
            role: 'CEO - 蓝军',
            team: 'BLUE',
            companyName: 'Benchmark Cloud GPU',
          },
          { role: 'CEO - 红军', team: 'RED', companyName: 'Startup AI Infra' },
          { role: '监管观察', team: 'GREEN' },
        ],
        description:
          'GPU/芯片/云算力供需、价格战、合规/出口管制与舆情对抗场景，默认盲注+Chaos+人类介入。',
        badge: '模板',
      },
    ],
    []
  );

  const fetchScenarios = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/scenarios`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      if (res.ok) {
        setScenarios(await res.json());
      } else {
        setMessage('加载场景失败，请确认已登录且有权限');
      }
    } catch (err: any) {
      setMessage(err.message || '加载场景失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) void fetchScenarios();
  }, [user]);

  const latestRun = (s: ScenarioCard) =>
    s.runs && s.runs.length > 0 ? s.runs[0] : null;

  const handleCreate = () => {
    setEditing(null);
    setSeed(null);
    setShowEditor(true);
  };

  const handleOpen = (scenario: ScenarioCard) => {
    setEditing(scenario);
    setSeed(null);
    setShowEditor(true);
  };

  const handleTemplate = (template: ScenarioTemplate) => {
    setEditing(null);
    setSeed(template);
    setShowEditor(true);
  };

  if (authLoading) return null;

  if (!user) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 p-12">
          <div className="mx-auto max-w-3xl rounded-2xl border border-gray-100 bg-white p-10 text-center shadow-sm">
            <h2 className="text-2xl font-semibold text-gray-800">请先登录</h2>
            <p className="mt-2 text-sm text-gray-500">
              进入 AI Simulation 需要登录并拥有管理员权限。
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50/30">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="space-y-6 px-8 py-6">
          {/* Header */}
          <div className="border-b border-gray-100 bg-white/50 backdrop-blur-sm">
            <div className="px-0 py-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
                    <svg
                      className="h-5 w-5 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 6l7 4-7 4-7-4 7-4zm0 8l7 4-7 4-7-4 7-4z"
                      />
                    </svg>
                  </div>
                  <div>
                    <h1 className="text-lg font-semibold text-gray-900">
                      AI Simulation
                    </h1>
                    <p className="text-sm text-gray-500">
                      战略推演：多军对抗、真实数据、人类介入
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleCreate}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-5 py-2.5 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-700 hover:to-purple-700"
                >
                  + 新建推演
                </button>
              </div>
            </div>
          </div>

          {/* Templates */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  行业模板
                </h2>
                <p className="text-xs text-gray-500">
                  选择模板快速创建推演场景
                </p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {templates.map((t) => (
                <div
                  key={t.name}
                  className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                  onClick={() => handleTemplate(t)}
                >
                  {/* Icon & Badge */}
                  <div className="mb-3 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl">
                      🏭
                    </div>
                    {t.badge && (
                      <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                        {t.badge}
                      </span>
                    )}
                  </div>

                  {/* Title & Description */}
                  <h4 className="truncate text-base font-semibold text-gray-900">
                    {t.name}
                  </h4>
                  <p className="text-xs text-gray-500">
                    {t.industry} · {t.region || 'Global'}
                  </p>
                  <p className="mt-2 line-clamp-2 text-sm text-gray-600">
                    {t.description}
                  </p>

                  {/* Stats */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                      公司 {t.companies?.length || 0}
                    </span>
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                      角色 {t.agents?.length || 0}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Message */}
          {message && (
            <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
              {message}
            </div>
          )}

          {/* Cards */}
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">
                  场景列表
                </h2>
                <p className="text-xs text-gray-500">
                  点击卡片可查看/编辑，最新运行状态实时展示
                </p>
              </div>
              <button
                onClick={() => void fetchScenarios()}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                刷新
              </button>
            </div>
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-500">
                加载中...
              </div>
            ) : scenarios.length === 0 ? (
              <div className="rounded-xl border-2 border-dashed border-gray-200 bg-gray-50/50 px-6 py-12 text-center">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6l7 4-7 4-7-4 7-4zm0 8l7 4-7 4-7-4 7-4z"
                  />
                </svg>
                <h3 className="mt-4 text-sm font-medium text-gray-900">
                  暂无推演场景
                </h3>
                <p className="mt-1 text-sm text-gray-500">
                  点击上方"新建推演"或选择模板开始
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {scenarios.map((s) => {
                  const run = latestRun(s);
                  return (
                    <div
                      key={s.id}
                      className="group relative cursor-pointer rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
                      onClick={() => handleOpen(s)}
                    >
                      {/* Icon & Status */}
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-2xl">
                          ⚔️
                        </div>
                        {run ? (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                            {run.status}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
                            未运行
                          </span>
                        )}
                      </div>

                      {/* Title & Industry */}
                      <h4 className="truncate text-base font-semibold text-gray-900">
                        {s.name}
                      </h4>
                      <p className="text-xs text-gray-500">
                        {s.industry} · {s.region || 'Global'}
                      </p>

                      {/* Stats */}
                      <div className="mt-4 flex flex-wrap gap-2">
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                          公司 {s.companies?.length || 0}
                        </span>
                        <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                          角色 {s.agents?.length || 0}
                        </span>
                        {run && (
                          <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                            回合 {run.currentRound ?? 0}
                          </span>
                        )}
                      </div>

                      {/* Updated Time */}
                      <div className="mt-3 text-xs text-gray-500">
                        {new Date(s.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={handleCreate}
                  className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 transition-all hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-600"
                >
                  <span className="mb-2 text-3xl">+</span>
                  新建推演
                </button>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Editor Modal */}
      {showEditor && (
        <EditorModal
          scenario={editing}
          seed={seed}
          onClose={() => setShowEditor(false)}
          onSaved={() => {
            setShowEditor(false);
            void fetchScenarios();
          }}
        />
      )}
    </div>
  );
}

function EditorModal({
  scenario,
  seed,
  onClose,
  onSaved,
}: {
  scenario: ScenarioCard | null;
  seed?: ScenarioTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const preset = (scenario || seed || {}) as Partial<ScenarioCard> &
    Partial<ScenarioTemplate>;
  const defaultConstraints: ScenarioParams = {
    blindMove: true,
    cot: true,
    chaosProb: 0.3,
    irrationalProb: 0.2,
    humanBreakEvery: 2,
  };

  const [form, setForm] = useState({
    name: preset.name || '',
    industry: preset.industry || '',
    region: preset.region || '',
    goals: {
      targetShare: preset.goals?.targetShare || '',
      risk: preset.goals?.risk || '',
      growth: preset.goals?.growth || '',
      custom: preset.goals?.custom || '',
    } as ScenarioGoals,
    constraints: preset.params || preset.constraints || defaultConstraints,
  });

  const [companies, setCompanies] = useState<ScenarioFormCompany[]>(
    preset.companies || [
      { name: 'Benchmark Cloud GPU', type: 'benchmark', market: 'Global' },
      { name: 'Startup AI Infra', type: 'startup', market: 'US' },
    ]
  );

  const [agents, setAgents] = useState<ScenarioFormAgent[]>(
    preset.agents || [
      { role: 'CEO - 蓝军', team: 'BLUE', companyName: 'Benchmark Cloud GPU' },
      { role: 'CEO - 红军', team: 'RED', companyName: 'Startup AI Infra' },
      { role: '监管观察', team: 'GREEN' },
    ]
  );

  const [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [external, setExternal] = useState<ExternalSnapshot | null>(null);
  const [syncing, setSyncing] = useState(false);

  const saveScenario = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/scenarios`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          ...form,
          companies,
          agents: agents.map((a) => ({
            ...a,
            persona: a.persona ? safeJson(a.persona, a.persona) : undefined,
            memoryPublic: a.memoryPublic
              ? safeJson(a.memoryPublic, a.memoryPublic)
              : undefined,
            memoryPrivate: a.memoryPrivate
              ? safeJson(a.memoryPrivate, a.memoryPrivate)
              : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage('场景已保存');
        onSaved();
      } else {
        setMessage(data?.message || '保存失败');
      }
    } catch (err: any) {
      setMessage(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const startRun = async () => {
    if (!scenario?.id) {
      setMessage('请先保存场景');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          scenarioId: scenario.id,
          rounds: 4,
          params: form.constraints,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRunId(data.id);
        setMessage('推演已启动');
      } else {
        setMessage(data?.message || '启动失败');
      }
    } catch (err: any) {
      setMessage(err.message || '启动失败');
    } finally {
      setSaving(false);
    }
  };

  const updateCompany = (index: number, value: ScenarioFormCompany) => {
    setCompanies((prev) => prev.map((c, i) => (i === index ? value : c)));
  };
  const addCompany = () =>
    setCompanies((prev) => [
      ...prev,
      { name: `Company ${prev.length + 1}`, type: 'startup', market: 'Global' },
    ]);
  const updateAgent = (index: number, value: ScenarioFormAgent) => {
    setAgents((prev) => prev.map((a, i) => (i === index ? value : a)));
  };
  const addAgent = () =>
    setAgents((prev) => [
      ...prev,
      { role: `Agent ${prev.length + 1}`, team: 'BLUE' },
    ]);

  const fetchExternal = async () => {
    setSyncing(true);
    setMessage(null);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/external/snapshot`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setExternal(data);
        setMessage('已同步外部数据，建议复核字段并人工调整');
      } else {
        setMessage(data?.message || '同步外部数据失败');
      }
    } catch (err: any) {
      setMessage(err.message || '同步外部数据失败');
    } finally {
      setSyncing(false);
    }
  };

  const injectFromMarket = () => {
    if (
      !external?.snapshot?.market ||
      !Array.isArray(external.snapshot.market)
    ) {
      setMessage('外部数据缺少可用的市场公司列表，请检查配置');
      return;
    }
    const next = external.snapshot.market
      .slice(0, 6)
      .map((item: any, idx: number) => ({
        name: item.name || item.title || `Company ${idx + 1}`,
        type: item.type || 'competitor',
        market: item.market || form.region || 'Global',
        metrics: item.metrics || item,
      }));
    setCompanies(next);
    setMessage('已用外部市场数据填充公司，请确认类型/指标');
  };

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-6">
      <div className="h-[90vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {scenario ? '编辑场景' : '新建场景'}
            </h3>
            <p className="text-xs text-gray-500">
              点击行业模板进入配置，支持外部API同步对手/监管/新闻并注入场景。
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-gray-100 px-3 py-1 text-sm text-gray-600 hover:bg-gray-200"
          >
            关闭
          </button>
        </div>

        {message && (
          <div className="mt-3 rounded-lg border border-indigo-100 bg-indigo-50 p-2 text-sm text-indigo-700">
            {message}
          </div>
        )}

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">名称</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">行业</label>
                  <input
                    value={form.industry}
                    onChange={(e) =>
                      setForm({ ...form, industry: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">区域</label>
                  <input
                    value={form.region}
                    onChange={(e) =>
                      setForm({ ...form, region: e.target.value })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2 grid gap-2 sm:grid-cols-2">
                  <div>
                    <label className="text-xs text-gray-600">目标</label>
                    <input
                      value={form.goals.targetShare || ''}
                      placeholder="如：提升市场份额/交付速度"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, targetShare: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">风险/合规</label>
                    <input
                      value={form.goals.risk || ''}
                      placeholder="如：出口管制、供应链黑天鹅"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, risk: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">增长</label>
                    <input
                      value={form.goals.growth || ''}
                      placeholder="如：拉高利用率与现金流"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, growth: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-600">自定义</label>
                    <input
                      value={form.goals.custom || ''}
                      placeholder="补充其他目标或约束"
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, custom: e.target.value },
                        })
                      }
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="col-span-2 rounded-lg border border-white bg-white p-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="text-sm font-semibold text-gray-800">
                      对战约束
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.constraints.blindMove}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            constraints: {
                              ...form.constraints,
                              blindMove: e.target.checked,
                            },
                          })
                        }
                      />
                      盲注
                    </label>
                    <label className="flex items-center gap-2 text-xs text-gray-700">
                      <input
                        type="checkbox"
                        checked={form.constraints.cot}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            constraints: {
                              ...form.constraints,
                              cot: e.target.checked,
                            },
                          })
                        }
                      />
                      强制CoT
                    </label>
                  </div>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <div>
                      <label className="text-xs text-gray-600">Chaos概率</label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.constraints.chaosProb}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            constraints: {
                              ...form.constraints,
                              chaosProb: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full"
                      />
                      <div className="text-xs text-gray-600">
                        {Math.round(form.constraints.chaosProb * 100)}%
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">
                        非理性概率
                      </label>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={form.constraints.irrationalProb}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            constraints: {
                              ...form.constraints,
                              irrationalProb: parseFloat(e.target.value),
                            },
                          })
                        }
                        className="w-full"
                      />
                      <div className="text-xs text-gray-600">
                        {Math.round(form.constraints.irrationalProb * 100)}%
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-600">
                        每N轮暂停(HITL)
                      </label>
                      <input
                        type="number"
                        min={1}
                        value={form.constraints.humanBreakEvery}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            constraints: {
                              ...form.constraints,
                              humanBreakEvery:
                                parseInt(e.target.value, 10) || 2,
                            },
                          })
                        }
                        className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  角色卡（蓝/多红/绿/Chaos）
                </h4>
                <button
                  onClick={addAgent}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  + 添加角色
                </button>
              </div>
              <div className="space-y-3">
                {agents.map((a, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-white bg-white p-3 shadow-sm"
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <select
                        value={a.team}
                        onChange={(e) =>
                          updateAgent(idx, {
                            ...a,
                            team: e.target.value as ScenarioFormAgent['team'],
                          })
                        }
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm md:w-24"
                      >
                        <option value="BLUE">蓝军</option>
                        <option value="RED">红军</option>
                        <option value="GREEN">绿军</option>
                        <option value="CHAOS">Chaos</option>
                      </select>
                      <input
                        value={a.role}
                        onChange={(e) =>
                          updateAgent(idx, { ...a, role: e.target.value })
                        }
                        className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm"
                      />
                      <input
                        value={a.companyName || ''}
                        placeholder="所属公司(可选)"
                        onChange={(e) =>
                          updateAgent(idx, {
                            ...a,
                            companyName: e.target.value,
                          })
                        }
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm md:w-40"
                      />
                    </div>
                    <div className="mt-2 grid gap-2 md:grid-cols-2">
                      <textarea
                        value={a.persona || ''}
                        placeholder='Persona（JSON），例：{"style":"激进CEO","bias":"高风险短期"}'
                        onChange={(e) =>
                          updateAgent(idx, { ...a, persona: e.target.value })
                        }
                        rows={2}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 font-mono text-xs"
                      />
                      <textarea
                        value={a.memoryPrivate || ''}
                        placeholder='私有记忆（JSON），例：{"secret":"资金链紧张"}'
                        onChange={(e) =>
                          updateAgent(idx, {
                            ...a,
                            memoryPrivate: e.target.value,
                          })
                        }
                        rows={2}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 font-mono text-xs"
                      />
                      <textarea
                        value={a.memoryPublic || ''}
                        placeholder='公共记忆（JSON），例：{"newsRef":"最新供应链报道"}'
                        onChange={(e) =>
                          updateAgent(idx, {
                            ...a,
                            memoryPublic: e.target.value,
                          })
                        }
                        rows={2}
                        className="w-full rounded-md border border-gray-200 px-2 py-1 font-mono text-xs md:col-span-2"
                      />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-gray-500">
                      <button
                        className="rounded border border-gray-200 px-2 py-1 hover:border-indigo-300"
                        onClick={() =>
                          updateAgent(idx, {
                            ...a,
                            team: 'RED',
                            role: '红军 激进CEO',
                            persona: JSON.stringify(
                              {
                                style: '激进派CEO',
                                pressure: '季度财报压力',
                                preference: '高风险高回报抢份额',
                                decision: '独断专行',
                              },
                              null,
                              2
                            ),
                          })
                        }
                      >
                        套用红军·激进CEO
                      </button>
                      <button
                        className="rounded border border-gray-200 px-2 py-1 hover:border-indigo-300"
                        onClick={() =>
                          updateAgent(idx, {
                            ...a,
                            team: 'RED',
                            role: '红军 保守董事会',
                            persona: JSON.stringify(
                              {
                                style: '保守董事会',
                                preference: '稳健现金流',
                                risk: '反对过度资本开支',
                              },
                              null,
                              2
                            ),
                          })
                        }
                      >
                        套用红军·保守董事会
                      </button>
                      <button
                        className="rounded border border-gray-200 px-2 py-1 hover:border-green-300"
                        onClick={() =>
                          updateAgent(idx, {
                            ...a,
                            team: 'GREEN',
                            role: '绿军 监管官',
                            persona: JSON.stringify(
                              {
                                style: '监管/合规',
                                focus: '出口管制、能耗、数据合规',
                                bias: '保护消费者与能源安全',
                              },
                              null,
                              2
                            ),
                          })
                        }
                      >
                        套用绿军·监管
                      </button>
                      <button
                        className="rounded border border-gray-200 px-2 py-1 hover:border-green-300"
                        onClick={() =>
                          updateAgent(idx, {
                            ...a,
                            team: 'GREEN',
                            role: '绿军 媒体/舆情',
                            persona: JSON.stringify(
                              {
                                style: '媒体记者',
                                focus: '供应链透明度、价格战',
                                bias: '偏好揭露负面但遵循事实',
                              },
                              null,
                              2
                            ),
                          })
                        }
                      >
                        套用绿军·媒体
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  公司（自动+手工）
                </h4>
                <button
                  onClick={addCompany}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  + 添加公司
                </button>
              </div>
              <div className="space-y-3">
                {companies.map((c, idx) => (
                  <div
                    key={idx}
                    className="rounded-md border border-white bg-white px-3 py-2 shadow-sm"
                  >
                    <div className="flex flex-col gap-2 md:flex-row">
                      <input
                        value={c.name}
                        onChange={(e) =>
                          updateCompany(idx, { ...c, name: e.target.value })
                        }
                        className="flex-1 rounded-md border border-gray-200 px-2 py-1 text-sm"
                      />
                      <input
                        value={c.type}
                        onChange={(e) =>
                          updateCompany(idx, { ...c, type: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm md:w-28"
                      />
                      <input
                        value={c.market}
                        onChange={(e) =>
                          updateCompany(idx, { ...c, market: e.target.value })
                        }
                        className="w-full rounded-md border border-gray-200 px-2 py-1 text-sm md:w-28"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-900">
                  外部数据 & AI 辅助
                </h4>
                <button
                  onClick={() => void fetchExternal()}
                  disabled={syncing}
                  className="text-xs text-indigo-600 hover:text-indigo-700 disabled:opacity-50"
                >
                  {syncing ? '同步中...' : '同步外部数据'}
                </button>
              </div>
              <div className="space-y-2 text-xs text-gray-700">
                <p>
                  使用 Settings → External API 配置的 provider 拉取
                  market/finance/news/regulation。
                </p>
                {external && (
                  <div className="rounded-md border border-gray-100 bg-white p-2">
                    {external.evidence.map((ev, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-[11px]"
                      >
                        <span className="font-medium">{ev.provider}</span>
                        <span
                          className={ev.ok ? 'text-green-600' : 'text-red-600'}
                        >
                          {ev.ok ? 'OK' : ev.error || 'error'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <button
                  onClick={injectFromMarket}
                  className="w-full rounded-md border border-indigo-200 bg-white px-2 py-1 text-xs text-indigo-700 hover:border-indigo-300"
                >
                  AI 辅助获取对手（用外部市场数据填充公司）
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <h4 className="text-sm font-semibold text-gray-900">
                运行与状态
              </h4>
              <div className="mt-2 rounded-lg border border-gray-100 bg-white p-3 text-sm text-gray-700">
                <p>场景: {scenario?.id || '保存后生成ID'}</p>
                <p>Run ID: {runId || '未启动'}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => void saveScenario()}
                disabled={saving}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                保存场景
              </button>
              {scenario?.id && (
                <button
                  onClick={() => void startRun()}
                  disabled={saving}
                  className="flex-1 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
                >
                  开始推演
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function safeJson(input: string, fallback: any) {
  try {
    return JSON.parse(input);
  } catch {
    return fallback;
  }
}
