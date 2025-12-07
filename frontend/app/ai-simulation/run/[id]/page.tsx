'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Sidebar from '@/components/layout/Sidebar';
import { useAuth } from '@/contexts/AuthContext';
import { config } from '@/lib/config';
import { getAuthHeader } from '@/lib/auth';
import {
  Play,
  Pause,
  StopCircle,
  RefreshCw,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';

interface Turn {
  id: string;
  roundNumber: number;
  submissions?: any;
  adjudication?: any;
  evidence?: any;
  worldState?: any;
  createdAt: string;
}

interface Run {
  id: string;
  scenarioId: string;
  status: 'PENDING' | 'RUNNING' | 'PAUSED' | 'COMPLETED' | 'FAILED';
  currentRound: number;
  rounds: number;
  params?: any;
  worldState?: any;
  evidenceTrail?: any;
  turns?: Turn[];
  scenario?: {
    id: string;
    name: string;
    industry: string;
    companies?: any[];
    agents?: any[];
  };
  createdAt: string;
  updatedAt: string;
}

export default function RunConsolePage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const runId = params?.id as string;

  const [run, setRun] = useState<Run | null>(null);
  const [loading, setLoading] = useState(true);
  const [intervening, setIntervening] = useState(false);
  const [interventionText, setInterventionText] = useState('');
  const timelineEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (user && runId) {
      void fetchRun();

      // Use polling instead of SSE to avoid auth issues
      // Poll every 2 seconds when run is active
      const pollInterval = setInterval(() => {
        void fetchRun();
      }, 2000);

      return () => {
        clearInterval(pollInterval);
      };
    }
  }, [user, runId]);

  useEffect(() => {
    // Auto-scroll to bottom when new turns are added
    timelineEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [run?.turns?.length]);

  const fetchRun = async () => {
    try {
      const res = await fetch(`${config.apiUrl}/simulation/runs/${runId}`, {
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      if (res.ok) {
        const data = await res.json();
        setRun(data);
      }
    } catch (err) {
      console.error('Failed to fetch run:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResume = async () => {
    try {
      await fetch(`${config.apiUrl}/simulation/runs/${runId}/resume`, {
        method: 'PATCH',
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      await fetchRun();
    } catch (err) {
      console.error('Failed to resume run:', err);
    }
  };

  const handlePause = async () => {
    try {
      await fetch(`${config.apiUrl}/simulation/runs/${runId}/pause`, {
        method: 'PATCH',
        headers: { ...getAuthHeader() },
        credentials: 'include',
      });
      await fetchRun();
    } catch (err) {
      console.error('Failed to pause run:', err);
    }
  };

  const handleIntervention = async () => {
    if (!interventionText.trim()) return;
    setIntervening(true);
    try {
      await fetch(`${config.apiUrl}/simulation/runs/${runId}/intervene`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({ message: interventionText }),
      });
      setInterventionText('');
      await fetchRun();
    } catch (err) {
      console.error('Failed to intervene:', err);
    } finally {
      setIntervening(false);
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

  if (!user || !run) {
    return (
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex flex-1 items-center justify-center">
          <div className="text-gray-500">推演不存在或无权访问</div>
        </main>
      </div>
    );
  }

  const progress = run.rounds > 0 ? (run.currentRound / run.rounds) * 100 : 0;

  return (
    <div className="flex h-screen bg-gray-50">
      <Sidebar />
      <main className="flex flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 bg-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push(`/ai-simulation/${run.scenarioId}`)}
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
                <h1 className="text-lg font-bold text-gray-900">
                  {run.scenario?.name || 'AI Simulation'}
                </h1>
                <p className="text-xs text-gray-500">
                  Run #{run.id.slice(0, 8)} · {run.scenario?.industry}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Progress */}
              <div className="flex items-center gap-2">
                <div className="text-sm text-gray-600">
                  回合 {run.currentRound} / {run.rounds}
                </div>
                <div className="h-2 w-32 rounded-full bg-gray-200">
                  <div
                    className="h-2 rounded-full bg-gradient-to-r from-indigo-500 to-purple-600 transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Status */}
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  run.status === 'RUNNING'
                    ? 'bg-green-100 text-green-700'
                    : run.status === 'PAUSED'
                      ? 'bg-yellow-100 text-yellow-700'
                      : run.status === 'COMPLETED'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                }`}
              >
                {run.status}
              </span>

              {/* Controls */}
              {run.status === 'PAUSED' && (
                <button
                  onClick={handleResume}
                  className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                >
                  <Play className="h-4 w-4" />
                  继续
                </button>
              )}
              {run.status === 'RUNNING' && (
                <button
                  onClick={handlePause}
                  className="flex items-center gap-2 rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
                >
                  <Pause className="h-4 w-4" />
                  暂停
                </button>
              )}
              <button
                onClick={() => void fetchRun()}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 hover:bg-gray-50"
              >
                <RefreshCw className="h-4 w-4 text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Main Content - 3 Column Layout */}
        <div className="flex flex-1 overflow-hidden">
          {/* Timeline (Left) */}
          <div className="flex w-2/5 flex-col border-r border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">Timeline</h2>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {run.turns && run.turns.length > 0 ? (
                run.turns.map((turn) => (
                  <div key={turn.id} className="space-y-3">
                    {/* Round Header */}
                    <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
                      <Clock className="h-3 w-3" />
                      Round {turn.roundNumber}
                      <span className="text-gray-400">·</span>
                      <span>
                        {new Date(turn.createdAt).toLocaleTimeString()}
                      </span>
                    </div>

                    {/* Agent Submissions */}
                    {turn.submissions &&
                      Array.isArray(turn.submissions) &&
                      turn.submissions.map((submission: any, idx: number) => (
                        <div
                          key={submission.agentId || idx}
                          className="ml-4 rounded-lg border border-gray-200 bg-gray-50 p-3"
                        >
                          <div className="mb-2 flex items-center justify-between">
                            <span
                              className={`text-xs font-medium ${
                                submission.team === 'BLUE'
                                  ? 'text-blue-600'
                                  : submission.team === 'RED'
                                    ? 'text-red-600'
                                    : submission.team === 'GREEN'
                                      ? 'text-green-600'
                                      : 'text-purple-600'
                              }`}
                            >
                              {submission.role}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500">
                                {submission.team}
                              </span>
                              {submission.irrational && (
                                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                                  ⚡ 非理性
                                </span>
                              )}
                              {submission.chaosInjected && (
                                <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                                  🌪️ Chaos
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Inner Monologue */}
                          {submission.innerMonologue && (
                            <div className="mb-2 rounded bg-gray-100 p-2 text-xs text-gray-600">
                              💭 {submission.innerMonologue}
                            </div>
                          )}

                          {/* Public Action */}
                          {submission.publicAction && (
                            <div className="text-sm text-gray-900">
                              {submission.publicAction}
                            </div>
                          )}

                          {/* Tools */}
                          {submission.tools && (
                            <div className="mt-2 rounded bg-blue-50 p-2 text-xs text-blue-700">
                              🔧 工具: {JSON.stringify(submission.tools)}
                            </div>
                          )}
                        </div>
                      ))}

                    {/* Adjudication */}
                    {turn.adjudication && (
                      <div className="ml-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-700">
                          <AlertTriangle className="h-3 w-3" />
                          裁判判定
                        </div>

                        {/* Ruling */}
                        <div className="mb-2 flex items-center gap-2">
                          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700">
                            {turn.adjudication.ruling || 'proceed'}
                          </span>
                        </div>

                        {/* Notes */}
                        {turn.adjudication.notes && (
                          <div className="mb-2 text-sm text-gray-900">
                            {turn.adjudication.notes}
                          </div>
                        )}

                        {/* Evidence Refs */}
                        {turn.adjudication.evidenceRefs &&
                          Array.isArray(turn.adjudication.evidenceRefs) &&
                          turn.adjudication.evidenceRefs.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {turn.adjudication.evidenceRefs.map(
                                (ev: any, idx: number) => (
                                  <div
                                    key={idx}
                                    className="flex items-start gap-2 text-xs text-gray-600"
                                  >
                                    <CheckCircle
                                      className={`mt-0.5 h-3 w-3 ${ev.status === 'missing' ? 'text-orange-600' : 'text-green-600'}`}
                                    />
                                    <span>
                                      {ev.provider}: {ev.note || ev.status}
                                    </span>
                                  </div>
                                )
                              )}
                            </div>
                          )}

                        {/* World Delta */}
                        {turn.adjudication.worldDelta && (
                          <div className="mt-2 rounded bg-white p-2">
                            <div className="mb-1 text-xs font-medium text-gray-700">
                              世界状态变化:
                            </div>
                            <div className="max-h-40 overflow-y-auto font-mono text-xs">
                              <pre className="whitespace-pre-wrap text-gray-600">
                                {JSON.stringify(
                                  turn.adjudication.worldDelta,
                                  null,
                                  2
                                )}
                              </pre>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  等待推演开始...
                </div>
              )}
              <div ref={timelineEndRef} />
            </div>
          </div>

          {/* World State (Middle) */}
          <div className="flex flex-1 flex-col bg-gray-50">
            <div className="border-b border-gray-200 bg-white px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">
                世界状态 & 态势感知
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                {/* 外部数据源状态指示器 */}
                <div className="rounded-lg border border-gray-200 bg-white p-4">
                  <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold text-gray-700">
                    <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-100">
                      <svg
                        className="h-3 w-3 text-indigo-600"
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
                    </span>
                    外部数据源
                  </h3>
                  <div className="grid grid-cols-2 gap-2">
                    {['market', 'finance', 'news', 'regulation'].map(
                      (source) => {
                        const data = run.worldState?.[source];
                        const hasError = data?.error || data?.['Error Message'];
                        const hasData = data && !hasError;
                        return (
                          <div
                            key={source}
                            className={`flex items-center gap-2 rounded-lg border p-2 text-xs ${
                              hasData
                                ? 'border-green-200 bg-green-50'
                                : hasError
                                  ? 'border-red-200 bg-red-50'
                                  : 'border-gray-200 bg-gray-50'
                            }`}
                          >
                            <span
                              className={`flex h-2 w-2 rounded-full ${
                                hasData
                                  ? 'bg-green-500'
                                  : hasError
                                    ? 'bg-red-500'
                                    : 'bg-gray-400'
                              }`}
                            />
                            <span
                              className={
                                hasData
                                  ? 'text-green-700'
                                  : hasError
                                    ? 'text-red-700'
                                    : 'text-gray-500'
                              }
                            >
                              {source === 'market' && '📈 市场'}
                              {source === 'finance' && '💰 财务'}
                              {source === 'news' && '📰 新闻'}
                              {source === 'regulation' && '⚖️ 监管'}
                            </span>
                            <span className="ml-auto text-[10px]">
                              {hasData
                                ? '✓ 有效'
                                : hasError
                                  ? typeof hasError === 'string'
                                    ? hasError.slice(0, 10)
                                    : '错误'
                                  : '待获取'}
                            </span>
                          </div>
                        );
                      }
                    )}
                  </div>
                </div>

                {/* 事件与状态 */}
                {run.worldState && (
                  <div className="space-y-3">
                    {/* 黑天鹅事件 */}
                    {run.worldState.blackSwan && (
                      <div className="rounded-lg border border-purple-200 bg-purple-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-purple-700">
                          🦢 黑天鹅事件触发
                        </div>
                        <div className="text-sm font-medium text-purple-900">
                          {run.worldState.blackSwan.name}
                        </div>
                        <p className="mt-1 text-xs text-purple-700">
                          {run.worldState.blackSwan.description}
                        </p>
                        {run.worldState.blackSwan.affectedTeams && (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {run.worldState.blackSwan.affectedTeams.map(
                              (team: string) => (
                                <span
                                  key={team}
                                  className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                    team === 'BLUE'
                                      ? 'bg-blue-100 text-blue-700'
                                      : team === 'RED'
                                        ? 'bg-red-100 text-red-700'
                                        : team === 'GREEN'
                                          ? 'bg-green-100 text-green-700'
                                          : 'bg-purple-100 text-purple-700'
                                  }`}
                                >
                                  {team}
                                </span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    )}

                    {/* 非理性偏见 */}
                    {run.worldState.irrationalBias && (
                      <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold text-orange-700">
                          ⚡ 非理性因素激活
                        </div>
                        <p className="mt-1 text-xs text-orange-600">
                          部分决策者受情绪影响，可能做出非最优决策
                        </p>
                      </div>
                    )}

                    {/* 回合统计 */}
                    <div className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="mb-2 text-xs font-semibold text-gray-700">
                        📊 本轮统计
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">提交数:</span>
                          <span className="font-medium">
                            {run.worldState.last_submissions || 0}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">累计轮次:</span>
                          <span className="font-medium">
                            {run.currentRound}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* 黑天鹅历史 */}
                    {run.worldState.blackSwanHistory &&
                      run.worldState.blackSwanHistory.length > 0 && (
                        <div className="rounded-lg border border-gray-200 bg-white p-3">
                          <div className="mb-2 text-xs font-semibold text-gray-700">
                            🦢 事件历史
                          </div>
                          <div className="space-y-1.5">
                            {run.worldState.blackSwanHistory.map(
                              (event: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex items-center gap-2 text-xs text-gray-600"
                                >
                                  <span className="text-purple-600">•</span>
                                  <span className="font-medium">
                                    {event.name}
                                  </span>
                                  <span className="ml-auto text-[10px] text-gray-400">
                                    {event.triggeredAt
                                      ? new Date(
                                          event.triggeredAt
                                        ).toLocaleTimeString()
                                      : ''}
                                  </span>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    {/* 原始数据折叠 */}
                    <details className="rounded-lg border border-gray-200 bg-white">
                      <summary className="cursor-pointer p-3 text-xs font-semibold text-gray-700 hover:bg-gray-50">
                        🔍 原始世界状态 (JSON)
                      </summary>
                      <div className="border-t border-gray-200 p-3">
                        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-gray-50 p-2 font-mono text-[10px] text-gray-600">
                          {JSON.stringify(run.worldState, null, 2)}
                        </pre>
                      </div>
                    </details>
                  </div>
                )}

                {!run.worldState && (
                  <div className="flex h-40 items-center justify-center rounded-lg border-2 border-dashed border-gray-200 text-sm text-gray-500">
                    推演开始后将显示世界状态
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Controls (Right) */}
          <div className="flex w-1/4 flex-col border-l border-gray-200 bg-white">
            <div className="border-b border-gray-200 px-4 py-3">
              <h2 className="text-sm font-semibold text-gray-900">人类干预</h2>
            </div>
            <div className="flex flex-1 flex-col p-4">
              <div className="flex-1">
                <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                  <p className="font-medium">干预说明：</p>
                  <ul className="mt-2 list-inside list-disc space-y-1">
                    <li>暂停推演并注入事件</li>
                    <li>修改约束条件</li>
                    <li>触发黑天鹅事件</li>
                    <li>调整 agent 状态</li>
                  </ul>
                </div>

                {run.params?.humanBreakEvery && (
                  <div className="mb-4 text-xs text-gray-600">
                    <p>每 {run.params.humanBreakEvery} 回合自动暂停等待干预</p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <textarea
                  value={interventionText}
                  onChange={(e) => setInterventionText(e.target.value)}
                  placeholder="输入干预指令或事件描述..."
                  rows={4}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  onClick={handleIntervention}
                  disabled={intervening || !interventionText.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                  {intervening ? '发送中...' : '发送干预'}
                </button>

                {/* Quick Actions */}
                <div className="border-t border-gray-200 pt-2">
                  <div className="mb-2 text-xs font-medium text-gray-700">
                    快速注入事件
                  </div>
                  <div className="space-y-1">
                    <button
                      onClick={() =>
                        setInterventionText(
                          '[黑天鹅] 供应链中断：主要芯片供应商遭遇产能危机，交付周期延长至6个月'
                        )
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-left text-xs text-gray-700 hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700"
                    >
                      🌪️ 供应链中断
                    </button>
                    <button
                      onClick={() =>
                        setInterventionText(
                          '[舆情事件] 某大厂被曝AI训练数据合规问题，股价下跌15%，监管介入调查'
                        )
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-left text-xs text-gray-700 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                    >
                      📰 重大新闻曝光
                    </button>
                    <button
                      onClick={() =>
                        setInterventionText(
                          '[监管政策] 出口管制升级：高端AI芯片出口许可范围扩大，部分区域全面禁售'
                        )
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-left text-xs text-gray-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700"
                    >
                      ⚖️ 出口管制升级
                    </button>
                    <button
                      onClick={() =>
                        setInterventionText(
                          '[市场剧变] GPU现货价格暴涨40%，算力租赁成本飙升，中小客户纷纷寻找替代方案'
                        )
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-left text-xs text-gray-700 hover:border-green-300 hover:bg-green-50 hover:text-green-700"
                    >
                      💰 价格剧烈波动
                    </button>
                    <button
                      onClick={() =>
                        setInterventionText(
                          '[技术突破] 竞争对手发布新一代芯片，能效比提升2倍，市场格局面临洗牌'
                        )
                      }
                      className="w-full rounded border border-gray-200 px-2 py-1.5 text-left text-xs text-gray-700 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
                    >
                      🚀 技术突破
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
