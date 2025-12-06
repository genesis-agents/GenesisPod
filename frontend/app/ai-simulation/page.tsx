'use client';

import { useEffect, useState } from 'react';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';

interface ScenarioCard {
  id: string;
  name: string;
  industry: string;
  region?: string;
  companies?: any[];
  agents?: any[];
  runs?: any[];
  createdAt: string;
  updatedAt: string;
}

interface ScenarioFormCompany {
  name: string;
  type: string;
  market: string;
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
  goals?: any;
  constraints?: any;
  companies?: ScenarioFormCompany[];
  agents?: ScenarioFormAgent[];
  description?: string;
  badge?: string;
}

export default function AISimulationPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [scenarios, setScenarios] = useState<ScenarioCard[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [seed, setSeed] = useState<ScenarioTemplate | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const templates: ScenarioTemplate[] = [
    {
      name: 'AI算力基础设施',
      industry: 'AI Compute Infrastructure',
      region: 'Global',
      goals: {
        targetShare: '守住份额并提升交付速度',
        risk: '控制合规与供应链黑天鹅',
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
        { role: 'CEO - 蓝军', team: 'BLUE', companyName: 'Benchmark Cloud GPU' },
        { role: 'CEO - 红军', team: 'RED', companyName: 'Startup AI Infra' },
        { role: '监管观察', team: 'GREEN' },
      ],
      description:
        'GPU/芯片/云算力供需、价格战、合规/出口管制与舆情对抗场景',
      badge: '模板',
    },
  ];

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
    if (user) fetchScenarios();
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
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-6xl space-y-6 px-8 py-6">
          {/* Header */}
          <div className="flex items-center justify-between rounded-2xl border border-gray-100 bg-white/80 p-5 shadow-sm backdrop-blur">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/25">
                <svg
                  className="h-6 w-6 text-white"
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
                <h1 className="text-2xl font-bold text-gray-900">AI Simulation</h1>
                <p className="text-sm text-gray-600">
                  多红军/绿军/Chaos + 盲注 + 非理性/黑天鹅，裁判用真实外部数据；默认2轮暂停等待人类介入。
                </p>
              </div>
            </div>
            <button
              onClick={handleCreate}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
            >
              新建推演
            </button>
          </div>

          {/* Templates */}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">行业模板</h3>
                <p className="text-xs text-gray-500">选择模板快速创建推演场景</p>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((t) => (
                <div
                  key={t.name}
                  className="flex cursor-pointer flex-col rounded-xl border border-gray-100 bg-gray-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                  onClick={() => handleTemplate(t)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-base font-semibold text-gray-900">{t.name}</h4>
                      <p className="text-xs text-gray-500">
                        {t.industry} · {t.region || 'Global'}
                      </p>
                    </div>
                    {t.badge && (
                      <span className="rounded-full bg-indigo-100 px-2 py-1 text-[11px] font-medium text-indigo-700">
                        {t.badge}
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-gray-700 line-clamp-3">{t.description}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-600">
                    <span className="rounded-full bg-white px-2 py-1">
                      公司 {t.companies?.length || 0}
                    </span>
                    <span className="rounded-full bg-white px-2 py-1">
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
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900">场景列表</h3>
                <p className="text-xs text-gray-500">
                  点击卡片可查看/编辑，最新运行状态实时展示
                </p>
              </div>
              <button
                onClick={fetchScenarios}
                className="text-xs text-gray-600 hover:text-gray-800"
              >
                刷新
              </button>
            </div>
            {loading ? (
              <div className="py-10 text-center text-sm text-gray-500">加载中...</div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {scenarios.map((s) => {
                  const run = latestRun(s);
                  return (
                    <div
                      key={s.id}
                      className="flex cursor-pointer flex-col rounded-xl border border-gray-100 bg-gray-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                      onClick={() => handleOpen(s)}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-base font-semibold text-gray-900">{s.name}</h4>
                          <p className="text-xs text-gray-500">
                            {s.industry} · {s.region || 'Global'}
                          </p>
                        </div>
                        {run ? (
                          <span className="rounded-full bg-purple-100 px-2 py-1 text-[11px] font-medium text-purple-700">
                            {run.status}
                          </span>
                        ) : (
                          <span className="rounded-full bg-gray-100 px-2 py-1 text-[11px] font-medium text-gray-600">
                            未运行
                          </span>
                        )}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-gray-600">
                        <span className="rounded-full bg-white px-2 py-1">
                          公司 {s.companies?.length || 0}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1">
                          角色 {s.agents?.length || 0}
                        </span>
                        {run && (
                          <span className="rounded-full bg-white px-2 py-1">
                            回合 {run.currentRound ?? 0}
                          </span>
                        )}
                      </div>
                      <div className="mt-2 text-xs text-gray-500">
                        更新于 {new Date(s.updatedAt).toLocaleString()}
                      </div>
                    </div>
                  );
                })}
                <button
                  onClick={handleCreate}
                  className="flex min-h-[150px] flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 text-sm text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                >
                  + 新建推演
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
            fetchScenarios();
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
  scenario: any;
  seed?: ScenarioTemplate | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const preset = scenario || seed || {};
  const defaultConstraints = {
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
    goals: preset.goals || {},
    constraints: preset.params || preset.constraints || defaultConstraints,
  });
  const [companies, setCompanies] = useState(
    preset.companies || [
      { name: 'Benchmark Cloud GPU', type: 'benchmark', market: 'Global' },
      { name: 'Startup AI Infra', type: 'startup', market: 'US' },
    ]
  );
  const [agents, setAgents] = useState(
    preset.agents || [
      { role: 'CEO - 蓝军', team: 'BLUE', companyName: 'Benchmark Cloud GPU' },
      { role: 'CEO - 红军', team: 'RED', companyName: 'Startup AI Infra' },
      { role: '监管观察', team: 'GREEN' },
    ]
  );
  const [saving, setSaving] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

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
          agents: agents.map((a: any) => ({
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
          scenarioId: scenario?.id,
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
    setCompanies((prev: ScenarioFormCompany[]) =>
      prev.map((c: ScenarioFormCompany, i: number) => (i === index ? value : c))
    );
  };
  const addCompany = () =>
    setCompanies((prev: ScenarioFormCompany[]) => [
      ...prev,
      { name: `Company ${prev.length + 1}`, type: 'startup', market: 'Global' },
    ]);
  const updateAgent = (index: number, value: ScenarioFormAgent) => {
    setAgents((prev: ScenarioFormAgent[]) =>
      prev.map((a: ScenarioFormAgent, i: number) => (i === index ? value : a))
    );
  };
  const addAgent = () =>
    setAgents((prev: ScenarioFormAgent[]) => [
      ...prev,
      { role: `Agent ${prev.length + 1}`, team: 'BLUE' },
    ]);

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-6">
      <div className="h-[90vh] w-full max-w-6xl overflow-auto rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-semibold text-gray-900">
              {scenario ? '编辑场景' : '新建场景'}
            </h3>
            <p className="text-xs text-gray-500">
              行业模板：AI算力基础设施，可自定义目标与约束；默认 2 轮暂停。
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
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">目标</label>
                  <textarea
                    value={JSON.stringify(form.goals, null, 2)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        goals: safeJson(e.target.value, form.goals),
                      })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-gray-600">
                    约束 / Chaos / 盲注
                  </label>
                  <textarea
                    value={JSON.stringify(form.constraints, null, 2)}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        constraints: safeJson(e.target.value, form.constraints),
                      })
                    }
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
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
                {agents.map((a: any, idx: number) => (
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
                {companies.map((c: any, idx: number) => (
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
              <h4 className="text-sm font-semibold text-gray-900">运行与状态</h4>
              <div className="mt-2 rounded-lg border border-gray-100 bg-white p-3 text-sm text-gray-700">
                <p>场景: {scenario?.id || '保存后生成ID'}</p>
                <p>Run ID: {runId || '未启动'}</p>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={saveScenario}
                disabled={saving}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              >
                保存场景
              </button>
              {scenario?.id && (
                <button
                  onClick={startRun}
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
