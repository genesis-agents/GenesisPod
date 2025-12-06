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
      // Setup SSE for real-time updates
      const eventSource = new EventSource(
        `${config.apiUrl}/simulation/runs/${runId}/events`,
        { withCredentials: true }
      );

      eventSource.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'turn_complete') {
          void fetchRun();
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
      };

      return () => eventSource.close();
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
                      typeof turn.submissions === 'object' &&
                      Object.entries(turn.submissions).map(
                        ([agentId, submission]: [string, any]) => (
                          <div
                            key={agentId}
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
                                {submission.role || agentId}
                              </span>
                              <span className="text-xs text-gray-500">
                                {submission.team}
                              </span>
                            </div>

                            {/* Inner Monologue */}
                            {submission.inner_monologue && (
                              <div className="mb-2 rounded bg-gray-100 p-2 text-xs italic text-gray-600">
                                💭 {submission.inner_monologue}
                              </div>
                            )}

                            {/* Public Action */}
                            {submission.public_action && (
                              <div className="text-sm text-gray-900">
                                {submission.public_action}
                              </div>
                            )}

                            {/* Tools Used */}
                            {submission.tools_used &&
                              submission.tools_used.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-1">
                                  {submission.tools_used.map(
                                    (tool: string, idx: number) => (
                                      <span
                                        key={idx}
                                        className="rounded bg-blue-100 px-2 py-0.5 text-xs text-blue-700"
                                      >
                                        🔧 {tool}
                                      </span>
                                    )
                                  )}
                                </div>
                              )}
                          </div>
                        )
                      )}

                    {/* Adjudication */}
                    {turn.adjudication && (
                      <div className="ml-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                        <div className="mb-2 flex items-center gap-2 text-xs font-medium text-indigo-700">
                          <AlertTriangle className="h-3 w-3" />
                          裁判判定
                        </div>
                        <div className="text-sm text-gray-900">
                          {turn.adjudication.ruling || '判定中...'}
                        </div>

                        {/* Evidence */}
                        {turn.evidence &&
                          Array.isArray(turn.evidence) &&
                          turn.evidence.length > 0 && (
                            <div className="mt-2 space-y-1">
                              {turn.evidence.map((ev: any, idx: number) => (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 text-xs text-gray-600"
                                >
                                  <CheckCircle className="mt-0.5 h-3 w-3 text-green-600" />
                                  <span>
                                    {ev.source}: {ev.summary}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}

                        {/* State Delta */}
                        {turn.adjudication.state_delta && (
                          <div className="mt-2 rounded bg-white p-2 font-mono text-xs">
                            <pre className="whitespace-pre-wrap">
                              {JSON.stringify(
                                turn.adjudication.state_delta,
                                null,
                                2
                              )}
                            </pre>
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
              <h2 className="text-sm font-semibold text-gray-900">世界状态</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {run.worldState ? (
                <div className="space-y-4">
                  {/* Companies State */}
                  {run.worldState.companies && (
                    <div>
                      <h3 className="mb-3 text-xs font-semibold text-gray-700">
                        公司状态
                      </h3>
                      <div className="grid gap-3 md:grid-cols-2">
                        {Object.entries(run.worldState.companies).map(
                          ([name, state]: [string, any]) => (
                            <div
                              key={name}
                              className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm"
                            >
                              <h4 className="font-medium text-gray-900">
                                {name}
                              </h4>
                              <div className="mt-2 space-y-1 text-xs">
                                {Object.entries(state).map(([key, value]) => (
                                  <div
                                    key={key}
                                    className="flex justify-between"
                                  >
                                    <span className="text-gray-500">
                                      {key}:
                                    </span>
                                    <span className="font-medium text-gray-900">
                                      {String(value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  )}

                  {/* Market State */}
                  {run.worldState.market && (
                    <div>
                      <h3 className="mb-3 text-xs font-semibold text-gray-700">
                        市场状态
                      </h3>
                      <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                        <pre className="whitespace-pre-wrap font-mono text-xs text-gray-700">
                          {JSON.stringify(run.worldState.market, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-gray-500">
                  暂无世界状态数据
                </div>
              )}
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
                    快速操作
                  </div>
                  <div className="space-y-1">
                    <button className="w-full rounded border border-gray-200 px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50">
                      🌪️ 触发供应链中断
                    </button>
                    <button className="w-full rounded border border-gray-200 px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50">
                      📰 重大新闻事件
                    </button>
                    <button className="w-full rounded border border-gray-200 px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50">
                      ⚖️ 监管政策变更
                    </button>
                    <button className="w-full rounded border border-gray-200 px-2 py-1 text-left text-xs text-gray-700 hover:bg-gray-50">
                      💰 市场价格剧变
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
