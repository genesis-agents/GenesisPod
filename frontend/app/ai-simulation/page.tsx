'use client';

import { useEffect, useState } from 'react';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';

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

export default function AISimulationPage() {
  const [loading, setLoading] = useState(false);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [runData, setRunData] = useState<any>(null);

  const [companies, setCompanies] = useState<ScenarioFormCompany[]>([
    { name: 'Benchmark Cloud GPU', type: 'benchmark', market: 'Global' },
    { name: 'Startup AI Infra', type: 'startup', market: 'US' },
  ]);
  const [agents, setAgents] = useState<ScenarioFormAgent[]>([
    { role: 'CEO - 蓝军', team: 'BLUE', companyName: 'Benchmark Cloud GPU' },
    { role: 'CEO - 红军', team: 'RED', companyName: 'Startup AI Infra' },
    { role: '监管观察', team: 'GREEN' },
  ]);

  const [form, setForm] = useState({
    name: 'AI算力基础设施推演',
    industry: 'AI Compute Infrastructure',
    region: 'Global',
    goals: {
      targetShare: '守住份额并提升交付速度',
      risk: '控制合规与供应链黑天鹅',
    },
    constraints: {
      blindMove: true,
      cot: true,
      chaosProb: 0.15,
    },
  });

  const addCompany = () => {
    setCompanies((prev) => [
      ...prev,
      { name: `Company ${prev.length + 1}`, type: 'startup', market: 'Global' },
    ]);
  };

  const updateCompany = (index: number, value: ScenarioFormCompany) => {
    setCompanies((prev) => prev.map((c, i) => (i === index ? value : c)));
  };

  const addAgent = () => {
    setAgents((prev) => [
      ...prev,
      { role: `Agent ${prev.length + 1}`, team: 'BLUE' },
    ]);
  };

  const updateAgent = (index: number, value: ScenarioFormAgent) => {
    setAgents((prev) => prev.map((a, i) => (i === index ? value : a)));
  };

  const submitScenario = async () => {
    setLoading(true);
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
        setScenarioId(data.id);
      } else {
        alert(data?.message || '创建失败');
      }
    } catch (err: any) {
      alert(err.message || '创建失败');
    } finally {
      setLoading(false);
    }
  };

  const startRun = async () => {
    if (!scenarioId) return;
    setLoading(true);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          scenarioId,
          rounds: 2,
          params: form.constraints,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setRunId(data.id);
        setRunData(data);
      } else {
        alert(data?.message || '启动失败');
      }
    } catch (err: any) {
      alert(err.message || '启动失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRun = async () => {
    if (!runId) return;
    const res = await fetch(`${config.apiUrl}/simulation/runs/${runId}`, {
      headers: { ...getAuthHeader() },
      credentials: 'include',
    });
    if (res.ok) {
      setRunData(await res.json());
    }
  };

  useEffect(() => {
    if (runId) {
      fetchRun();
    }
  }, [runId]);

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            AI 推演 · AI算力基础设施
          </h1>
          <p className="text-sm text-gray-600">
            按三层架构：裁判（外部数据）、Agent群（蓝/红/绿/Chaos）、人类干预。所有外部数据走
            Settings→External API 已配置接口。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={submitScenario}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
          >
            {scenarioId ? '重新创建场景' : '创建场景'}
          </button>
          <button
            onClick={startRun}
            disabled={!scenarioId || loading}
            className="rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-purple-700 disabled:opacity-50"
          >
            开始推演
          </button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">场景配置</h3>
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
                onChange={(e) => setForm({ ...form, industry: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600">区域</label>
              <input
                value={form.region}
                onChange={(e) => setForm({ ...form, region: e.target.value })}
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

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              公司（自动+手工）
            </h3>
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
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <div className="flex gap-2">
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
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-sm"
                  />
                  <input
                    value={c.market}
                    onChange={(e) =>
                      updateCompany(idx, { ...c, market: e.target.value })
                    }
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-sm"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">
              角色卡（AI生成/手工）
            </h3>
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
                className="rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
              >
                <div className="flex gap-2">
                  <select
                    value={a.team}
                    onChange={(e) =>
                      updateAgent(idx, {
                        ...a,
                        team: e.target.value as ScenarioFormAgent['team'],
                      })
                    }
                    className="w-24 rounded-md border border-gray-200 px-2 py-1 text-sm"
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
                      updateAgent(idx, { ...a, companyName: e.target.value })
                    }
                    className="w-40 rounded-md border border-gray-200 px-2 py-1 text-sm"
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
                      updateAgent(idx, { ...a, memoryPrivate: e.target.value })
                    }
                    rows={2}
                    className="w-full rounded-md border border-gray-200 px-2 py-1 font-mono text-xs"
                  />
                  <textarea
                    value={a.memoryPublic || ''}
                    placeholder='公共记忆（JSON），例：{"newsRef":"最新供应链报道"}'
                    onChange={(e) =>
                      updateAgent(idx, { ...a, memoryPublic: e.target.value })
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

        <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-gray-900">运行与状态</h3>
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 text-sm text-gray-700">
            <p>场景ID: {scenarioId || '未创建'}</p>
            <p>Run ID: {runId || '未启动'}</p>
            <p>状态: {runData?.status || 'N/A'}</p>
            <p>当前回合: {runData?.currentRound ?? '-'}</p>
          </div>
          {runData?.turns && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-600">时间线</h4>
              <div className="max-h-64 overflow-auto rounded-lg border border-gray-100 bg-gray-50 p-3 text-xs text-gray-700">
                {runData.turns.map((t: any) => (
                  <div
                    key={t.id}
                    className="mb-3 rounded-md bg-white p-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">
                        Round {t.roundNumber}
                      </span>
                      <span className="text-gray-500">{t.createdAt}</span>
                    </div>
                    <div className="mt-1 text-gray-800">
                      判定: {t.adjudication?.ruling || 'N/A'}
                    </div>
                    <div className="mt-1 text-gray-500">
                      备注: {t.adjudication?.notes || '—'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
