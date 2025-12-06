'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
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

  // 检查是否有从edit页面跳转过来的编辑请求
  useEffect(() => {
    const editId = sessionStorage.getItem('editScenarioId');
    if (editId && scenarios.length > 0) {
      const scenarioToEdit = scenarios.find((s) => s.id === editId);
      if (scenarioToEdit) {
        setEditing(scenarioToEdit);
        setShowEditor(true);
        sessionStorage.removeItem('editScenarioId');
      }
    }
  }, [scenarios]);

  const latestRun = (s: ScenarioCard) =>
    s.runs && s.runs.length > 0 ? s.runs[0] : null;

  const handleCreate = () => {
    setEditing(null);
    setSeed(null);
    setShowEditor(true);
  };

  // 点击卡片 -> 进入详情页查看推演过程
  const handleViewDetail = (scenario: ScenarioCard) => {
    router.push(`/ai-simulation/${scenario.id}`);
  };

  // 编辑按钮 -> 打开编辑器修改配置
  const handleEdit = (scenario: ScenarioCard, e: React.MouseEvent) => {
    e.stopPropagation(); // 阻止冒泡到卡片点击
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
        <div className="px-8 py-6">
          {/* Header - 与系统其他页面一致 */}
          <div className="mb-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-semibold text-gray-900">
                  AI Simulation
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                  战略推演：多军对抗、真实数据、人类介入
                </p>
              </div>
              <button
                onClick={handleCreate}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
              >
                + 新建推演
              </button>
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
                      onClick={() => handleViewDetail(s)}
                    >
                      {/* Edit Button - 悬浮显示 */}
                      <button
                        onClick={(e) => handleEdit(s, e)}
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg bg-white/80 opacity-0 shadow-sm backdrop-blur-sm transition-all hover:bg-white hover:shadow-md group-hover:opacity-100"
                        title="编辑场景配置"
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
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                          />
                        </svg>
                      </button>

                      {/* Icon & Status */}
                      <div className="mb-3 flex items-start justify-between">
                        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-500 text-2xl">
                          ⚔️
                        </div>
                        {run ? (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              run.status === 'RUNNING'
                                ? 'bg-green-100 text-green-700'
                                : run.status === 'COMPLETED'
                                  ? 'bg-blue-100 text-blue-700'
                                  : run.status === 'PAUSED'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-purple-100 text-purple-700'
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

                      {/* Updated Time & Hint */}
                      <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                        <span>{new Date(s.updatedAt).toLocaleString()}</span>
                        <span className="text-indigo-500 opacity-0 transition-opacity group-hover:opacity-100">
                          点击查看详情 →
                        </span>
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

// Company完整要素（基于PRD）
interface CompanyMetrics {
  cash: number; // 现金
  share: number; // 市场份额 %
  priceBand: string; // 价格带
  capacity: number; // 产能
  inventory: number; // 库存
  delivery: string; // 交付周期
  arpu: number; // ARPU
  margin: number; // 毛利率 %
  debt: number; // 负债
}

interface CompanyMoat {
  patents: number; // 专利数
  channels: string; // 渠道
  brand: string; // 品牌影响力
}

interface CompanyFull extends ScenarioFormCompany {
  metrics: CompanyMetrics;
  moat: CompanyMoat;
  riskThresholds: {
    cashMin: number;
    debtMax: number;
    complianceLevel: string;
  };
  sentimentScore: number;
}

// Agent完整Persona（基于PRD）- 用于文档和类型参考
// persona字段存储为JSON字符串，包含以下结构：
// {
//   traits: string;         // 性格特征
//   biases: string;         // 偏见
//   pressure: string;       // 压力源
//   timePref: string;       // 时间偏好 (短期/长期)
//   riskTolerance: number;  // 风险容忍度 0-100
//   compliance: number;     // 合规度 0-100
// }

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

  // Tab state for organized editing - 向导式步骤
  type TabType = 'basic' | 'companies' | 'agents' | 'params';
  const [activeTab, setActiveTab] = useState<TabType>('basic');
  const [completedSteps, setCompletedSteps] = useState<Set<TabType>>(new Set());

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

  // AI辅助状态
  const [aiAssisting, setAiAssisting] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<{
    companies?: Array<{
      name: string;
      type: string;
      market: string;
      reason: string;
    }>;
    agents?: Array<{ role: string; team: string; reason: string }>;
    goals?: { targetShare: string; risk: string; growth: string };
    insights?: string[];
  } | null>(null);

  // AI辅助：根据行业自动获取竞争对手和市场信息
  const aiAssistAnalyze = async () => {
    if (!form.industry) {
      setMessage('请先填写行业信息');
      return;
    }
    setAiAssisting(true);
    setMessage(null);
    try {
      const res = await fetch(`${config.apiUrl}/simulation/ai-assist/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeader(),
        },
        credentials: 'include',
        body: JSON.stringify({
          industry: form.industry,
          region: form.region || 'Global',
          existingCompanies: companies.map((c) => c.name),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setAiSuggestions(data);
        setMessage('AI已分析行业竞争格局，请查看建议并选择采纳');
      } else {
        setMessage(data?.message || 'AI分析失败，请稍后重试');
      }
    } catch (err: any) {
      setMessage(err.message || 'AI分析失败');
    } finally {
      setAiAssisting(false);
    }
  };

  // 采纳AI建议的公司
  const adoptAiCompanies = () => {
    if (!aiSuggestions?.companies) return;
    const newCompanies = aiSuggestions.companies.map((c) => ({
      name: c.name,
      type: c.type,
      market: c.market,
    }));
    setCompanies((prev) => [...prev, ...newCompanies]);
    setMessage(`已添加 ${newCompanies.length} 家AI推荐的公司`);
  };

  // 采纳AI建议的角色
  const adoptAiAgents = () => {
    if (!aiSuggestions?.agents) return;
    const newAgents = aiSuggestions.agents.map((a) => ({
      role: a.role,
      team: a.team as ScenarioFormAgent['team'],
    }));
    setAgents((prev) => [...prev, ...newAgents]);
    setMessage(`已添加 ${newAgents.length} 个AI推荐的角色`);
  };

  // 采纳AI建议的目标
  const adoptAiGoals = () => {
    if (!aiSuggestions?.goals) return;
    setForm((prev) => ({
      ...prev,
      goals: { ...prev.goals, ...aiSuggestions.goals },
    }));
    setMessage('已采纳AI推荐的推演目标');
  };

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
  const removeCompany = (index: number) => {
    setCompanies((prev) => prev.filter((_, i) => i !== index));
  };
  const addCompany = () =>
    setCompanies((prev) => [
      ...prev,
      { name: `Company ${prev.length + 1}`, type: 'startup', market: 'Global' },
    ]);
  const updateAgent = (index: number, value: ScenarioFormAgent) => {
    setAgents((prev) => prev.map((a, i) => (i === index ? value : a)));
  };
  const removeAgent = (index: number) => {
    setAgents((prev) => prev.filter((_, i) => i !== index));
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

  const tabs: Array<{
    id: TabType;
    label: string;
    icon: string;
    count?: number;
    desc: string;
    required?: string[];
  }> = [
    {
      id: 'basic',
      label: '基本信息',
      icon: '📋',
      desc: '场景名称、行业、目标',
      required: ['name', 'industry'],
    },
    {
      id: 'companies',
      label: '公司配置',
      icon: '🏢',
      count: companies.length,
      desc: '参与推演的公司及量化指标',
    },
    {
      id: 'agents',
      label: '角色配置',
      icon: '👥',
      count: agents.length,
      desc: 'AI Agent与Persona配置',
    },
    {
      id: 'params',
      label: '推演参数',
      icon: '⚙️',
      desc: '对战机制、随机性、人类干预',
    },
  ];

  // 验证当前步骤是否完成
  const isStepValid = (tabId: TabType): boolean => {
    switch (tabId) {
      case 'basic':
        return !!(form.name && form.industry);
      case 'companies':
        return companies.length > 0 && companies.every((c) => c.name && c.type);
      case 'agents':
        return agents.length > 0 && agents.every((a) => a.role && a.team);
      case 'params':
        return true;
      default:
        return false;
    }
  };

  // 导航到下一步
  const goToNextStep = () => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex < tabs.length - 1) {
      if (isStepValid(activeTab)) {
        setCompletedSteps((prev) => new Set([...prev, activeTab]));
      }
      setActiveTab(tabs[currentIndex + 1].id);
    }
  };

  // 导航到上一步
  const goToPrevStep = () => {
    const currentIndex = tabs.findIndex((t) => t.id === activeTab);
    if (currentIndex > 0) {
      setActiveTab(tabs[currentIndex - 1].id);
    }
  };

  // 获取步骤状态
  const getStepStatus = (
    tabId: TabType
  ): 'completed' | 'current' | 'pending' => {
    if (completedSteps.has(tabId)) return 'completed';
    if (tabId === activeTab) return 'current';
    return 'pending';
  };

  const teamColors: Record<string, string> = {
    BLUE: 'bg-blue-100 text-blue-700 border-blue-200',
    RED: 'bg-red-100 text-red-700 border-red-200',
    GREEN: 'bg-green-100 text-green-700 border-green-200',
    CHAOS: 'bg-purple-100 text-purple-700 border-purple-200',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-gradient-to-r from-indigo-50 to-purple-50 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {scenario ? '编辑推演场景' : '新建推演场景'}
            </h2>
            <p className="mt-0.5 text-sm text-gray-600">
              分步配置场景的基本信息、公司、角色和推演参数
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-white/60 hover:text-gray-600"
          >
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
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Step Indicator - 向导式步骤指示器 */}
        <div className="border-b border-gray-200 bg-gradient-to-r from-gray-50 to-indigo-50/30 px-6 py-4">
          <div className="flex items-center justify-between">
            {tabs.map((tab, index) => {
              const status = getStepStatus(tab.id);
              const isLast = index === tabs.length - 1;
              return (
                <div key={tab.id} className="flex flex-1 items-center">
                  <button
                    onClick={() => setActiveTab(tab.id)}
                    className={`group flex items-center gap-3 rounded-lg px-3 py-2 transition-all ${
                      status === 'current'
                        ? 'bg-white shadow-sm ring-1 ring-indigo-200'
                        : status === 'completed'
                          ? 'hover:bg-white/50'
                          : 'opacity-60 hover:opacity-80'
                    }`}
                  >
                    {/* Step Number/Check */}
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-all ${
                        status === 'completed'
                          ? 'bg-green-500 text-white'
                          : status === 'current'
                            ? 'bg-indigo-600 text-white'
                            : 'bg-gray-200 text-gray-500'
                      }`}
                    >
                      {status === 'completed' ? (
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
                            d="M5 13l4 4L19 7"
                          />
                        </svg>
                      ) : (
                        index + 1
                      )}
                    </div>
                    {/* Step Info */}
                    <div className="hidden sm:block">
                      <div
                        className={`text-sm font-medium ${
                          status === 'current'
                            ? 'text-indigo-700'
                            : status === 'completed'
                              ? 'text-green-700'
                              : 'text-gray-500'
                        }`}
                      >
                        {tab.label}
                        {tab.count !== undefined && (
                          <span
                            className={`ml-1.5 rounded-full px-1.5 py-0.5 text-xs ${
                              status === 'current'
                                ? 'bg-indigo-100'
                                : 'bg-gray-100'
                            }`}
                          >
                            {tab.count}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{tab.desc}</div>
                    </div>
                  </button>
                  {/* Connector Line */}
                  {!isLast && (
                    <div
                      className={`mx-2 h-0.5 flex-1 rounded ${
                        completedSteps.has(tab.id)
                          ? 'bg-green-300'
                          : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Message */}
        {message && (
          <div
            className={`mx-6 mt-4 flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm ${
              message.includes('失败') || message.includes('错误')
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-green-200 bg-green-50 text-green-700'
            }`}
          >
            <span>{message.includes('失败') ? '⚠️' : '✓'}</span>
            <span>{message}</span>
            <button
              onClick={() => setMessage(null)}
              className="ml-auto text-current opacity-60 hover:opacity-100"
            >
              ×
            </button>
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {/* Basic Info Tab */}
          {activeTab === 'basic' && (
            <div className="mx-auto max-w-3xl space-y-6">
              {/* 场景信息 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                      1
                    </span>
                    场景信息
                  </h3>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">
                      场景名称 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) =>
                        setForm({ ...form, name: e.target.value })
                      }
                      placeholder="例如：AI算力基础设施对抗推演"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        行业 <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={form.industry}
                        onChange={(e) =>
                          setForm({ ...form, industry: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="">选择行业...</option>
                        <option value="AI Compute Infrastructure">
                          AI算力基础设施
                        </option>
                        <option value="Cloud Services">云服务</option>
                        <option value="Semiconductor">半导体</option>
                        <option value="Electric Vehicles">新能源汽车</option>
                        <option value="Fintech">金融科技</option>
                        <option value="E-commerce">电子商务</option>
                        <option value="SaaS">SaaS软件</option>
                        <option value="Gaming">游戏</option>
                        <option value="Healthcare">医疗健康</option>
                        <option value="Custom">自定义...</option>
                      </select>
                      {form.industry === 'Custom' && (
                        <input
                          type="text"
                          placeholder="输入自定义行业"
                          className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none"
                          onChange={(e) =>
                            setForm({ ...form, industry: e.target.value })
                          }
                        />
                      )}
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-gray-700">
                        区域/市场
                      </label>
                      <select
                        value={form.region}
                        onChange={(e) =>
                          setForm({ ...form, region: e.target.value })
                        }
                        className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      >
                        <option value="Global">全球</option>
                        <option value="China">中国</option>
                        <option value="US">美国</option>
                        <option value="Europe">欧洲</option>
                        <option value="Asia Pacific">亚太</option>
                        <option value="Southeast Asia">东南亚</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              {/* AI辅助分析 */}
              <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-gray-900">
                        AI 智能分析
                      </h3>
                      <p className="text-xs text-gray-600">
                        根据行业和区域，AI将自动分析竞争格局、推荐竞争对手、建议角色配置
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => void aiAssistAnalyze()}
                    disabled={aiAssisting || !form.industry}
                    className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-indigo-600 to-purple-600 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-indigo-500/25 transition-all hover:from-indigo-700 hover:to-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {aiAssisting ? (
                      <>
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
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        分析中...
                      </>
                    ) : (
                      <>
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
                            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                          />
                        </svg>
                        开始AI分析
                      </>
                    )}
                  </button>
                </div>

                {/* AI洞察展示 */}
                {aiSuggestions?.insights &&
                  aiSuggestions.insights.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                        行业洞察
                      </h4>
                      <div className="space-y-1.5">
                        {aiSuggestions.insights.map((insight, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-2 rounded-lg bg-white/60 px-3 py-2 text-sm text-gray-700"
                          >
                            <svg
                              className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-500"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            <span>{insight}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>

              {/* 推演目标 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                      2
                    </span>
                    推演目标
                  </h3>
                  {aiSuggestions?.goals && (
                    <button
                      onClick={adoptAiGoals}
                      className="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                    >
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      采纳AI建议
                    </button>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      市场目标
                      <span className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-600">
                        份额
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.targetShare || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, targetShare: e.target.value },
                        })
                      }
                      placeholder="例如：守住份额并提升交付速度"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      风险/合规
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-600">
                        风险
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.risk || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, risk: e.target.value },
                        })
                      }
                      placeholder="例如：控制合规与供应链黑天鹅"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      增长目标
                      <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-600">
                        增长
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.growth || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, growth: e.target.value },
                        })
                      }
                      placeholder="例如：拉高算力利用率与现金流效率"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700">
                      自定义目标
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                        其他
                      </span>
                    </label>
                    <input
                      type="text"
                      value={form.goals.custom || ''}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          goals: { ...form.goals, custom: e.target.value },
                        })
                      }
                      placeholder="补充其他目标或约束条件"
                      className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm transition-colors focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              </div>

              {/* 验证提示 */}
              {!isStepValid('basic') && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <svg
                    className="h-4 w-4 flex-shrink-0"
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
                  <span>请填写场景名称和行业后再进入下一步</span>
                </div>
              )}
            </div>
          )}

          {/* Companies Tab */}
          {activeTab === 'companies' && (
            <div className="mx-auto max-w-4xl space-y-5">
              {/* Header Actions */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    参与公司配置
                  </h3>
                  <p className="text-xs text-gray-500">
                    配置参与推演的公司及其量化指标（现金/份额/产能/库存等）
                  </p>
                </div>
                <div className="flex gap-2">
                  {aiSuggestions?.companies &&
                    aiSuggestions.companies.length > 0 && (
                      <button
                        onClick={adoptAiCompanies}
                        className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                      >
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
                            d="M13 10V3L4 14h7v7l9-11h-7z"
                          />
                        </svg>
                        采纳AI推荐 ({aiSuggestions.companies.length})
                      </button>
                    )}
                  <button
                    onClick={() => void fetchExternal()}
                    disabled={syncing}
                    className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
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
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                    {syncing ? '同步中...' : '同步外部数据'}
                  </button>
                  <button
                    onClick={addCompany}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                  >
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    添加公司
                  </button>
                </div>
              </div>

              {/* AI推荐展示 */}
              {aiSuggestions?.companies &&
                aiSuggestions.companies.length > 0 && (
                  <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
                    <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      AI推荐的竞争对手
                    </h4>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {aiSuggestions.companies.map((c, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2"
                        >
                          <div>
                            <div className="text-sm font-medium text-gray-900">
                              {c.name}
                            </div>
                            <div className="text-xs text-gray-500">
                              {c.type} · {c.market}
                            </div>
                          </div>
                          <span className="text-xs text-indigo-600">
                            {c.reason}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* 外部数据同步提示 */}
              {external && (
                <div className="flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <svg
                      className="h-4 w-4 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span className="text-sm font-medium text-blue-700">
                      外部数据已同步
                    </span>
                  </div>
                  <button
                    onClick={injectFromMarket}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    用市场数据填充公司
                  </button>
                </div>
              )}

              {/* 公司列表 */}
              <div className="space-y-4">
                {companies.map((c, idx) => (
                  <CompanyCard
                    key={idx}
                    index={idx}
                    company={c}
                    onUpdate={(value) => updateCompany(idx, value)}
                    onRemove={() => removeCompany(idx)}
                  />
                ))}
                {companies.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                    <svg
                      className="mx-auto h-10 w-10 text-gray-400"
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
                    <h4 className="mt-3 text-sm font-medium text-gray-900">
                      暂无公司
                    </h4>
                    <p className="mt-1 text-xs text-gray-500">
                      点击上方"添加公司"或使用AI推荐
                    </p>
                  </div>
                )}
              </div>

              {/* 验证提示 */}
              {!isStepValid('companies') && companies.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <svg
                    className="h-4 w-4 flex-shrink-0"
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
                  <span>请确保所有公司都填写了名称和类型</span>
                </div>
              )}
            </div>
          )}

          {/* Agents Tab */}
          {activeTab === 'agents' && (
            <div className="mx-auto max-w-4xl space-y-5">
              {/* Header */}
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-gray-900">
                    AI 角色配置
                  </h3>
                  <p className="text-xs text-gray-500">
                    配置蓝军、红军、绿军和Chaos角色的Persona（性格/偏见/压力源/风险偏好）
                  </p>
                </div>
                <div className="flex gap-2">
                  {aiSuggestions?.agents && aiSuggestions.agents.length > 0 && (
                    <button
                      onClick={adoptAiAgents}
                      className="flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                    >
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
                          d="M13 10V3L4 14h7v7l9-11h-7z"
                        />
                      </svg>
                      采纳AI推荐 ({aiSuggestions.agents.length})
                    </button>
                  )}
                  <button
                    onClick={addAgent}
                    className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-indigo-700"
                  >
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
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    添加角色
                  </button>
                </div>
              </div>

              {/* AI推荐的角色 */}
              {aiSuggestions?.agents && aiSuggestions.agents.length > 0 && (
                <div className="rounded-xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-purple-50 p-4">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-700">
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
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                    AI推荐的角色配置
                  </h4>
                  <div className="grid gap-2 sm:grid-cols-3">
                    {aiSuggestions.agents.map((a, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-2 rounded-lg bg-white/70 px-3 py-2"
                      >
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                            a.team === 'BLUE'
                              ? 'bg-blue-100 text-blue-600'
                              : a.team === 'RED'
                                ? 'bg-red-100 text-red-600'
                                : a.team === 'GREEN'
                                  ? 'bg-green-100 text-green-600'
                                  : 'bg-purple-100 text-purple-600'
                          }`}
                        >
                          {a.team === 'BLUE'
                            ? '蓝'
                            : a.team === 'RED'
                              ? '红'
                              : a.team === 'GREEN'
                                ? '绿'
                                : '混'}
                        </span>
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {a.role}
                          </div>
                          <div className="text-xs text-gray-500">
                            {a.reason}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 快速模板 */}
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <h4 className="mb-3 text-xs font-semibold text-gray-700">
                  快速添加预设角色
                </h4>
                <div className="flex flex-wrap gap-2">
                  {/* 蓝军模板 */}
                  <button
                    onClick={() =>
                      setAgents((prev) => [
                        ...prev,
                        {
                          role: 'CEO (蓝军)',
                          team: 'BLUE',
                          companyName: companies[0]?.name || '',
                          persona:
                            '{"traits":"稳健进取","biases":"偏好长期价值","pressure":"股东回报压力","timePref":"中长期","riskTolerance":60,"compliance":80}',
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    蓝军 CEO
                  </button>
                  <button
                    onClick={() =>
                      setAgents((prev) => [
                        ...prev,
                        {
                          role: 'CFO (蓝军)',
                          team: 'BLUE',
                          companyName: companies[0]?.name || '',
                          persona:
                            '{"traits":"财务保守","biases":"现金流优先","pressure":"成本控制","timePref":"短期","riskTolerance":30,"compliance":90}',
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100"
                  >
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    蓝军 CFO
                  </button>
                  {/* 红军模板 */}
                  <button
                    onClick={() =>
                      setAgents((prev) => [
                        ...prev,
                        {
                          role: 'CEO (红军)',
                          team: 'RED',
                          companyName: companies[1]?.name || '',
                          persona:
                            '{"traits":"激进扩张","biases":"市场份额优先","pressure":"融资压力","timePref":"短期","riskTolerance":85,"compliance":60}',
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
                  >
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    红军 激进CEO
                  </button>
                  <button
                    onClick={() =>
                      setAgents((prev) => [
                        ...prev,
                        {
                          role: '董事会 (红军)',
                          team: 'RED',
                          companyName: companies[1]?.name || '',
                          persona:
                            '{"traits":"保守稳健","biases":"风险规避","pressure":"股东利益","timePref":"长期","riskTolerance":25,"compliance":95}',
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100"
                  >
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    红军 保守董事会
                  </button>
                  {/* 绿军模板 */}
                  <button
                    onClick={() =>
                      setAgents((prev) => [
                        ...prev,
                        {
                          role: '监管官员',
                          team: 'GREEN',
                          persona:
                            '{"traits":"严格执法","biases":"合规优先","pressure":"政策压力","focus":"出口管制、反垄断、数据安全"}',
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                  >
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    绿军 监管官
                  </button>
                  <button
                    onClick={() =>
                      setAgents((prev) => [
                        ...prev,
                        {
                          role: '媒体记者',
                          team: 'GREEN',
                          persona:
                            '{"traits":"追求真相","biases":"负面新闻敏感","focus":"供应链透明度、ESG"}',
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-medium text-green-700 transition-colors hover:bg-green-100"
                  >
                    <span className="h-2 w-2 rounded-full bg-green-500" />
                    绿军 媒体
                  </button>
                  {/* Chaos模板 */}
                  <button
                    onClick={() =>
                      setAgents((prev) => [
                        ...prev,
                        {
                          role: '黑天鹅事件',
                          team: 'CHAOS',
                          persona:
                            '{"type":"supply_chain","triggers":"供应链中断、关税政策、自然灾害","probability":0.3}',
                        },
                      ])
                    }
                    className="flex items-center gap-1.5 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-medium text-purple-700 transition-colors hover:bg-purple-100"
                  >
                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                    Chaos 黑天鹅
                  </button>
                </div>
              </div>

              {/* 角色列表 */}
              <div className="space-y-4">
                {agents.map((a, idx) => (
                  <AgentCard
                    key={idx}
                    index={idx}
                    agent={a}
                    companies={companies}
                    teamColors={teamColors}
                    onUpdate={(value) => updateAgent(idx, value)}
                    onRemove={() => removeAgent(idx)}
                  />
                ))}
                {agents.length === 0 && (
                  <div className="rounded-xl border-2 border-dashed border-gray-200 py-12 text-center">
                    <svg
                      className="mx-auto h-10 w-10 text-gray-400"
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
                    <h4 className="mt-3 text-sm font-medium text-gray-900">
                      暂无角色
                    </h4>
                    <p className="mt-1 text-xs text-gray-500">
                      使用上方快速模板或点击"添加角色"
                    </p>
                  </div>
                )}
              </div>

              {/* 验证提示 */}
              {!isStepValid('agents') && agents.length > 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                  <svg
                    className="h-4 w-4 flex-shrink-0"
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
                  <span>请确保所有角色都填写了名称和所属阵营</span>
                </div>
              )}
            </div>
          )}

          {/* Params Tab */}
          {activeTab === 'params' && (
            <div className="mx-auto max-w-3xl space-y-6">
              {/* 对战机制 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    1
                  </span>
                  对战机制
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50">
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
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        盲注模式
                      </div>
                      <div className="text-xs text-gray-500">
                        各方同时提交决策，不知道对手行动
                      </div>
                    </div>
                  </label>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-4 py-3 transition-colors hover:border-indigo-300 hover:bg-indigo-50/50">
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
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        强制 CoT 推理
                      </div>
                      <div className="text-xs text-gray-500">
                        要求AI展示推理过程（内心独白）
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* 随机性参数 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    2
                  </span>
                  随机性与不确定性
                </h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        黑天鹅概率
                      </label>
                      <span className="rounded bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                        {Math.round(form.constraints.chaosProb * 100)}%
                      </span>
                    </div>
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
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-purple-600"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      每轮触发黑天鹅事件的概率
                    </p>
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        非理性决策概率
                      </label>
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-700">
                        {Math.round(form.constraints.irrationalProb * 100)}%
                      </span>
                    </div>
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
                      className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-orange-600"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Agent做出非理性/情绪化决策的概率
                    </p>
                  </div>
                </div>
              </div>

              {/* 事件库 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    3
                  </span>
                  黑天鹅事件库
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-600">
                    基于行业: {form.industry || '未选择'}
                  </span>
                </h3>
                <p className="mb-3 text-xs text-gray-500">
                  选择可能在推演中触发的事件类型
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {[
                    {
                      id: 'supply_chain',
                      label: '供应链中断',
                      icon: '🚢',
                      desc: '关键零部件短缺、物流受阻',
                    },
                    {
                      id: 'regulation',
                      label: '监管政策变化',
                      icon: '⚖️',
                      desc: '出口管制、反垄断调查',
                    },
                    {
                      id: 'competitor',
                      label: '竞争对手突袭',
                      icon: '⚔️',
                      desc: '价格战、挖角、专利诉讼',
                    },
                    {
                      id: 'customer',
                      label: '客户变动',
                      icon: '👥',
                      desc: '大单签约/解约、客户流失',
                    },
                    {
                      id: 'media',
                      label: '媒体曝光',
                      icon: '📰',
                      desc: '负面新闻、ESG危机',
                    },
                    {
                      id: 'tech',
                      label: '技术突破/故障',
                      icon: '💡',
                      desc: '技术泄露、产品缺陷',
                    },
                    {
                      id: 'finance',
                      label: '金融市场波动',
                      icon: '📈',
                      desc: '汇率、利率、融资环境',
                    },
                    {
                      id: 'talent',
                      label: '人才变动',
                      icon: '👔',
                      desc: '高管离职、团队流失',
                    },
                    {
                      id: 'disaster',
                      label: '自然灾害',
                      icon: '🌪️',
                      desc: '地震、洪水、疫情',
                    },
                  ].map((event) => (
                    <label
                      key={event.id}
                      className="flex cursor-pointer items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 transition-colors hover:border-purple-300 hover:bg-purple-50/50"
                    >
                      <input
                        type="checkbox"
                        defaultChecked={[
                          'supply_chain',
                          'regulation',
                          'competitor',
                        ].includes(event.id)}
                        className="mt-0.5 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      />
                      <div>
                        <div className="flex items-center gap-1 text-sm font-medium text-gray-900">
                          <span>{event.icon}</span>
                          {event.label}
                        </div>
                        <div className="text-xs text-gray-500">
                          {event.desc}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* 人类介入 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    4
                  </span>
                  人类介入 (Human-in-the-Loop)
                </h3>
                <div className="grid gap-6 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      自动暂停间隔
                    </label>
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-gray-600">每</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
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
                        className="w-16 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      <span className="text-sm text-gray-600">轮暂停一次</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      推演将在指定轮次后暂停，等待人类审核和干预
                    </p>
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      推演总轮数
                    </label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={1}
                        max={20}
                        defaultValue={4}
                        className="w-16 rounded-lg border border-gray-300 px-3 py-2 text-center text-sm focus:border-indigo-500 focus:outline-none"
                      />
                      <span className="text-sm text-gray-600">轮</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">
                      建议 4-6 轮，每轮代表一个决策周期
                    </p>
                  </div>
                </div>
              </div>

              {/* 裁判规则 */}
              <div className="rounded-xl border border-gray-200 bg-white p-5">
                <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 text-xs text-indigo-600">
                    5
                  </span>
                  裁判系统配置
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        外部数据验证
                      </div>
                      <div className="text-xs text-gray-500">
                        裁判将使用真实外部数据验证行动可行性
                      </div>
                    </div>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      已启用
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        证据链记录
                      </div>
                      <div className="text-xs text-gray-500">
                        每次判定记录数据来源、时间戳、置信度
                      </div>
                    </div>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      已启用
                    </span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        行动驳回
                      </div>
                      <div className="text-xs text-gray-500">
                        裁判可驳回不可行的行动（资金/时间/合规不足）
                      </div>
                    </div>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                      已启用
                    </span>
                  </div>
                </div>
              </div>

              {/* 状态显示 */}
              {(scenario?.id || runId) && (
                <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                  <h3 className="mb-2 text-sm font-semibold text-indigo-900">
                    当前状态
                  </h3>
                  <div className="space-y-1 text-sm text-indigo-700">
                    {scenario?.id && (
                      <p>
                        场景 ID:{' '}
                        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                          {scenario.id}
                        </code>
                      </p>
                    )}
                    {runId && (
                      <p>
                        运行 ID:{' '}
                        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">
                          {runId}
                        </code>
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions - 向导式导航 */}
        <div className="flex items-center justify-between border-t border-gray-200 bg-gradient-to-r from-gray-50 to-indigo-50/30 px-6 py-4">
          {/* 左侧：当前步骤状态 */}
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500">
              步骤 {tabs.findIndex((t) => t.id === activeTab) + 1} /{' '}
              {tabs.length}
            </div>
            <div className="h-4 w-px bg-gray-300" />
            <div className="text-xs text-gray-600">
              {activeTab === 'basic' &&
                (isStepValid('basic')
                  ? '✓ 基本信息已完成'
                  : '请填写场景名称和行业')}
              {activeTab === 'companies' && `已配置 ${companies.length} 家公司`}
              {activeTab === 'agents' && `已配置 ${agents.length} 个角色`}
              {activeTab === 'params' && '配置对战机制和随机性参数'}
            </div>
          </div>

          {/* 右侧：导航和操作按钮 */}
          <div className="flex items-center gap-3">
            {/* 上一步 */}
            {activeTab !== 'basic' && (
              <button
                onClick={goToPrevStep}
                className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
              >
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
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
                上一步
              </button>
            )}

            {/* 取消 */}
            <button
              onClick={onClose}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              取消
            </button>

            {/* 下一步 / 保存 */}
            {activeTab !== 'params' ? (
              <button
                onClick={goToNextStep}
                disabled={activeTab === 'basic' && !isStepValid('basic')}
                className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                下一步
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
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </button>
            ) : (
              <>
                <button
                  onClick={() => void saveScenario()}
                  disabled={saving || !form.name || !form.industry}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? '保存中...' : '保存场景'}
                </button>
                {scenario?.id && (
                  <button
                    onClick={() => void startRun()}
                    disabled={saving}
                    className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-lg shadow-purple-500/25 transition-all hover:from-purple-700 hover:to-indigo-700 disabled:opacity-50"
                  >
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
                        d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                      />
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                    开始推演
                  </button>
                )}
              </>
            )}
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

// Agent卡片组件 - 完整Persona配置（基于PRD）
function AgentCard({
  index,
  agent,
  companies,
  teamColors,
  onUpdate,
  onRemove,
}: {
  index: number;
  agent: ScenarioFormAgent;
  companies: ScenarioFormCompany[];
  teamColors: Record<string, string>;
  onUpdate: (value: ScenarioFormAgent) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // 解析persona JSON
  const persona = agent.persona ? safeJson(agent.persona, {}) : {};

  const updatePersona = (key: string, value: any) => {
    const newPersona = { ...persona, [key]: value };
    onUpdate({ ...agent, persona: JSON.stringify(newPersona) });
  };

  const teamInfo: Record<
    string,
    { label: string; color: string; bgColor: string; icon: string }
  > = {
    BLUE: {
      label: '蓝军',
      color: 'text-blue-700',
      bgColor: 'bg-blue-100',
      icon: '🔵',
    },
    RED: {
      label: '红军',
      color: 'text-red-700',
      bgColor: 'bg-red-100',
      icon: '🔴',
    },
    GREEN: {
      label: '绿军',
      color: 'text-green-700',
      bgColor: 'bg-green-100',
      icon: '🟢',
    },
    CHAOS: {
      label: 'Chaos',
      color: 'text-purple-700',
      bgColor: 'bg-purple-100',
      icon: '🟣',
    },
  };

  const currentTeam = teamInfo[agent.team] || teamInfo.BLUE;

  return (
    <div
      className={`rounded-xl border bg-white shadow-sm transition-all hover:shadow-md ${
        agent.team === 'BLUE'
          ? 'border-blue-200'
          : agent.team === 'RED'
            ? 'border-red-200'
            : agent.team === 'GREEN'
              ? 'border-green-200'
              : 'border-purple-200'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-4 p-4">
        <div
          className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl text-lg ${currentTeam.bgColor}`}
        >
          {currentTeam.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <select
              value={agent.team}
              onChange={(e) =>
                onUpdate({
                  ...agent,
                  team: e.target.value as ScenarioFormAgent['team'],
                })
              }
              className={`rounded-lg border-none px-2 py-1 text-xs font-semibold ${currentTeam.bgColor} ${currentTeam.color} focus:outline-none focus:ring-1 focus:ring-indigo-500`}
            >
              <option value="BLUE">🔵 蓝军</option>
              <option value="RED">🔴 红军</option>
              <option value="GREEN">🟢 绿军</option>
              <option value="CHAOS">🟣 Chaos</option>
            </select>
            <input
              value={agent.role}
              onChange={(e) => onUpdate({ ...agent, role: e.target.value })}
              placeholder="角色名称 (如 CEO、CFO、监管官)"
              className="flex-1 border-none bg-transparent text-sm font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
          <div className="mt-1 flex items-center gap-2">
            <select
              value={agent.companyName || ''}
              onChange={(e) =>
                onUpdate({ ...agent, companyName: e.target.value })
              }
              className="rounded border-none bg-gray-100 px-2 py-0.5 text-xs text-gray-600 focus:outline-none"
            >
              <option value="">无所属公司</option>
              {companies.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            {persona.riskTolerance !== undefined && (
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  persona.riskTolerance > 70
                    ? 'bg-red-100 text-red-700'
                    : persona.riskTolerance > 40
                      ? 'bg-yellow-100 text-yellow-700'
                      : 'bg-green-100 text-green-700'
                }`}
              >
                风险偏好: {persona.riskTolerance}%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              expanded
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {expanded ? '收起' : '展开Persona'}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
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
          </button>
        </div>
      </div>

      {/* Expanded - Persona详情 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4">
          {/* 性格与偏见 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-indigo-100 text-indigo-600">
                🎭
              </span>
              性格与偏见
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  性格特征
                </label>
                <input
                  type="text"
                  value={persona.traits || ''}
                  onChange={(e) => updatePersona('traits', e.target.value)}
                  placeholder="如：激进派、保守稳健、机会主义者"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  偏见/倾向
                </label>
                <input
                  type="text"
                  value={persona.biases || ''}
                  onChange={(e) => updatePersona('biases', e.target.value)}
                  placeholder="如：偏好短期收益、风险规避、市场份额优先"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 压力与时间偏好 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-orange-100 text-orange-600">
                ⏱️
              </span>
              压力源与时间偏好
            </h4>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  压力源
                </label>
                <input
                  type="text"
                  value={persona.pressure || ''}
                  onChange={(e) => updatePersona('pressure', e.target.value)}
                  placeholder="如：财报压力、融资需求、竞争对手威胁"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  时间偏好
                </label>
                <select
                  value={persona.timePref || ''}
                  onChange={(e) => updatePersona('timePref', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">选择时间偏好...</option>
                  <option value="短期">短期 (0-6个月)</option>
                  <option value="中期">中期 (6-18个月)</option>
                  <option value="长期">长期 (18个月以上)</option>
                </select>
              </div>
            </div>
          </div>

          {/* 风险与合规 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-red-100 text-red-600">
                ⚠️
              </span>
              风险容忍度与合规度
            </h4>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-gray-500">风险容忍度</label>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      (persona.riskTolerance || 50) > 70
                        ? 'bg-red-100 text-red-700'
                        : (persona.riskTolerance || 50) > 40
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                    }`}
                  >
                    {persona.riskTolerance || 50}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={persona.riskTolerance || 50}
                  onChange={(e) =>
                    updatePersona('riskTolerance', parseInt(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-red-600"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>保守</span>
                  <span>激进</span>
                </div>
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs text-gray-500">合规度</label>
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${
                      (persona.compliance || 50) > 70
                        ? 'bg-green-100 text-green-700'
                        : (persona.compliance || 50) > 40
                          ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {persona.compliance || 50}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={persona.compliance || 50}
                  onChange={(e) =>
                    updatePersona('compliance', parseInt(e.target.value))
                  }
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-gray-200 accent-green-600"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-400">
                  <span>灵活</span>
                  <span>严格</span>
                </div>
              </div>
            </div>
          </div>

          {/* 私有记忆 */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-gray-600">
                🔒
              </span>
              私有记忆（仅该角色可见）
            </h4>
            <textarea
              value={agent.memoryPrivate || ''}
              onChange={(e) =>
                onUpdate({ ...agent, memoryPrivate: e.target.value })
              }
              placeholder="该角色独有的隐藏信息，如：资金链紧张、内部矛盾、即将离职..."
              rows={2}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
            />
          </div>

          {/* AI提示 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-600">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>
              Persona配置影响AI的决策风格。风险容忍度高+合规度低的角色更可能做出激进决策
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// 公司卡片组件 - 完整Company要素（基于PRD）
function CompanyCard({
  index,
  company,
  onUpdate,
  onRemove,
}: {
  index: number;
  company: ScenarioFormCompany;
  onUpdate: (value: ScenarioFormCompany) => void;
  onRemove: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // 从metrics中获取值，提供默认值
  const metrics = company.metrics || {};

  const updateMetrics = (key: string, value: any) => {
    onUpdate({
      ...company,
      metrics: { ...metrics, [key]: value },
    });
  };

  const companyTypes = [
    {
      value: 'benchmark',
      label: '行业标杆',
      color: 'bg-blue-100 text-blue-700',
    },
    {
      value: 'startup',
      label: '初创公司',
      color: 'bg-green-100 text-green-700',
    },
    {
      value: 'regional',
      label: '区域龙头',
      color: 'bg-purple-100 text-purple-700',
    },
    {
      value: 'challenger',
      label: '挑战者',
      color: 'bg-orange-100 text-orange-700',
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
      {/* Header - 始终显示 */}
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white">
          {index + 1}
        </div>
        <div className="flex-1">
          <input
            value={company.name}
            onChange={(e) => onUpdate({ ...company, name: e.target.value })}
            placeholder="公司名称"
            className="w-full border-none bg-transparent text-base font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-2">
            <select
              value={company.type}
              onChange={(e) => onUpdate({ ...company, type: e.target.value })}
              className="rounded border-none bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">选择类型...</option>
              {companyTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">·</span>
            <input
              value={company.market}
              onChange={(e) => onUpdate({ ...company, market: e.target.value })}
              placeholder="市场区域"
              className="w-24 border-none bg-transparent text-xs text-gray-500 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              expanded
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {expanded ? '收起' : '展开量化指标'}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
          >
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
          </button>
        </div>
      </div>

      {/* Expanded - 量化指标详情 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4">
          {/* 核心财务指标 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-green-100 text-green-600">
                $
              </span>
              核心财务指标
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  现金 (万美元)
                </label>
                <input
                  type="number"
                  value={metrics.cash || ''}
                  onChange={(e) =>
                    updateMetrics('cash', parseFloat(e.target.value) || 0)
                  }
                  placeholder="10000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  市场份额 (%)
                </label>
                <input
                  type="number"
                  value={metrics.share || ''}
                  onChange={(e) =>
                    updateMetrics('share', parseFloat(e.target.value) || 0)
                  }
                  placeholder="15"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  毛利率 (%)
                </label>
                <input
                  type="number"
                  value={metrics.margin || ''}
                  onChange={(e) =>
                    updateMetrics('margin', parseFloat(e.target.value) || 0)
                  }
                  placeholder="35"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  负债 (万美元)
                </label>
                <input
                  type="number"
                  value={metrics.debt || ''}
                  onChange={(e) =>
                    updateMetrics('debt', parseFloat(e.target.value) || 0)
                  }
                  placeholder="5000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 运营指标 */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-blue-600">
                ⚡
              </span>
              运营指标
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  产能 (单位)
                </label>
                <input
                  type="number"
                  value={metrics.capacity || ''}
                  onChange={(e) =>
                    updateMetrics('capacity', parseFloat(e.target.value) || 0)
                  }
                  placeholder="1000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  库存 (单位)
                </label>
                <input
                  type="number"
                  value={metrics.inventory || ''}
                  onChange={(e) =>
                    updateMetrics('inventory', parseFloat(e.target.value) || 0)
                  }
                  placeholder="200"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  价格带
                </label>
                <input
                  type="text"
                  value={metrics.priceBand || ''}
                  onChange={(e) => updateMetrics('priceBand', e.target.value)}
                  placeholder="高端/中端/低端"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  交付周期
                </label>
                <input
                  type="text"
                  value={metrics.delivery || ''}
                  onChange={(e) => updateMetrics('delivery', e.target.value)}
                  placeholder="2-4周"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* 护城河指标 */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-100 text-purple-600">
                🏰
              </span>
              护城河
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  专利数量
                </label>
                <input
                  type="number"
                  value={metrics.patents || ''}
                  onChange={(e) =>
                    updateMetrics('patents', parseInt(e.target.value) || 0)
                  }
                  placeholder="50"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  渠道优势
                </label>
                <input
                  type="text"
                  value={metrics.channels || ''}
                  onChange={(e) => updateMetrics('channels', e.target.value)}
                  placeholder="直销/代理/电商"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  品牌影响力
                </label>
                <select
                  value={metrics.brand || ''}
                  onChange={(e) => updateMetrics('brand', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">选择...</option>
                  <option value="global_leader">全球领导者</option>
                  <option value="strong">强势品牌</option>
                  <option value="growing">成长中</option>
                  <option value="niche">细分市场</option>
                  <option value="emerging">新兴品牌</option>
                </select>
              </div>
            </div>
          </div>

          {/* AI补充提示 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-600">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>提示：不确定的数据可留空，AI裁判将基于外部数据源补充</span>
          </div>
        </div>
      )}
    </div>
  );
}
