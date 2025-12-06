'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';

interface ScenarioDetail {
  id: string;
  name: string;
  industry: string;
  region?: string;
  goals?: any;
  params?: any;
  companies?: any[];
  agents?: any[];
  runs?: any[];
  createdAt: string;
  updatedAt: string;
}

interface RunDetail {
  id: string;
  status: string;
  currentRound: number;
  rounds: number;
  turns?: any[];
  worldState?: any;
  evidenceTrail?: any;
  createdAt: string;
  updatedAt: string;
}

export default function ScenarioDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const scenarioId = params?.id as string;

  const [scenario, setScenario] = useState<ScenarioDetail | null>(null);
  const [activeRun, setActiveRun] = useState<RunDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'overview' | 'companies' | 'agents' | 'runs'>(
    'overview'
  );
  const [startingRun, setStartingRun] = useState(false);

  useEffect(() => {
    if (user && scenarioId) {
      void fetchScenario();
    }
  }, [user, scenarioId]);

  const fetchScenario = async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/scenarios/${scenarioId}`,
        {
          headers: { ...getAuthHeader() },
          credentials: 'include',
        }
      );
      if (res.ok) {
        const data = await res.json();
        setScenario(data);
        // If there are runs, load the latest one
        if (data.runs && data.runs.length > 0) {
          await fetchRun(data.runs[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch scenario:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchRun = async (runId: string) => {
    try {
      const res = await fetch(`${config.apiUrl}/simulation/runs/${runId}`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRun(data);
      }
    } catch (err) {
      console.error('Failed to fetch run:', err);
    }
  };

  const handleStartRun = async () => {
    if (!scenario) return;
    setStartingRun(true);
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
          rounds: scenario.params?.humanBreakEvery
            ? scenario.params.humanBreakEvery * 5
            : 10,
          params: scenario.params,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setActiveRun(data);
        setTab('runs');
        // Navigate to run page
        router.push(`/ai-simulation/run/${data.id}`);
      }
    } catch (err) {
      console.error('Failed to start run:', err);
    } finally {
      setStartingRun(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">加载中...</div>
        </main>
      </div>
    );
  }

  if (!user || !scenario) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">场景不存在或无权访问</div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-7xl space-y-6 px-8 py-6">
          {/* Header */}
          <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-4">
                <button
                  onClick={() => router.push('/ai-simulation')}
                  className="flex h-10 w-10 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
                >
                  <svg
                    className="h-5 w-5 text-gray-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-2xl">
                  ⚔️
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">
                    {scenario.name}
                  </h1>
                  <p className="text-sm text-gray-600">
                    {scenario.industry} · {scenario.region || 'Global'}
                  </p>
                  <div className="mt-2 flex gap-2">
                    <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
                      {scenario.companies?.length || 0} 公司
                    </span>
                    <span className="rounded-full bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-600">
                      {scenario.agents?.length || 0} 角色
                    </span>
                    {activeRun && (
                      <span className="rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                        运行中
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    router.push(`/ai-simulation/edit/${scenario.id}`)
                  }
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  编辑
                </button>
                <button
                  onClick={handleStartRun}
                  disabled={startingRun || activeRun?.status === 'RUNNING'}
                  className="rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50"
                >
                  {startingRun
                    ? '启动中...'
                    : activeRun?.status === 'RUNNING'
                      ? '运行中'
                      : '开始推演'}
                </button>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="rounded-2xl border border-gray-100 bg-white shadow-sm">
            <div className="border-b border-gray-200">
              <div className="flex">
                {[
                  { key: 'overview', label: '概览' },
                  { key: 'companies', label: '公司' },
                  { key: 'agents', label: '角色' },
                  { key: 'runs', label: '运行历史' },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key as any)}
                    className={`border-b-2 px-6 py-3 text-sm font-medium ${
                      tab === item.key
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="p-6">
              {/* Overview Tab */}
              {tab === 'overview' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="mb-3 text-sm font-semibold text-gray-900">
                      目标与约束
                    </h3>
                    <div className="grid gap-4 md:grid-cols-2">
                      {scenario.goals?.targetShare && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-medium text-gray-500">
                            目标
                          </div>
                          <div className="mt-1 text-sm text-gray-900">
                            {scenario.goals.targetShare}
                          </div>
                        </div>
                      )}
                      {scenario.goals?.risk && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-medium text-gray-500">
                            风险/合规
                          </div>
                          <div className="mt-1 text-sm text-gray-900">
                            {scenario.goals.risk}
                          </div>
                        </div>
                      )}
                      {scenario.goals?.growth && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-medium text-gray-500">
                            增长
                          </div>
                          <div className="mt-1 text-sm text-gray-900">
                            {scenario.goals.growth}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {scenario.params && (
                    <div>
                      <h3 className="mb-3 text-sm font-semibold text-gray-900">
                        对战参数
                      </h3>
                      <div className="grid gap-4 md:grid-cols-4">
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-medium text-gray-500">
                            盲注
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {scenario.params.blindMove ? '✓ 启用' : '✗ 禁用'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-medium text-gray-500">
                            CoT 强制
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {scenario.params.cot ? '✓ 启用' : '✗ 禁用'}
                          </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-medium text-gray-500">
                            Chaos 概率
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            {Math.round((scenario.params.chaosProb || 0) * 100)}
                            %
                          </div>
                        </div>
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="text-xs font-medium text-gray-500">
                            人类干预
                          </div>
                          <div className="mt-1 text-sm font-semibold text-gray-900">
                            每 {scenario.params.humanBreakEvery || 2} 轮
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Companies Tab */}
              {tab === 'companies' && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {scenario.companies?.map((company: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="font-semibold text-gray-900">
                            {company.name}
                          </h4>
                          <p className="text-xs text-gray-500">
                            {company.type} · {company.market}
                          </p>
                        </div>
                      </div>
                      {company.metrics && (
                        <div className="mt-3 space-y-1 text-xs">
                          {Object.entries(company.metrics)
                            .slice(0, 3)
                            .map(([key, value]) => (
                              <div key={key} className="flex justify-between">
                                <span className="text-gray-500">{key}:</span>
                                <span className="font-medium text-gray-900">
                                  {String(value)}
                                </span>
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Agents Tab */}
              {tab === 'agents' && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {scenario.agents?.map((agent: any, idx: number) => (
                    <div
                      key={idx}
                      className="rounded-lg border border-gray-200 bg-gray-50 p-4"
                    >
                      <div className="mb-2 flex items-center justify-between">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            agent.team === 'BLUE'
                              ? 'bg-blue-100 text-blue-700'
                              : agent.team === 'RED'
                                ? 'bg-red-100 text-red-700'
                                : agent.team === 'GREEN'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-purple-100 text-purple-700'
                          }`}
                        >
                          {agent.team}
                        </span>
                      </div>
                      <h4 className="font-semibold text-gray-900">
                        {agent.role}
                      </h4>
                      {agent.companyName && (
                        <p className="text-xs text-gray-500">
                          {agent.companyName}
                        </p>
                      )}
                      {agent.persona && (
                        <div className="mt-2 rounded border border-gray-200 bg-white p-2 text-xs">
                          <pre className="whitespace-pre-wrap font-mono">
                            {typeof agent.persona === 'string'
                              ? agent.persona
                              : JSON.stringify(agent.persona, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Runs Tab */}
              {tab === 'runs' && (
                <div className="space-y-4">
                  {scenario.runs && scenario.runs.length > 0 ? (
                    scenario.runs.map((run: any) => (
                      <div
                        key={run.id}
                        className="cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-4 hover:border-indigo-300 hover:shadow-md"
                        onClick={() =>
                          router.push(`/ai-simulation/run/${run.id}`)
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-900">
                                Run #{run.id.slice(0, 8)}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                  run.status === 'RUNNING'
                                    ? 'bg-green-100 text-green-700'
                                    : run.status === 'COMPLETED'
                                      ? 'bg-blue-100 text-blue-700'
                                      : run.status === 'PAUSED'
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : 'bg-gray-100 text-gray-700'
                                }`}
                              >
                                {run.status}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-gray-500">
                              回合 {run.currentRound || 0} / {run.rounds || 0}
                            </p>
                          </div>
                          <div className="text-xs text-gray-500">
                            {new Date(run.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="py-12 text-center text-sm text-gray-500">
                      暂无运行记录
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
