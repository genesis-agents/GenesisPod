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
  const [tab, setTab] = useState<
    'overview' | 'companies' | 'agents' | 'runs' | 'report'
  >('overview');
  const [startingRun, setStartingRun] = useState(false);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [selectedRole, setSelectedRole] = useState<string>('observer'); // observer or agent id
  const [simulationMode, setSimulationMode] = useState<'auto' | 'interactive'>(
    'interactive'
  ); // 推演模式

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
    // 先弹出角色选择模态框
    setShowRoleModal(true);
  };

  const [startError, setStartError] = useState<string | null>(null);

  const confirmStartRun = async () => {
    if (!scenario) return;
    setShowRoleModal(false);
    setStartingRun(true);
    setStartError(null);

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
          params: {
            ...scenario.params,
            userRole: selectedRole, // 传递用户选择的角色
            simulationMode: simulationMode, // 传递推演模式
            // 全自动模式下不需要人工暂停
            humanBreakEvery:
              simulationMode === 'auto'
                ? 0
                : scenario.params?.humanBreakEvery || 2,
          },
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.id) {
          // 立即导航到实际的run页面
          const actualUrl = `/ai-simulation/run/${data.id}?role=${selectedRole}&mode=${simulationMode}`;
          console.log('[Simulation] Navigating immediately to:', actualUrl);
          // 使用 window.location 确保跳转（避免 Next.js router 可能的问题）
          window.location.href = actualUrl;
        } else {
          setStartError('服务器返回了无效的数据');
          setStartingRun(false);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        setStartError(errorData.message || `启动失败 (${res.status})`);
        setStartingRun(false);
      }
    } catch (err: any) {
      console.error('Failed to start run:', err);
      setStartError(err.message || '网络错误，请重试');
      setStartingRun(false);
    }
  };

  // 删除运行记录
  const [deletingRunId, setDeletingRunId] = useState<string | null>(null);

  const handleDeleteRun = async (runId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止点击事件冒泡到父元素
    if (!confirm('确定要删除此推演记录吗？此操作不可恢复。')) {
      return;
    }

    setDeletingRunId(runId);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/runs/${runId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });

      if (res.ok) {
        // 刷新场景数据以更新运行列表
        await fetchScenario();
        // 如果删除的是当前激活的run，清除它
        if (activeRun?.id === runId) {
          setActiveRun(null);
        }
      } else {
        const errorData = await res.json().catch(() => ({}));
        alert(errorData.message || '删除失败');
      }
    } catch (err: any) {
      console.error('Failed to delete run:', err);
      alert('删除失败: ' + (err.message || '网络错误'));
    } finally {
      setDeletingRunId(null);
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

  // 获取蓝军角色列表（用户可以扮演的角色）
  const blueAgents =
    scenario?.agents?.filter((a: any) => a.team === 'BLUE') || [];

  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />

      {/* 启动中全屏遮罩 */}
      {startingRun && (
        <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-gradient-to-br from-indigo-900/95 via-purple-900/95 to-indigo-900/95">
          <div className="text-center">
            {/* 动画圆环 */}
            <div className="relative mx-auto mb-8 h-32 w-32">
              <div
                className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-indigo-400"
                style={{ animationDuration: '1.5s' }}
              />
              <div
                className="absolute inset-2 animate-spin rounded-full border-4 border-transparent border-t-purple-400"
                style={{
                  animationDuration: '2s',
                  animationDirection: 'reverse',
                }}
              />
              <div
                className="absolute inset-4 animate-spin rounded-full border-4 border-transparent border-t-pink-400"
                style={{ animationDuration: '2.5s' }}
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <svg
                  className="h-12 w-12 animate-pulse text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
            </div>
            <h2 className="mb-2 text-2xl font-bold text-white">
              正在启动推演引擎
            </h2>
            <p className="mb-4 text-indigo-200">
              {simulationMode === 'auto'
                ? '全自动推演模式'
                : '人机协同推演模式'}{' '}
              · {selectedRole === 'observer' ? '上帝视角' : '角色扮演'}
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-indigo-300">
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-indigo-400"
                style={{ animationDelay: '0ms' }}
              />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-purple-400"
                style={{ animationDelay: '150ms' }}
              />
              <div
                className="h-2 w-2 animate-bounce rounded-full bg-pink-400"
                style={{ animationDelay: '300ms' }}
              />
              <span className="ml-2">初始化AI角色，请稍候...</span>
            </div>
          </div>
        </div>
      )}

      {/* 启动错误提示 */}
      {startError && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50">
          <div className="max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
              <svg
                className="h-6 w-6 text-red-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900">
              启动失败
            </h3>
            <p className="mb-4 text-sm text-gray-600">{startError}</p>
            <button
              onClick={() => setStartError(null)}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
            >
              关闭
            </button>
          </div>
        </div>
      )}

      {/* 角色选择模态框 */}
      {showRoleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              配置推演参数
            </h3>

            {/* 推演模式选择 */}
            <div className="mb-6">
              <div className="mb-3 text-sm font-medium text-gray-700">
                推演模式
              </div>
              <div className="grid grid-cols-2 gap-3">
                {/* 全自动推演 */}
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    simulationMode === 'auto'
                      ? 'border-green-500 bg-green-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="auto"
                    checked={simulationMode === 'auto'}
                    onChange={() => setSimulationMode('auto')}
                    className="sr-only"
                  />
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      simulationMode === 'auto' ? 'bg-green-100' : 'bg-gray-100'
                    }`}
                  >
                    <svg
                      className={`h-6 w-6 ${simulationMode === 'auto' ? 'text-green-600' : 'text-gray-400'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <div
                      className={`font-medium ${simulationMode === 'auto' ? 'text-green-700' : 'text-gray-700'}`}
                    >
                      全自动推演
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                      AI完全自主运行，一键到底
                    </p>
                  </div>
                </label>

                {/* 人工参与推演 */}
                <label
                  className={`flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all ${
                    simulationMode === 'interactive'
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value="interactive"
                    checked={simulationMode === 'interactive'}
                    onChange={() => setSimulationMode('interactive')}
                    className="sr-only"
                  />
                  <div
                    className={`flex h-12 w-12 items-center justify-center rounded-full ${
                      simulationMode === 'interactive'
                        ? 'bg-indigo-100'
                        : 'bg-gray-100'
                    }`}
                  >
                    <svg
                      className={`h-6 w-6 ${simulationMode === 'interactive' ? 'text-indigo-600' : 'text-gray-400'}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                      />
                    </svg>
                  </div>
                  <div className="text-center">
                    <div
                      className={`font-medium ${simulationMode === 'interactive' ? 'text-indigo-700' : 'text-gray-700'}`}
                    >
                      人机协同推演
                    </div>
                    <p className="mt-1 text-[10px] text-gray-500">
                      每{scenario?.params?.humanBreakEvery || 2}回合暂停，可干预
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* 分隔线 */}
            <div className="mb-4 border-t border-gray-200" />

            <div className="mb-3 text-sm font-medium text-gray-700">
              选择观察视角
            </div>
            <p className="mb-4 text-xs text-gray-500">
              不同角色会看到不同的信息。
              {simulationMode === 'auto'
                ? '全自动模式下推荐使用上帝视角。'
                : '人机协同模式下可扮演蓝军角色参与决策。'}
            </p>

            <div className="mb-6 space-y-3">
              {/* 观察者角色 */}
              <label
                className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all ${
                  selectedRole === 'observer'
                    ? 'border-indigo-500 bg-indigo-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value="observer"
                  checked={selectedRole === 'observer'}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="mt-1"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">👁️</span>
                    <span className="font-medium text-gray-900">
                      战略观察者（上帝视角）
                    </span>
                    <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                      推荐
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    以第三方视角观看所有阵营的行动和内心想法，全局把控，发现盲点和机会。
                    适合学习和分析。
                  </p>
                </div>
              </label>

              {/* 分隔线 */}
              <div className="flex items-center gap-2 py-2">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400">
                  或扮演蓝军角色参与决策
                </span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              {/* 蓝军角色列表 */}
              {blueAgents.length > 0 ? (
                blueAgents.map((agent: any) => (
                  <label
                    key={agent.role}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border-2 p-4 transition-all ${
                      selectedRole === agent.role
                        ? 'border-blue-500 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="role"
                      value={agent.role}
                      checked={selectedRole === agent.role}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                          🔵 蓝军
                        </span>
                        <span className="font-medium text-gray-900">
                          {agent.role}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-gray-500">
                        {agent.companyName ? `${agent.companyName} - ` : ''}
                        扮演此角色参与决策，只能看到该视角的信息。
                      </p>
                    </div>
                  </label>
                ))
              ) : (
                <div className="rounded-lg bg-gray-50 p-4 text-center text-xs text-gray-500">
                  当前场景未配置蓝军角色，请先在"角色配置"中添加。
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowRoleModal(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={confirmStartRun}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
                  simulationMode === 'auto'
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-indigo-600 hover:bg-indigo-700'
                }`}
              >
                {simulationMode === 'auto'
                  ? '开始全自动推演'
                  : '开始人机协同推演'}
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="flex-1 overflow-auto">
        <div className="space-y-6 px-8 py-6">
          {/* Header - 与系统其他页面一致 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/ai-simulation')}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <svg
                  className="h-4 w-4 text-gray-600"
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
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-gray-900">
                    {scenario.name}
                  </h1>
                  <div className="flex gap-2">
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
                <p className="mt-1 text-sm text-gray-500">
                  {scenario.industry} · {scenario.region || 'Global'}
                </p>
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
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {startingRun
                  ? '启动中...'
                  : activeRun?.status === 'RUNNING'
                    ? '运行中'
                    : '开始推演'}
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="rounded-xl border border-gray-200 bg-white">
            <div className="border-b border-gray-200">
              <div className="flex">
                {[
                  {
                    key: 'overview',
                    label: '概览',
                    icon: (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                        />
                      </svg>
                    ),
                  },
                  {
                    key: 'companies',
                    label: '公司棋盘',
                    icon: (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                        />
                      </svg>
                    ),
                  },
                  {
                    key: 'agents',
                    label: '角色配置',
                    icon: (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                        />
                      </svg>
                    ),
                  },
                  {
                    key: 'runs',
                    label: '运行历史',
                    icon: (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                    ),
                  },
                  {
                    key: 'report',
                    label: '复盘报告',
                    icon: (
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    ),
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setTab(item.key as any)}
                    className={`flex items-center gap-2 border-b-2 px-6 py-3 text-sm font-medium transition-colors ${
                      tab === item.key
                        ? 'border-indigo-600 text-indigo-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}
                  >
                    {item.icon}
                    <span>{item.label}</span>
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

              {/* Companies Tab - 公司棋盘 */}
              {tab === 'companies' && (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {scenario.companies?.map((company: any, idx: number) => (
                      <div
                        key={idx}
                        className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:border-indigo-200 hover:shadow-md"
                      >
                        {/* Header */}
                        <div className="mb-4 flex items-start justify-between">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-12 w-12 items-center justify-center rounded-xl text-white ${
                                company.type === 'benchmark'
                                  ? 'bg-gradient-to-br from-amber-400 to-orange-500'
                                  : company.type === 'challenger'
                                    ? 'bg-gradient-to-br from-blue-400 to-indigo-500'
                                    : company.type === 'startup'
                                      ? 'bg-gradient-to-br from-green-400 to-emerald-500'
                                      : 'bg-gradient-to-br from-gray-400 to-gray-500'
                              }`}
                            >
                              <svg
                                className="h-6 w-6"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                                />
                              </svg>
                            </div>
                            <div>
                              <h4 className="font-semibold text-gray-900">
                                {company.name}
                              </h4>
                              <div className="flex items-center gap-2 text-xs text-gray-500">
                                <span
                                  className={`rounded-full px-2 py-0.5 ${
                                    company.type === 'benchmark'
                                      ? 'bg-amber-100 text-amber-700'
                                      : company.type === 'challenger'
                                        ? 'bg-blue-100 text-blue-700'
                                        : company.type === 'startup'
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-gray-100 text-gray-700'
                                  }`}
                                >
                                  {company.type === 'benchmark'
                                    ? '标杆'
                                    : company.type === 'challenger'
                                      ? '挑战者'
                                      : company.type === 'startup'
                                        ? '新势力'
                                        : company.type}
                                </span>
                                <span>·</span>
                                <span>{company.market}</span>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Metrics Grid */}
                        {company.metrics ? (
                          <div className="space-y-3">
                            {/* Financial */}
                            <div className="rounded-lg bg-gray-50 p-3">
                              <div className="mb-2 text-xs font-medium text-gray-500">
                                财务指标
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {company.metrics.cash !== undefined && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      现金
                                    </span>
                                    <span className="text-sm font-semibold text-gray-900">
                                      ${company.metrics.cash}M
                                    </span>
                                  </div>
                                )}
                                {company.metrics.share !== undefined && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      份额
                                    </span>
                                    <span className="text-sm font-semibold text-indigo-600">
                                      {company.metrics.share}%
                                    </span>
                                  </div>
                                )}
                                {company.metrics.margin !== undefined && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      毛利
                                    </span>
                                    <span className="text-sm font-semibold text-green-600">
                                      {company.metrics.margin}%
                                    </span>
                                  </div>
                                )}
                                {company.metrics.debt !== undefined && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      负债
                                    </span>
                                    <span className="text-sm font-semibold text-red-600">
                                      ${company.metrics.debt}M
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Operations */}
                            <div className="rounded-lg bg-gray-50 p-3">
                              <div className="mb-2 text-xs font-medium text-gray-500">
                                运营指标
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                {company.metrics.capacity !== undefined && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      产能
                                    </span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {company.metrics.capacity}
                                    </span>
                                  </div>
                                )}
                                {company.metrics.inventory !== undefined && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      库存
                                    </span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {company.metrics.inventory}
                                    </span>
                                  </div>
                                )}
                                {company.metrics.delivery && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      交付
                                    </span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {company.metrics.delivery}
                                    </span>
                                  </div>
                                )}
                                {company.metrics.priceBand && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-gray-500">
                                      价格带
                                    </span>
                                    <span className="text-sm font-medium text-gray-900">
                                      {company.metrics.priceBand}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Share Bar */}
                            {company.metrics.share !== undefined && (
                              <div className="mt-2">
                                <div className="mb-1 flex justify-between text-xs">
                                  <span className="text-gray-500">
                                    市场份额
                                  </span>
                                  <span className="font-medium text-indigo-600">
                                    {company.metrics.share}%
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-gray-200">
                                  <div
                                    className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                                    style={{
                                      width: `${Math.min(company.metrics.share, 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="rounded-lg bg-gray-50 py-6 text-center text-xs text-gray-500">
                            暂无详细指标
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {scenario.companies?.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                      <h4 className="text-sm font-medium text-gray-900">
                        暂无公司配置
                      </h4>
                      <p className="mt-1 text-xs text-gray-500">
                        请编辑场景添加参与推演的公司
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Agents Tab */}
              {tab === 'agents' && (
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {scenario.agents?.map((agent: any, idx: number) => {
                    // 解析 persona JSON
                    let persona: any = {};
                    try {
                      persona =
                        typeof agent.persona === 'string'
                          ? JSON.parse(agent.persona)
                          : agent.persona || {};
                    } catch {
                      persona = {};
                    }

                    const teamConfigMap: Record<
                      string,
                      {
                        label: string;
                        bg: string;
                        text: string;
                        border: string;
                      }
                    > = {
                      BLUE: {
                        label: '🔵 蓝军',
                        bg: 'bg-blue-100',
                        text: 'text-blue-700',
                        border: 'border-blue-200',
                      },
                      RED: {
                        label: '🔴 红军',
                        bg: 'bg-red-100',
                        text: 'text-red-700',
                        border: 'border-red-200',
                      },
                      GREEN: {
                        label: '🟢 绿军',
                        bg: 'bg-green-100',
                        text: 'text-green-700',
                        border: 'border-green-200',
                      },
                      CHAOS: {
                        label: '🟣 混沌',
                        bg: 'bg-purple-100',
                        text: 'text-purple-700',
                        border: 'border-purple-200',
                      },
                    };
                    const teamConfig = teamConfigMap[agent.team as string] || {
                      label: agent.team,
                      bg: 'bg-gray-100',
                      text: 'text-gray-700',
                      border: 'border-gray-200',
                    };

                    return (
                      <div
                        key={idx}
                        className={`rounded-xl border-2 ${teamConfig.border} bg-white p-4 shadow-sm`}
                      >
                        {/* Header */}
                        <div className="mb-3 flex items-center justify-between">
                          <span
                            className={`rounded-full ${teamConfig.bg} ${teamConfig.text} px-2.5 py-1 text-xs font-medium`}
                          >
                            {teamConfig.label}
                          </span>
                          {persona.riskTolerance !== undefined && (
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                persona.riskTolerance > 70
                                  ? 'bg-red-100 text-red-700'
                                  : persona.riskTolerance > 40
                                    ? 'bg-amber-100 text-amber-700'
                                    : 'bg-green-100 text-green-700'
                              }`}
                            >
                              风险 {persona.riskTolerance}%
                            </span>
                          )}
                        </div>

                        {/* Role & Company */}
                        <h4 className="text-base font-bold text-gray-900">
                          {agent.role}
                        </h4>
                        {agent.companyName && (
                          <p className="mt-0.5 text-sm text-gray-500">
                            {agent.companyName}
                          </p>
                        )}

                        {/* Persona - 友好显示 */}
                        {Object.keys(persona).length > 0 && (
                          <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
                            {persona.traits && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-400">
                                  🎭
                                </span>
                                <div>
                                  <span className="text-[10px] font-medium uppercase text-gray-400">
                                    性格
                                  </span>
                                  <p className="text-xs text-gray-700">
                                    {persona.traits}
                                  </p>
                                </div>
                              </div>
                            )}
                            {persona.biases && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-400">
                                  ⚡
                                </span>
                                <div>
                                  <span className="text-[10px] font-medium uppercase text-gray-400">
                                    偏见
                                  </span>
                                  <p className="text-xs text-gray-700">
                                    {persona.biases}
                                  </p>
                                </div>
                              </div>
                            )}
                            {persona.pressure && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-400">
                                  💢
                                </span>
                                <div>
                                  <span className="text-[10px] font-medium uppercase text-gray-400">
                                    压力源
                                  </span>
                                  <p className="text-xs text-gray-700">
                                    {persona.pressure}
                                  </p>
                                </div>
                              </div>
                            )}
                            {persona.timePref && (
                              <div className="flex items-start gap-2">
                                <span className="text-xs text-gray-400">
                                  ⏱️
                                </span>
                                <div>
                                  <span className="text-[10px] font-medium uppercase text-gray-400">
                                    时间偏好
                                  </span>
                                  <p className="text-xs text-gray-700">
                                    {persona.timePref}
                                  </p>
                                </div>
                              </div>
                            )}
                            {/* 显示其他未知字段的摘要 */}
                            {Object.keys(persona).filter(
                              (k) =>
                                ![
                                  'traits',
                                  'biases',
                                  'pressure',
                                  'timePref',
                                  'riskTolerance',
                                  'compliance',
                                ].includes(k)
                            ).length > 0 && (
                              <details className="text-xs">
                                <summary className="cursor-pointer text-gray-400 hover:text-gray-600">
                                  更多配置...
                                </summary>
                                <div className="mt-1 rounded bg-gray-50 p-2 font-mono text-[10px] text-gray-500">
                                  {Object.entries(persona)
                                    .filter(
                                      ([k]) =>
                                        ![
                                          'traits',
                                          'biases',
                                          'pressure',
                                          'timePref',
                                          'riskTolerance',
                                          'compliance',
                                        ].includes(k)
                                    )
                                    .map(([k, v]) => `${k}: ${v}`)
                                    .join(', ')}
                                </div>
                              </details>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Runs Tab */}
              {tab === 'runs' && (
                <div className="space-y-4">
                  {scenario.runs && scenario.runs.length > 0 ? (
                    scenario.runs.map((run: any) => (
                      <div
                        key={run.id}
                        className="cursor-pointer rounded-lg border border-gray-200 bg-gray-50 p-4 transition-all hover:border-indigo-300 hover:shadow-md"
                        onClick={() =>
                          router.push(`/ai-simulation/run/${run.id}`)
                        }
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full ${
                                run.status === 'RUNNING'
                                  ? 'bg-green-100'
                                  : run.status === 'COMPLETED'
                                    ? 'bg-blue-100'
                                    : run.status === 'PAUSED'
                                      ? 'bg-yellow-100'
                                      : 'bg-gray-100'
                              }`}
                            >
                              {run.status === 'RUNNING' ? (
                                <span className="h-3 w-3 animate-pulse rounded-full bg-green-500" />
                              ) : run.status === 'COMPLETED' ? (
                                '✓'
                              ) : run.status === 'PAUSED' ? (
                                '⏸'
                              ) : (
                                '○'
                              )}
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900">
                                  推演 #{run.id.slice(0, 8)}
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
                                  {run.status === 'RUNNING'
                                    ? '运行中'
                                    : run.status === 'COMPLETED'
                                      ? '已完成'
                                      : run.status === 'PAUSED'
                                        ? '已暂停'
                                        : run.status}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-gray-500">
                                回合进度: {run.currentRound || 0} /{' '}
                                {run.rounds || 0}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <div className="text-xs text-gray-500">
                                {new Date(run.createdAt).toLocaleString()}
                              </div>
                              <div className="mt-1 h-1.5 w-24 rounded-full bg-gray-200">
                                <div
                                  className="h-1.5 rounded-full bg-indigo-500"
                                  style={{
                                    width: `${run.rounds ? (run.currentRound / run.rounds) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                            </div>
                            {/* 删除按钮 */}
                            <button
                              onClick={(e) => handleDeleteRun(run.id, e)}
                              disabled={deletingRunId === run.id}
                              className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                              title="删除此推演记录"
                            >
                              {deletingRunId === run.id ? (
                                <svg
                                  className="h-4 w-4 animate-spin"
                                  fill="none"
                                  viewBox="0 0 24 24"
                                >
                                  <circle
                                    className="opacity-25"
                                    cx="12"
                                    cy="12"
                                    r="10"
                                    stroke="currentColor"
                                    strokeWidth="4"
                                  />
                                  <path
                                    className="opacity-75"
                                    fill="currentColor"
                                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                  />
                                </svg>
                              ) : (
                                <svg
                                  className="h-4 w-4"
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              )}
                            </button>
                            {/* 查看详情箭头 */}
                            <svg
                              className="h-5 w-5 text-gray-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 5l7 7-7 7"
                              />
                            </svg>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
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
                          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      <h4 className="mt-4 text-sm font-medium text-gray-900">
                        暂无运行记录
                      </h4>
                      <p className="mt-1 text-xs text-gray-500">
                        点击"开始推演"启动第一次战略模拟
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Report Tab */}
              {tab === 'report' && (
                <div className="space-y-6">
                  {/* Report Version Toggle */}
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                        <svg
                          className="h-5 w-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-gray-900">
                          复盘报告
                        </h3>
                        <p className="text-xs text-gray-500">
                          分析推演过程中的决策、偏见和盲点
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700">
                        公开版
                      </button>
                      <button className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
                        内部版
                      </button>
                    </div>
                  </div>

                  {activeRun?.status === 'COMPLETED' ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      {/* Key Insights */}
                      <div className="rounded-xl border border-gray-200 bg-white p-5">
                        <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                              />
                            </svg>
                          </span>
                          关键洞察
                        </h4>
                        <div className="space-y-3">
                          <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                            <div className="font-medium">决策偏见识别</div>
                            <p className="mt-1 text-xs">
                              蓝军CEO展现了典型的"损失厌恶"偏见，在市场份额下降时过度保守
                            </p>
                          </div>
                          <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-800">
                            <div className="font-medium">关键转折点</div>
                            <p className="mt-1 text-xs">
                              第3回合红军的激进定价策略改变了整体市场格局
                            </p>
                          </div>
                          <div className="rounded-lg bg-purple-50 p-3 text-sm text-purple-800">
                            <div className="font-medium">反事实分析</div>
                            <p className="mt-1 text-xs">
                              如果蓝军在第2回合选择扩产而非观望，市场份额可能提升8%
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Blindspots */}
                      <div className="rounded-xl border border-gray-200 bg-white p-5">
                        <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600">
                            <svg
                              className="h-3.5 w-3.5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                              />
                            </svg>
                          </span>
                          盲点与风险
                        </h4>
                        <div className="space-y-3">
                          <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50/50 p-3">
                            <span className="mt-0.5 h-2 w-2 rounded-full bg-red-500" />
                            <div className="text-sm text-gray-700">
                              <div className="font-medium text-red-800">
                                供应链依赖风险
                              </div>
                              <p className="mt-0.5 text-xs text-gray-600">
                                所有参与方都忽视了对关键供应商的集中依赖风险
                              </p>
                            </div>
                          </div>
                          <div className="flex items-start gap-3 rounded-lg border border-orange-100 bg-orange-50/50 p-3">
                            <span className="mt-0.5 h-2 w-2 rounded-full bg-orange-500" />
                            <div className="text-sm text-gray-700">
                              <div className="font-medium text-orange-800">
                                合规合规盲区
                              </div>
                              <p className="mt-0.5 text-xs text-gray-600">
                                红军在第4回合的定价策略可能触发反垄断审查
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Export Options */}
                      <div className="col-span-full rounded-xl border border-gray-200 bg-white p-5">
                        <h4 className="mb-4 text-sm font-semibold text-gray-900">
                          导出报告
                        </h4>
                        <div className="flex gap-3">
                          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            PDF 报告
                          </button>
                          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                              />
                            </svg>
                            Markdown
                          </button>
                          <button className="flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
                            <svg
                              className="h-4 w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                              />
                            </svg>
                            JSON 数据
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
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
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                      <h4 className="mt-4 text-sm font-medium text-gray-900">
                        暂无复盘报告
                      </h4>
                      <p className="mt-1 text-xs text-gray-500">
                        完成一次完整推演后，系统将自动生成复盘分析报告
                      </p>
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
