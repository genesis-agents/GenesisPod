/**
 * MissionTodoLedger —— Leader-owned 动态任务台账
 *
 * 任务列表不是预设槽位，而是 Leader 主持下、随 mission 进程不断追加 / 重派 / 拆分
 * 的全景台账。每条 todo 都有起因（origin）、提出者（createdBy）、当前 assignee 与
 * narrativeLog（这条任务的人话进展流）。
 *
 * 派生规则（按 originating event）:
 *   stage:completed(leader) + dimensions[]              → leader-plan todos
 *   dimensions:appended                                  → leader-chat-create todos
 *   leader:decision(assess-research-dispatched)          → S4 评审决策概览
 *   dimension:retrying（reason !== leader-assess-*）     → self-heal-retry 子 todo
 *   dimension:retrying（reason starts with leader-）     → leader-assess-* 子 todo
 *   chapter:revision                                     → reviewer-revise chapter 子 todo
 *   critic:verdict.warnings[]                            → critic-blindspot todos
 *   reconciliation:completed.gapCount > 0                → reconciler-gap todo
 *   stage:started/completed (system stages)              → system-stage todos
 *   agent:narrative                                      → 直接挂到对应 todo 的 narrativeLog
 */

import type { PlaygroundEvent } from '@/hooks/useAgentPlaygroundStream';
import type {
  AgentLiveState,
  AgentRole,
  DimensionPipelineState,
  MissionState,
  VerifierVerdict,
} from './derive';

export type MissionTodoOrigin =
  | 'leader-plan'
  | 'leader-assess-retry'
  | 'leader-assess-replace'
  | 'leader-assess-extend'
  | 'leader-assess-abort'
  | 'leader-chat-create'
  | 'self-heal-retry'
  | 'reviewer-revise'
  | 'critic-blindspot'
  | 'reconciler-gap'
  | 'system-stage';

export type MissionTodoScope =
  | 'mission'
  | 'dimension'
  | 'chapter'
  | 'review'
  | 'system';

export type MissionTodoStatus =
  | 'pending'
  | 'in_progress'
  | 'blocked'
  | 'done'
  | 'failed'
  | 'cancelled';

export interface MissionTodoAssignee {
  role: AgentRole | 'reconciler' | 'critic' | 'mission';
  agentId?: string;
  dimensionName?: string;
}

export interface MissionTodoArtifact {
  kind:
    | 'finding-count'
    | 'insight-count'
    | 'fact-table'
    | 'figure'
    | 'chapter'
    | 'verdict-score'
    | 'critic-warning'
    | 'foreword';
  label: string;
  value?: string | number;
}

export interface MissionTodoNarrativeItem {
  ts: number;
  text: string;
  tone?: 'info' | 'success' | 'warn' | 'error';
}

export type SystemStageId =
  | 's1-budget'
  | 's2-leader-plan'
  | 's3-researchers'
  | 's4-leader-assess'
  | 's5-reconciler'
  | 's6-analyst'
  | 's7-writer-outline'
  | 's8-writer-draft'
  | 's8b-quality-enhancement'
  | 's9-critic-l4'
  | 's9b-objective-evaluation'
  | 's10-leader-signoff'
  | 's11-persist'
  | 's12-self-evolution';

export interface MissionTodo {
  id: string;
  parentId?: string;
  origin: MissionTodoOrigin;
  createdBy: 'leader' | 'reviewer' | 'critic' | 'reconciler' | 'system';
  createdAt: number;
  reasonText: string;
  scope: MissionTodoScope;
  title: string;
  assignee: MissionTodoAssignee;
  status: MissionTodoStatus;
  startedAt?: number;
  endedAt?: number;
  artifacts: MissionTodoArtifact[];
  narrativeLog: MissionTodoNarrativeItem[];
  agentRefId?: string;
  dimensionRef?: string;
  systemStageId?: SystemStageId;
  /**
   * ★ 2026-04-30 REDESIGN (task #61): retry 双路径 pipelineKey 索引
   * dimensionPipelines.get(pipelineKey) 取该 todo 自己的 pipeline：
   *   - leader-plan origin: pipelineKey === dimensionRef（reuse-recompute 路径就地更新此 grade）
   *   - leader-assess-retry (fresh-collect): pipelineKey === `${dim}:${retryLabel}`（独立 grade）
   *   - leader-assess-retry (reuse-recompute): 不创建此 todo，复用原 dim todo
   * undefined 表示沿用 dimensionRef 默认索引（兼容旧数据）
   */
  pipelineKey?: string;
  /** retry 原始 strategy，仅 leader-assess-retry/replace/extend origin 设置 */
  retryStrategy?: 'fresh-collect' | 'reuse-recompute';
}

export interface DeriveTodoArgs {
  events: PlaygroundEvent[];
  mission: MissionState;
  agents: AgentLiveState[];
  verdicts: VerifierVerdict[];
  dimensionPipelines: Map<string, DimensionPipelineState>;
}

export function deriveTodoLedger(args: DeriveTodoArgs): MissionTodo[] {
  const { events, agents, dimensionPipelines } = args;
  const todos = new Map<string, MissionTodo>();
  const order: string[] = [];

  const upsert = (
    id: string,
    init: () => MissionTodo,
    mutate?: (t: MissionTodo) => void
  ) => {
    let cur = todos.get(id);
    if (!cur) {
      cur = init();
      todos.set(id, cur);
      order.push(id);
    }
    if (mutate) mutate(cur);
    return cur;
  };

  const addNarrative = (
    todoId: string,
    ts: number,
    text: string,
    tone: MissionTodoNarrativeItem['tone'] = 'info'
  ) => {
    const cur = todos.get(todoId);
    if (!cur) return;
    if (
      cur.narrativeLog.length > 0 &&
      cur.narrativeLog[cur.narrativeLog.length - 1].text === text
    ) {
      return;
    }
    cur.narrativeLog.push({ ts, text, tone });
  };

  const systemStageInit = (
    stageId: SystemStageId,
    title: string,
    reason: string,
    assigneeRole: MissionTodoAssignee['role'],
    ts: number
  ): MissionTodo => ({
    id: `system:${stageId}`,
    origin: 'system-stage',
    createdBy: 'system',
    createdAt: ts,
    reasonText: reason,
    scope: 'system',
    title,
    assignee: { role: assigneeRole },
    status: 'pending',
    artifacts: [],
    narrativeLog: [],
    systemStageId: stageId,
  });

  // ★ 2026-04-30: mission:started 时一次性预占 12 个 stage 占位卡，避免任务列表
  //   只显示已经 fired 的 stage，让用户看不到后续会做什么。各 stage 收到自己的
  //   stage:started 时会被 promote 到 in_progress（保留预占的 title/description）。
  const SYSTEM_STAGE_PRESETS: {
    id: SystemStageId;
    title: string;
    desc: string;
    role:
      | 'mission'
      | 'leader'
      | 'researcher'
      | 'reconciler'
      | 'analyst'
      | 'writer'
      | 'critic';
  }[] = [
    {
      id: 's1-budget',
      title: '预算闸门 + Mission 启动',
      desc: '根据用户档位（depth × budgetProfile）估算 token 预算并校验余额',
      role: 'mission',
    },
    {
      id: 's2-leader-plan',
      title: 'Leader 拆解任务',
      desc: 'Leader 看 topic，产出 themeSummary + 多个研究维度并声明 successCriteria',
      role: 'leader',
    },
    {
      id: 's3-researchers',
      title: '维度并行研究',
      desc: '按 Leader 拆解的维度并行派遣 Researcher，每人负责一个维度的资料采集',
      role: 'researcher',
    },
    {
      id: 's4-leader-assess',
      title: 'Leader 评审 Researcher 产出',
      desc: '看 finding 数量 / summary 质量，决定 retry / abort / extend / accept',
      role: 'leader',
    },
    {
      id: 's5-reconciler',
      title: '跨维度对账',
      desc: 'Reconciler 把所有维度的 finding 收齐做事实抽取、冲突检测、缺口识别',
      role: 'reconciler',
    },
    {
      id: 's6-analyst',
      title: '综合分析',
      desc: 'Analyst 把对账后的 fact + 各维度 findings 综合成 mission-level insight',
      role: 'analyst',
    },
    {
      id: 's7-writer-outline',
      title: '撰写大纲',
      desc: 'Writer 根据综合分析产出 mission-level chapter outline（thorough+ 档位启用）',
      role: 'writer',
    },
    {
      id: 's8-writer-draft',
      title: '撰写报告',
      desc: 'Writer 起草报告并由 L3 verifier 三路评分；若分数低于阈值会触发重写',
      role: 'writer',
    },
    {
      id: 's8b-quality-enhancement',
      title: '章节质量闭环',
      desc: '对每个章节跑 4 维自评（深度/证据/可操作/写作），弱维度自动 LLM 补救并强制重评',
      role: 'writer',
    },
    {
      id: 's9-critic-l4',
      title: 'L4 独立复审 · 盲点 / 偏见 / 建议',
      desc: 'Critic 独立复审，从盲点 / 偏见 / 改进建议三个维度审视报告',
      role: 'critic',
    },
    {
      id: 's9b-objective-evaluation',
      title: '10 维客观评审',
      desc: 'EVALUATOR 模型独立给每章按 10 维打分（事实/深度/证据/密度/逻辑/可视/写作/原创/时效/可操作）',
      role: 'critic',
    },
    {
      id: 's10-leader-signoff',
      title: 'Leader 签字',
      desc: 'Leader 综合所有产出 + Critic 警示，写综合摘要 + 签字（accountabilityNote）',
      role: 'leader',
    },
    {
      id: 's11-persist',
      title: '持久化',
      desc: '把 reportArtifact + leaderSignOff + verdicts 等终态产物落盘到 DB',
      role: 'mission',
    },
    {
      id: 's12-self-evolution',
      title: '自我进化',
      desc: '复盘 + FailureLearner / postmortem 入向量记忆，下次同主题召回历史经验',
      role: 'mission',
    },
  ];
  // 启动时一次性创建所有 stage 占位 todo（S1 立刻 in_progress，其它保持 pending）
  for (const ev of events) {
    if (ev.type === 'agent-playground.mission:started') {
      for (const preset of SYSTEM_STAGE_PRESETS) {
        upsert(
          `system:${preset.id}`,
          () =>
            systemStageInit(
              preset.id,
              preset.title,
              preset.desc,
              preset.role,
              ev.timestamp
            ),
          (t) => {
            if (preset.id === 's1-budget' && t.status === 'pending') {
              t.status = 'in_progress';
              t.startedAt = ev.timestamp;
            }
          }
        );
      }
      break;
    }
  }

  for (const ev of events) {
    const t = ev.type;
    const p = (ev.payload ?? {}) as Record<string, unknown>;

    if (t === 'agent-playground.mission:started') {
      addNarrative(
        'system:s1-budget',
        ev.timestamp,
        'Mission 已启动，进入预算闸门',
        'info'
      );
    } else if (t === 'agent-playground.agent:narrative') {
      // 后端发来的人话叙事 —— 直接挂到对应 todo
      const stage = p.stage as string | undefined;
      const role = p.role as string | undefined;
      const tag = p.tag as string | undefined;
      const text = p.text as string | undefined;
      const dim = p.dimension as string | undefined;
      const evAgentId = ev.agentId;
      if (!text) continue;
      const tone: MissionTodoNarrativeItem['tone'] =
        tag === 'success'
          ? 'success'
          : tag === 'warning'
            ? 'warn'
            : tag === 'error'
              ? 'error'
              : 'info';
      let target: MissionTodo | undefined;
      if (dim) {
        target = order
          .map((id) => todos.get(id)!)
          .reverse()
          .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
      }
      if (!target && evAgentId) {
        target = order
          .map((id) => todos.get(id)!)
          .find((td) => td.agentRefId === evAgentId);
      }
      if (!target && stage) {
        target = todos.get(`system:${stage}`);
      }
      if (!target && role) {
        target = order
          .map((id) => todos.get(id)!)
          .find(
            (td) =>
              td.scope === 'system' &&
              (td.assignee.role === role ||
                (role === 'researcher' && td.id === 'system:s3-researchers') ||
                (role === 'reviewer' && td.id === 'system:s8-writer-draft'))
          );
      }
      if (target) addNarrative(target.id, ev.timestamp, text, tone);
    } else if (
      t === 'agent-playground.mission:budget-warning-soft' ||
      t === 'agent-playground.mission:budget-warning-hard'
    ) {
      const isHard = t.endsWith('hard');
      addNarrative(
        'system:s1-budget',
        ev.timestamp,
        isHard
          ? `预算硬告警：${(p.suggestion as string) ?? 'abort'}（短缺 ${(p.shortfall as number) ?? '?'} credits）`
          : `预算软告警：估算超出建议但可继续`,
        isHard ? 'error' : 'warn'
      );
    } else if (t === 'agent-playground.stage:started') {
      const stage = p.stage as string | undefined;
      if (stage === 'leader') {
        upsert(
          'system:s2-leader-plan',
          () =>
            systemStageInit(
              's2-leader-plan',
              'Leader 拆解任务',
              'Leader 看 topic，产出 themeSummary + 多个研究维度并声明 successCriteria',
              'leader',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
            const s1 = todos.get('system:s1-budget');
            if (s1 && s1.status !== 'done' && s1.status !== 'failed') {
              s1.status = 'done';
              s1.endedAt = ev.timestamp;
              s1.artifacts.push({
                kind: 'finding-count',
                label: '余额校验通过',
              });
            }
          }
        );
      } else if (stage === 'researchers') {
        const count = (p.count as number) ?? 0;
        const dims = (p.dimensions as string[]) ?? [];
        upsert(
          'system:s3-researchers',
          () =>
            systemStageInit(
              's3-researchers',
              `维度并行研究 · ${count} 个 Researcher`,
              '按 Leader 拆解的维度并行派遣 Researcher，每人负责一个维度的资料采集',
              'researcher',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
            t0.title = `维度并行研究 · ${count} 个 Researcher`;
          }
        );
        if (dims.length > 0) {
          addNarrative(
            'system:s3-researchers',
            ev.timestamp,
            `派遣 ${count} 个 Researcher：${dims.slice(0, 3).join(' / ')}${dims.length > 3 ? '…' : ''}`
          );
        }
      } else if (stage === 'reconciler') {
        upsert(
          'system:s5-reconciler',
          () =>
            systemStageInit(
              's5-reconciler',
              '跨维度对账',
              'Reconciler 把所有维度的 finding 收齐做事实抽取、冲突检测、缺口识别',
              'reconciler',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 'analyst') {
        upsert(
          'system:s6-analyst',
          () =>
            systemStageInit(
              's6-analyst',
              '综合分析',
              'Analyst 把对账后的 fact + 各维度 findings 综合成 mission-level insight',
              'analyst',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 'writer') {
        upsert(
          'system:s8-writer-draft',
          () =>
            systemStageInit(
              's8-writer-draft',
              '撰写报告',
              'Writer 起草报告并由 L3 verifier 三路评分；若分数低于阈值会触发重写',
              'writer',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 's7-writer-outline') {
        // ★ 2026-04-30 (#62 截图 16): 补 s7-writer-outline stage:started handler
        upsert(
          'system:s7-writer-outline',
          () =>
            systemStageInit(
              's7-writer-outline',
              '撰写大纲',
              'Writer 规划 mission-level 章节大纲（thorough+ 档位启用）',
              'writer',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 'critic') {
        upsert(
          'system:s9-critic-l4',
          () =>
            systemStageInit(
              's9-critic-l4',
              'L4 独立复审 · 盲点 / 偏见 / 建议',
              'Critic 独立复审，从盲点 / 偏见 / 改进建议三个维度审视报告',
              'critic',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 's8b-quality-enhancement') {
        // ★ 2026-04-30: 沉淀 v3 quality 闭环阶段（4 维写中自评 + 弱维度自动补救）
        upsert(
          'system:s8b-quality-enhancement',
          () =>
            systemStageInit(
              's8b-quality-enhancement',
              '章节质量闭环',
              '对每个章节跑 4 维自评（深度/证据/可操作/写作），弱维度自动 LLM 补救并强制重评',
              'writer',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 's9b-objective-evaluation') {
        // ★ 2026-04-30: 沉淀 v3 quality 闭环阶段（10 维 EVALUATOR 模型客观评分）
        upsert(
          'system:s9b-objective-evaluation',
          () =>
            systemStageInit(
              's9b-objective-evaluation',
              '10 维客观评审',
              'EVALUATOR 模型独立给每章按 10 维打分（事实/深度/证据/密度/逻辑/可视/写作/原创/时效/可操作）',
              'critic',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      } else if (stage === 's12-self-evolution') {
        // ★ S12 自我进化（2026-04-30）：mission 完成后跑 fire-and-forget 复盘 +
        //   FailureLearner / postmortem 入向量记忆，下次同主题召回历史经验
        upsert(
          'system:s12-self-evolution',
          () =>
            systemStageInit(
              's12-self-evolution',
              '自我进化',
              '复盘 + FailureLearner / postmortem 入向量记忆，下次同主题召回历史经验',
              'mission',
              ev.timestamp
            ),
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = ev.timestamp;
          }
        );
      }
    } else if (t === 'agent-playground.stage:completed') {
      const stage = p.stage as string | undefined;
      if (stage === 'leader') {
        const dims =
          (p.dimensions as
            | { id: string; name: string; rationale: string }[]
            | undefined) ?? [];
        const themeSummary = p.themeSummary as string | undefined;
        const s2 = upsert('system:s2-leader-plan', () =>
          systemStageInit(
            's2-leader-plan',
            'Leader 拆解任务',
            '规划',
            'leader',
            ev.timestamp
          )
        );
        s2.status = 'done';
        s2.endedAt = ev.timestamp;
        s2.artifacts = [
          { kind: 'finding-count', label: '维度数', value: dims.length },
          ...(themeSummary
            ? [{ kind: 'finding-count' as const, label: '主题摘要已产出' }]
            : []),
        ];
        // 为每个 dim 创建 leader-plan todo（挂在 S3 并行研究阶段下，形成树状层级）
        dims.forEach((d, i) => {
          const id = `dim:${d.id}`;
          upsert(id, () => ({
            id,
            parentId: 'system:s3-researchers',
            origin: 'leader-plan',
            createdBy: 'leader',
            createdAt: ev.timestamp,
            reasonText: d.rationale,
            scope: 'dimension',
            title: d.name,
            assignee: {
              role: 'researcher',
              agentId: `researcher#${i}`,
              dimensionName: d.name,
            },
            status: 'pending',
            artifacts: [],
            narrativeLog: [
              {
                ts: ev.timestamp,
                text: `Leader 派下来：${d.rationale.slice(0, 120)}${d.rationale.length > 120 ? '…' : ''}`,
                tone: 'info',
              },
            ],
            dimensionRef: d.name,
            agentRefId: `researcher#${i}`,
          }));
        });
      } else if (stage === 'researchers') {
        const results =
          (p.results as
            | { dimension: string; findingsCount: number; summary: string }[]
            | undefined) ?? [];
        const s3 = upsert('system:s3-researchers', () =>
          systemStageInit(
            's3-researchers',
            '维度并行研究',
            '按 Leader 拆解的维度并行派遣 Researcher',
            'researcher',
            ev.timestamp
          )
        );
        s3.status = 'done';
        s3.endedAt = ev.timestamp;
        const okCount = results.filter((r) => r.findingsCount > 0).length;
        s3.artifacts = [
          {
            kind: 'finding-count',
            label: '完成 / 总数',
            value: `${okCount} / ${results.length}`,
          },
        ];
      } else if (stage === 'reconciler') {
        const s5 = upsert('system:s5-reconciler', () =>
          systemStageInit(
            's5-reconciler',
            '跨维度对账',
            '对账',
            'reconciler',
            ev.timestamp
          )
        );
        s5.status = (p.state as string) === 'completed' ? 'done' : 'failed';
        s5.endedAt = ev.timestamp;
      } else if (stage === 'analyst') {
        const s6 = upsert('system:s6-analyst', () =>
          systemStageInit(
            's6-analyst',
            '综合分析',
            '综合',
            'analyst',
            ev.timestamp
          )
        );
        s6.status = 'done';
        s6.endedAt = ev.timestamp;
        s6.artifacts = [
          {
            kind: 'insight-count',
            label: '核心洞察',
            value: (p.insightsCount as number) ?? 0,
          },
        ];
        // ★ P1-LIVE-STATUS-INCONSISTENT (2026-04-30): reconciler-gap todo 之前
        //   永远停在 pending，drawer 顶部显示"待启动"但下方 narrative 已经有
        //   "Reconciler 标记 N 处缺口"。Analyst stage 完成 = 这些 gap 已被
        //   显式纳入综合分析（ctx.reconciliationReport 透传给 analyst.analyze），
        //   所以同步把 reconciler-gap todo 标 done。
        for (const t of todos.values()) {
          if (t.origin === 'reconciler-gap' && t.status === 'pending') {
            t.status = 'done';
            t.endedAt = ev.timestamp;
            t.narrativeLog.push({
              ts: ev.timestamp,
              text: 'Analyst 已纳入综合分析',
              tone: 'success',
            });
          }
        }
      } else if (stage === 's7-writer-outline') {
        // ★ 2026-04-30 (#62 截图 16): s7-writer-outline stage:completed handler
        const status = (p.status as string) ?? 'completed';
        const s7 = upsert('system:s7-writer-outline', () =>
          systemStageInit(
            's7-writer-outline',
            '撰写大纲',
            'Writer 规划 mission-level 章节大纲',
            'writer',
            ev.timestamp
          )
        );
        s7.status = status === 'failed' ? 'failed' : 'done';
        s7.endedAt = ev.timestamp;
        const chapterCount = p.chapterCount as number | undefined;
        if (typeof chapterCount === 'number' && chapterCount > 0) {
          s7.artifacts = [
            {
              kind: 'chapter',
              label: '章节大纲',
              value: `${chapterCount} 章`,
            },
          ];
        }
      } else if (stage === 'writer') {
        const s8 = upsert('system:s8-writer-draft', () =>
          systemStageInit(
            's8-writer-draft',
            '撰写报告',
            '撰写',
            'writer',
            ev.timestamp
          )
        );
        s8.status = 'done';
        s8.endedAt = ev.timestamp;
        const finalScore = p.finalScore as number | undefined;
        const attempts = p.attempts as number | undefined;
        s8.artifacts = [
          ...(finalScore != null
            ? [
                {
                  kind: 'verdict-score' as const,
                  label: '最终评分',
                  value: finalScore,
                },
              ]
            : []),
          ...(attempts != null && attempts > 1
            ? [
                {
                  kind: 'finding-count' as const,
                  label: '撰写迭代',
                  value: `${attempts} 轮`,
                },
              ]
            : []),
        ];
      } else if (stage === 's8b-quality-enhancement') {
        // ★ 2026-04-30 S8B 质量闭环 stage:completed
        const s8b = upsert('system:s8b-quality-enhancement', () =>
          systemStageInit(
            's8b-quality-enhancement',
            '章节质量闭环',
            '4 维自评 + 弱维度补救',
            'writer',
            ev.timestamp
          )
        );
        s8b.status = 'done';
        s8b.endedAt = ev.timestamp;
        const evalCount = p.evaluatedCount as number | undefined;
        const remCount = p.remediatedCount as number | undefined;
        const delta = p.avgScoreDelta as number | undefined;
        s8b.artifacts = [
          ...(typeof evalCount === 'number'
            ? [
                {
                  kind: 'finding-count' as const,
                  label: '评估章节',
                  value: evalCount,
                },
              ]
            : []),
          ...(typeof remCount === 'number'
            ? [
                {
                  kind: 'finding-count' as const,
                  label: '补救章节',
                  value: remCount,
                },
              ]
            : []),
          ...(typeof delta === 'number' && delta !== 0
            ? [
                {
                  kind: 'verdict-score' as const,
                  label: '平均提升',
                  value: `${delta > 0 ? '+' : ''}${delta.toFixed(1)}`,
                },
              ]
            : []),
        ];
      } else if (stage === 's9b-objective-evaluation') {
        // ★ 2026-04-30 S9B 10 维客观评审 stage:completed
        const status = (p.status as string) ?? 'completed';
        const s9b = upsert('system:s9b-objective-evaluation', () =>
          systemStageInit(
            's9b-objective-evaluation',
            '10 维客观评审',
            'EVALUATOR 模型独立打分',
            'critic',
            ev.timestamp
          )
        );
        s9b.status = status === 'failed' ? 'failed' : 'done';
        s9b.endedAt = ev.timestamp;
        const overall = p.overallScore as number | undefined;
        const grade = p.grade as string | undefined;
        s9b.artifacts = [
          ...(typeof overall === 'number'
            ? [
                {
                  kind: 'verdict-score' as const,
                  label: '总分',
                  value: `${overall}/100${grade ? ` (${grade})` : ''}`,
                },
              ]
            : []),
        ];
      } else if (stage === 's12-self-evolution') {
        // ★ S12 自我进化 stage:completed
        const status = (p.status as string) ?? 'completed';
        const s12 = upsert('system:s12-self-evolution', () =>
          systemStageInit(
            's12-self-evolution',
            '自我进化',
            '复盘 + 入向量记忆',
            'mission',
            ev.timestamp
          )
        );
        s12.status =
          status === 'failed'
            ? 'failed'
            : status === 'cancelled'
              ? 'cancelled'
              : 'done';
        s12.endedAt = ev.timestamp;
        const recCount = p.recommendationsCount as number | undefined;
        const leaderSigned = p.leaderSigned as boolean | null | undefined;
        s12.artifacts = [
          ...(recCount != null
            ? [
                {
                  kind: 'finding-count' as const,
                  label: '改进建议',
                  value: recCount,
                },
              ]
            : []),
          ...(leaderSigned === false
            ? [
                {
                  kind: 'finding-count' as const,
                  label: 'Leader 拒签',
                  value: '已记入 FailureLearner',
                },
              ]
            : []),
        ];
      }
    } else if (t === 'agent-playground.dimensions:appended') {
      const items =
        (p.items as { id: string; name: string; rationale: string }[]) ?? [];
      items.forEach((d) => {
        const id = `dim:${d.id}`;
        upsert(id, () => ({
          id,
          origin: 'leader-chat-create',
          createdBy: 'leader',
          createdAt: ev.timestamp,
          reasonText: d.rationale,
          scope: 'dimension',
          title: d.name,
          assignee: { role: 'researcher', dimensionName: d.name },
          status: 'pending',
          artifacts: [],
          narrativeLog: [
            {
              ts: ev.timestamp,
              text: `Leader Chat 触发追加：${d.rationale.slice(0, 120)}`,
              tone: 'info',
            },
          ],
          dimensionRef: d.name,
        }));
      });
    } else if (t === 'agent-playground.leader:decision') {
      const phase = p.phase as string | undefined;
      if (phase === 'assess-research-dispatched') {
        const stats = (p.stats as Record<string, number>) ?? {};
        const decisionMsg = `重派 ${stats.retried ?? 0} / 中止 ${stats.aborted ?? 0} / 追加 ${stats.appended ?? 0} / 跳过 ${stats.skipped ?? 0}`;
        upsert(
          'system:s4-leader-assess',
          () => {
            const t0 = systemStageInit(
              's4-leader-assess',
              'Leader 评审 Researcher 产出',
              'Leader 看每个 dim 的 finding 数 / 来源质量，给出 accept / patch / redirect / abort 决策',
              'leader',
              ev.timestamp
            );
            t0.agentRefId = 'leader'; // 让抽屉关联 Leader trace（thought / action）
            return t0;
          },
          (t0) => {
            t0.status = 'done';
            t0.endedAt = ev.timestamp;
            t0.agentRefId = t0.agentRefId ?? 'leader';
            t0.artifacts = [
              {
                kind: 'finding-count',
                label: '维度调度',
                value: decisionMsg,
              },
            ];
            addNarrative(
              t0.id,
              ev.timestamp,
              `调度完成 · ${decisionMsg}（重派=同 Researcher 加补丁再做一遍 / 中止=放弃 / 追加=新加维度 / 跳过=已合格）`,
              'success'
            );
          }
        );
      } else if (phase === 'assess-research') {
        const rationale = p.rationale as string | undefined;
        const perDim =
          (p.perDimension as
            | {
                dimensionId?: string;
                dimensionName?: string;
                action?: string;
                patches?: string[];
                rationale?: string;
              }[]
            | undefined) ?? [];
        const decision = p.decision as string | undefined;
        upsert(
          'system:s4-leader-assess',
          () => {
            const t0 = systemStageInit(
              's4-leader-assess',
              'Leader 评审 Researcher 产出',
              'Leader 看每个 dim 的 finding 数 / 来源质量，给出 accept / patch / redirect / abort 决策',
              'leader',
              ev.timestamp
            );
            t0.agentRefId = 'leader';
            return t0;
          },
          (t0) => {
            t0.status = 'in_progress';
            t0.startedAt = t0.startedAt ?? ev.timestamp;
            t0.agentRefId = t0.agentRefId ?? 'leader';
            if (decision) {
              addNarrative(
                t0.id,
                ev.timestamp,
                `Leader 评审决策：${decision}（accept=全收 / patch=补丁后再做 / redirect=换路线 / abort=放弃）`,
                'info'
              );
            }
            if (rationale && rationale.trim().length > 0) {
              addNarrative(
                t0.id,
                ev.timestamp,
                `理由：${rationale.slice(0, 400)}${rationale.length > 400 ? '…' : ''}`,
                'info'
              );
            }
            for (const d of perDim) {
              const name = d.dimensionName ?? d.dimensionId ?? '?';
              const action = d.action ?? '-';
              const patches =
                (d.patches ?? []).slice(0, 3).join(' · ') ||
                d.rationale?.slice(0, 120) ||
                '';
              addNarrative(
                t0.id,
                ev.timestamp,
                `${name} → ${action}${patches ? `：${patches}` : ''}`,
                action === 'accept' ? 'success' : 'info'
              );
            }
          }
        );
      }
    } else if (t === 'agent-playground.leader:foreword') {
      upsert(
        'system:s10-leader-signoff',
        () =>
          systemStageInit(
            's10-leader-signoff',
            'Leader 终审签字',
            'Leader 综合所有产出写前言并对最终交付物签字',
            'leader',
            ev.timestamp
          ),
        (t0) => {
          t0.status = 'in_progress';
          t0.startedAt = t0.startedAt ?? ev.timestamp;
          t0.artifacts.push({ kind: 'foreword', label: '前言已写' });
        }
      );
    } else if (t === 'agent-playground.leader:signed') {
      const score = p.leaderOverallScore as number | undefined;
      const verdict = p.leaderVerdict as string | undefined;
      const signed = p.signed as boolean | undefined;
      upsert(
        'system:s10-leader-signoff',
        () =>
          systemStageInit(
            's10-leader-signoff',
            'Leader 终审签字',
            'Leader 终审',
            'leader',
            ev.timestamp
          ),
        (t0) => {
          t0.status = signed === false ? 'failed' : 'done';
          t0.endedAt = ev.timestamp;
          if (score != null) {
            t0.artifacts.push({
              kind: 'verdict-score',
              label: 'Leader 总评',
              value: `${score}/100`,
            });
          }
          if (verdict) {
            t0.artifacts.push({
              kind: 'finding-count',
              label: 'Verdict',
              value: verdict,
            });
          }
        }
      );
    } else if (t === 'agent-playground.dimension:retrying') {
      const dim = p.dimension as string | undefined;
      const reason = p.reason as string | undefined;
      const critique = p.critique as string | undefined;
      const willExecute = (p.willExecute as boolean | undefined) ?? true;
      const isLeaderTriggered =
        reason === 'leader-assess-retry' ||
        reason === 'leader-assess-replace' ||
        reason === 'leader-assess-abort' ||
        reason === 'leader-assess-extend';
      const parentTodo = order
        .map((id) => todos.get(id)!)
        .find(
          (td) =>
            td.scope === 'dimension' &&
            td.dimensionRef === dim &&
            td.status !== 'cancelled'
        );
      if (!dim) continue;
      // ★ leader-chat-create + willExecute=false：仅是登记事件，不创建 retry 子任务
      //   （父 dim 由 dimensions:appended 处理器创建为 status=pending）
      //   避免子任务标 in_progress 误导用户以为在跑
      if (reason === 'leader-chat-create' && !willExecute) {
        if (parentTodo) {
          addNarrative(
            parentTodo.id,
            ev.timestamp,
            (p.note as string | undefined) ??
              '已登记，待 orchestrator 在下一阶段拉起',
            'info'
          );
        }
        continue;
      }
      if (reason === 'leader-assess-abort' && parentTodo) {
        parentTodo.status = 'cancelled';
        parentTodo.endedAt = ev.timestamp;
        addNarrative(
          parentTodo.id,
          ev.timestamp,
          `Leader 评审决定：放弃该维度（${critique?.slice(0, 100) ?? ''}）`,
          'warn'
        );
        continue;
      }
      // ★ 2026-04-30 REDESIGN (task #61): retry 双路径分流
      const strategy =
        (p.strategy as 'fresh-collect' | 'reuse-recompute' | undefined) ??
        'fresh-collect';
      const retryLabel = p.retryLabel as string | undefined;
      // reuse-recompute 路径：不创建子 todo，原 dim todo 退回 in_progress + 清旧 grade artifacts
      if (isLeaderTriggered && strategy === 'reuse-recompute' && parentTodo) {
        if (parentTodo.status === 'done' || parentTodo.status === 'failed') {
          parentTodo.status = 'in_progress';
          parentTodo.endedAt = undefined;
        }
        parentTodo.artifacts = parentTodo.artifacts.filter(
          (a) => a.kind !== 'verdict-score' && a.label !== '维度评分'
        );
        addNarrative(
          parentTodo.id,
          ev.timestamp,
          `Leader 评审重派（利旧重算）：${critique?.slice(0, 200) ?? '复用 findings，重写章节 + 重新评分'}`,
          'warn'
        );
        continue;
      }
      // fresh-collect 路径：创建独立子 todo，pipelineKey 隔离避免借用原 dim grade
      const childOrigin: MissionTodoOrigin = isLeaderTriggered
        ? reason === 'leader-assess-replace'
          ? 'leader-assess-replace'
          : reason === 'leader-assess-extend'
            ? 'leader-assess-extend'
            : 'leader-assess-retry'
        : 'self-heal-retry';
      const childId = `${parentTodo?.id ?? `dim:${dim}`}:retry@${ev.timestamp}`;
      const pipelineKey = retryLabel ? `${dim}:${retryLabel}` : undefined;
      upsert(childId, () => ({
        id: childId,
        parentId: parentTodo?.id,
        origin: childOrigin,
        createdBy: isLeaderTriggered ? 'leader' : 'system',
        createdAt: ev.timestamp,
        reasonText:
          critique ??
          (isLeaderTriggered
            ? 'Leader 在评审阶段要求重做该维度'
            : `自愈重试（上一轮失败码 ${reason ?? '未知'}）`),
        scope: 'dimension',
        title: `${dim} · 重试`,
        assignee: { role: 'researcher', dimensionName: dim },
        status: 'in_progress',
        startedAt: ev.timestamp,
        artifacts: [],
        narrativeLog: [
          {
            ts: ev.timestamp,
            text: isLeaderTriggered
              ? `Leader 触发重派（重新采集）：${critique?.slice(0, 150) ?? '提升覆盖率与来源质量'}`
              : `自愈重试（上一轮 ${reason}）`,
            tone: isLeaderTriggered ? 'info' : 'warn',
          },
        ],
        dimensionRef: dim,
        pipelineKey,
        retryStrategy: isLeaderTriggered ? strategy : undefined,
      }));
      if (parentTodo) {
        if (
          isLeaderTriggered &&
          (parentTodo.status === 'done' || parentTodo.status === 'failed')
        ) {
          parentTodo.status = 'in_progress';
          parentTodo.endedAt = undefined;
        }
        addNarrative(
          parentTodo.id,
          ev.timestamp,
          isLeaderTriggered
            ? `Leader 触发重派（重新采集）：${critique?.slice(0, 200) ?? '需要补充证据'}`
            : '触发自愈重试',
          'warn'
        );
      }
    } else if (t === 'agent-playground.dimension:retry-failed') {
      // ★ P0-LIVE-PATCH-SILENT (2026-04-30): S4 retry 失败显式收尾对应 retry todo。
      //   找最近的 leader-assess-* origin todo 匹配 dimensionRef，标 failed。
      const dim = p.dimension as string | undefined;
      const error = p.error as string | undefined;
      if (dim) {
        const target = order
          .map((id) => todos.get(id)!)
          .reverse()
          .find(
            (td) =>
              td.scope === 'dimension' &&
              td.dimensionRef === dim &&
              (td.origin === 'leader-assess-retry' ||
                td.origin === 'leader-assess-replace' ||
                td.origin === 'leader-assess-extend') &&
              td.status !== 'cancelled' &&
              td.status !== 'done'
          );
        if (target) {
          target.status = 'failed';
          target.endedAt = ev.timestamp;
          target.narrativeLog.push({
            ts: ev.timestamp,
            text: `Leader 重派失败：${error ?? '无具体错误'}（本维度沿用首轮 findings）`,
            tone: 'error',
          });
        }
      }
    } else if (t === 'agent-playground.mission:degraded') {
      // ★ P0-LIVE-PATCH-SILENT (2026-04-30): S4 patch 失败导致 mission degraded。
      //   附在 s11-persist 的 narrative 上，让用户看到 mission 完成但是有缺陷。
      const reason = (p.reason as string) ?? 'unknown';
      const failedCount = (p.failedCount as number) ?? 0;
      addNarrative(
        'system:s4-leader-assess',
        ev.timestamp,
        `Mission 标记 degraded：${reason} (${failedCount} 项失败)，下游 Leader signoff 将强制拒签`,
        'warn'
      );
    } else if (t === 'agent-playground.researcher:completed') {
      const dim = (p.dimension as string | undefined) ?? '';
      const cnt = (p.findingsCount as number | undefined) ?? 0;
      const state = p.state as string | undefined;
      const summary = p.summary as string | undefined;
      // ★ 2026-04-30 fix (#37): retryLabel 存在时这是 retry researcher 完成事件，
      //   找匹配的 leader-assess-* retry child todo 收尾，不污染原始 dim todo。
      //   修了 retry todo 借用第一次 grade 显示假完成的 bug。
      const retryLabel = p.retryLabel as string | undefined;
      if (retryLabel) {
        const retryTarget = order
          .map((id) => todos.get(id)!)
          .reverse()
          .find(
            (td) =>
              td.scope === 'dimension' &&
              td.dimensionRef === dim &&
              (td.origin === 'leader-assess-retry' ||
                td.origin === 'leader-assess-replace' ||
                td.origin === 'leader-assess-extend') &&
              td.status === 'in_progress'
          );
        if (retryTarget) {
          retryTarget.artifacts.push({
            kind: 'finding-count',
            label: 'retry 后 finding',
            value: cnt,
          });
          if (summary && summary.trim().length > 8) {
            retryTarget.artifacts.push({
              kind: 'finding-count',
              label: 'retry summary',
              value: summary.slice(0, 200),
            });
          }
          retryTarget.status = 'done';
          retryTarget.endedAt = ev.timestamp;
          retryTarget.narrativeLog.push({
            ts: ev.timestamp,
            text: `重派 researcher 完成 · ${cnt} 条新 finding（独立于第一次 grade）`,
            tone: 'success',
          });
        }
        continue;
      }
      const target = order
        .map((id) => todos.get(id)!)
        .reverse()
        .find(
          (td) =>
            td.scope === 'dimension' &&
            td.dimensionRef === dim &&
            td.origin === 'leader-plan'
        );
      if (!target) continue;
      if (state === 'completed') {
        // ★ 修复：researcher 采集只是 dim 任务的第一步，下游还有：
        //    章节 outline → 章节撰写 × N → 章节复审 × N → 维度 5 轴评分
        //    这里只记录"采集完成"里程碑，整体状态保持 in_progress；
        //    真正 done 的判定下沉到下方 dimensionPipelines 兜底循环（grade 通过才标 done）。
        target.artifacts.push({
          kind: 'finding-count',
          label: '采集到 finding',
          value: cnt,
        });
        addNarrative(
          target.id,
          ev.timestamp,
          `数据采集完成 · ${cnt} 条 finding，进入章节撰写与复审`,
          'success'
        );
        if (summary && summary.trim().length > 8) {
          addNarrative(
            target.id,
            ev.timestamp,
            `采集摘要：${summary.slice(0, 200)}${summary.length > 200 ? '…' : ''}`,
            'info'
          );
        }
      } else {
        target.status = 'failed';
        target.endedAt = ev.timestamp;
        addNarrative(
          target.id,
          ev.timestamp,
          `采集失败（state=${state}）`,
          'error'
        );
      }
    } else if (t === 'agent-playground.dimension:degraded') {
      const dim = p.dimension as string | undefined;
      const innerCode = p.innerFailureCode as string | undefined;
      const target = order
        .map((id) => todos.get(id)!)
        .reverse()
        .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
      if (target) {
        if (target.status !== 'done') {
          target.status = 'failed';
          target.endedAt = ev.timestamp;
        }
        addNarrative(
          target.id,
          ev.timestamp,
          `维度降级（${innerCode ?? '未知失败码'}），下游 Analyst 走退化路径`,
          'warn'
        );
      }
    } else if (t === 'agent-playground.reconciliation:completed') {
      const factCount = (p.factCount as number) ?? 0;
      const conflicts = (p.conflictCount as number) ?? 0;
      const overlaps = (p.overlapCount as number) ?? 0;
      const gaps = (p.gapCount as number) ?? 0;
      const figs = (p.figureCandidateCount as number) ?? 0;
      const s5 = upsert('system:s5-reconciler', () =>
        systemStageInit(
          's5-reconciler',
          '跨维度对账',
          '对账',
          'reconciler',
          ev.timestamp
        )
      );
      s5.artifacts = [
        { kind: 'fact-table', label: '事实条目', value: factCount },
        { kind: 'finding-count', label: '冲突', value: conflicts },
        { kind: 'finding-count', label: '重叠', value: overlaps },
        { kind: 'finding-count', label: '缺口', value: gaps },
        { kind: 'figure', label: '图候选', value: figs },
      ];
      if (gaps > 0) {
        const gapId = `gap:reconciler@${ev.timestamp}`;
        upsert(gapId, () => ({
          id: gapId,
          origin: 'reconciler-gap',
          createdBy: 'reconciler',
          createdAt: ev.timestamp,
          reasonText: `对账时发现 ${gaps} 处跨维度缺口，建议下游 Analyst 显式标注未覆盖区域`,
          scope: 'review',
          title: `跨维度缺口 · ${gaps} 处`,
          assignee: { role: 'analyst' },
          status: 'pending',
          artifacts: [],
          narrativeLog: [
            {
              ts: ev.timestamp,
              text: `Reconciler 标记 ${gaps} 处缺口`,
              tone: 'warn',
            },
          ],
        }));
      }
    } else if (t === 'agent-playground.chapter:revision') {
      // ★ 不再为每个 chapter 创建独立 todo —— 聚合为 dim todo 的"章节重写"
      //   计数 + 把 critique 追加到 dim 的 narrativeLog（保留可读时间线）。
      const dim = p.dimension as string | undefined;
      const idx = p.chapterIndex as number | undefined;
      if (!dim || idx == null) continue;
      const dimTodo = order
        .map((id) => todos.get(id)!)
        .reverse()
        .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
      if (!dimTodo) continue;
      const critique =
        (p.critique as string | undefined) ??
        'Chapter Reviewer 评分低于阈值，要求重写';
      // 累计该 dim 总重写次数
      const a = dimTodo.artifacts.find((x) => x.label === '章节重写');
      const next = ((a?.value as number | undefined) ?? 0) + 1;
      if (a) a.value = next;
      else
        dimTodo.artifacts.push({
          kind: 'finding-count',
          label: '章节重写',
          value: next,
        });
      // 简短叙事
      dimTodo.narrativeLog.push({
        ts: ev.timestamp,
        text: `第 ${idx} 章 · Reviewer 反馈重写（累计 ${next} 次）：${critique.slice(0, 80)}…`,
        tone: 'warn',
      });
    } else if (t === 'agent-playground.critic:verdict') {
      const warnings =
        (p.warnings as
          | { kind: string; message: string; severity?: string }[]
          | undefined) ?? [];
      const overall = p.overall as string | undefined;
      const s9 = upsert(
        'system:s9-critic-l4',
        () =>
          systemStageInit(
            's9-critic-l4',
            'L4 独立复审 · 盲点 / 偏见 / 建议',
            'Critic 独立复审',
            'critic',
            ev.timestamp
          ),
        (t0) => {
          t0.status = 'done';
          t0.endedAt = ev.timestamp;
          t0.artifacts = [
            { kind: 'critic-warning', label: '警示', value: warnings.length },
            ...(overall
              ? [
                  {
                    kind: 'finding-count' as const,
                    label: '总评',
                    value: overall,
                  },
                ]
              : []),
          ];
        }
      );
      // ★ 2026-04-30: warnings 不再每条独立成 todo（之前 10+ 警示就是 10+ todo 条
      //   霸占任务列表）；改为合并到 s9 主 todo 的 narrativeLog 显示。
      warnings.forEach((w) => {
        const tagPrefix =
          w.kind === 'l4-blindspot'
            ? '盲点'
            : w.kind === 'l4-bias'
              ? '偏见'
              : w.kind === 'l4-suggestion'
                ? '建议'
                : 'L4 警示';
        addNarrative(
          s9.id,
          ev.timestamp,
          `${tagPrefix}：${w.message}`,
          w.severity === 'error' ? 'error' : 'warn'
        );
      });
    } else if (t === 'agent-playground.mission:completed') {
      upsert(
        'system:s11-persist',
        () =>
          systemStageInit(
            's11-persist',
            '落库 + 索引',
            '把 mission 全部产出（report / artifact / verdicts / cost）写入数据库',
            'mission',
            ev.timestamp
          ),
        (t0) => {
          t0.status = 'done';
          t0.endedAt = ev.timestamp;
        }
      );
      addNarrative(
        'system:s11-persist',
        ev.timestamp,
        'Mission 完成 · 已持久化',
        'success'
      );
      // ★ P0-LIVE-MISSION-DONE-LEFTOVER (2026-04-30): mission 成功完成时把所有
      //   非终态 todo 一次性 finalize，避免 UI 显示 mission 已完成但部分 todo
      //   仍挂在"进行中"/"待启动"。常见情形：leader-assess-retry 派的二轮 dim
      //   todo / chapter pipeline 子任务，后端没单独 emit 终态事件。
      //   - in_progress → done (mission 都成功了说明它的产出被纳入)
      //   - pending → cancelled (不会再跑)
      //   - 已终态 (done/failed/cancelled) 保留不动
      for (const id of order) {
        const td = todos.get(id)!;
        if (
          td.status === 'done' ||
          td.status === 'failed' ||
          td.status === 'cancelled'
        ) {
          continue;
        }
        if (td.status === 'in_progress') {
          td.status = 'done';
          td.endedAt = ev.timestamp;
          td.narrativeLog.push({
            ts: ev.timestamp,
            text: 'Mission 完成时自动结收（由 mission:completed 终化）',
            tone: 'info',
          });
        } else if (td.status === 'pending') {
          td.status = 'cancelled';
          td.endedAt = ev.timestamp;
          td.narrativeLog.push({
            ts: ev.timestamp,
            text: 'Mission 已完成，本任务未启动即终结',
            tone: 'info',
          });
        }
      }
    } else if (t === 'agent-playground.mission:failed') {
      // ★ P0-LIVE-UI-STATUS (2026-04-30): mission 失败时所有非终态 todo 都
      //   要 finalize，否则 UI 永远显示"进行中"和已死的 mission 矛盾。
      //   - system scope in_progress → failed（真正挂掉的那个 stage）
      //   - 其它 scope (dimension / review / chapter) in_progress → cancelled（被中断）
      //   - pending 任何 scope → cancelled（不会再跑）
      //   只有终态 (done / failed / cancelled) 保留不动。
      const failMsg = (p.message as string) ?? '未知错误';
      for (const id of order) {
        const td = todos.get(id)!;
        if (
          td.status === 'done' ||
          td.status === 'failed' ||
          td.status === 'cancelled'
        ) {
          continue;
        }
        if (td.scope === 'system' && td.status === 'in_progress') {
          td.status = 'failed';
          td.endedAt = ev.timestamp;
          addNarrative(
            td.id,
            ev.timestamp,
            `Mission 失败：${failMsg}`,
            'error'
          );
        } else {
          // dimension / review / chapter / 其它 scope —— 中断而非失败
          td.status = 'cancelled';
          td.endedAt = ev.timestamp;
          addNarrative(
            td.id,
            ev.timestamp,
            `Mission 失败，子任务中断（${failMsg}）`,
            'warn'
          );
        }
      }
    }
  }

  // 用 agents.phase 反向覆盖 dim todos 的 in_progress / done 状态
  const dimTodos = order
    .map((id) => todos.get(id)!)
    .filter((td) => td.scope === 'dimension');
  for (const td of dimTodos) {
    if (!td.dimensionRef) continue;
    const matching = agents.find(
      (a) => a.dimension === td.dimensionRef && a.role === 'researcher'
    );
    if (!matching) continue;
    // 不论 td 之前是 pending 还是 in_progress，都允许 agent.phase 直接覆盖
    // （agent 可能直接从 pending → completed，跳过 running 观察）
    if (matching.phase === 'completed') {
      td.status = 'done';
      td.startedAt = td.startedAt ?? matching.startedAt ?? td.createdAt;
      td.endedAt = matching.endedAt ?? td.endedAt;
    } else if (matching.phase === 'failed' && td.status !== 'cancelled') {
      td.status = 'failed';
      td.startedAt = td.startedAt ?? matching.startedAt ?? td.createdAt;
      td.endedAt = matching.endedAt ?? td.endedAt;
    } else if (matching.phase === 'running' && td.status === 'pending') {
      td.status = 'in_progress';
      td.startedAt = matching.startedAt ?? td.createdAt;
    }
    if (matching.phase === 'failed' && td.status !== 'cancelled') {
      td.status = 'failed';
      td.endedAt = matching.endedAt;
    }
  }

  // 用 dimensionPipelines 给 dim todos 补 chapter 产出 + 校准真实完成状态
  // ★ 核心规则：dim 只有在「所有章节通过 + 5 轴评分出炉」后才算 done；
  //    否则一律保持 in_progress（包括"采集完成、撰写中"、"复审中"等中间态）。
  // ★ 2026-04-30 fix (#37): 仅对原始 leader-plan dim todo 应用兜底，retry 子 todo
  //   有自己的 lifecycle（researcher:completed with retryLabel → 直接 done）。
  //   之前所有 dim-scope todo 都被 grade 驱动，导致 retry 子 todo 借用第一次的
  //   grade 显示"已完成 80/100"，与原 dim 完全相同分数的假象。
  for (const td of dimTodos) {
    if (!td.dimensionRef) continue;
    if (
      td.origin === 'leader-assess-retry' ||
      td.origin === 'leader-assess-replace' ||
      td.origin === 'leader-assess-extend' ||
      td.origin === 'leader-assess-abort'
    ) {
      continue; // retry 子 todo 由自己的 researcher:completed 事件收尾
    }
    const pipeline = dimensionPipelines.get(td.dimensionRef);
    if (!pipeline || pipeline.chapters.length === 0) {
      // 还没起 outline → 维持 in_progress（researcher 在采集 / 等下游）
      if (td.status !== 'failed' && td.status !== 'cancelled') {
        td.status = 'in_progress';
      }
      continue;
    }
    const total = pipeline.chapters.length;
    const passed = pipeline.chapters.filter(
      (c) => c.status === 'passed'
    ).length;
    const failed = pipeline.chapters.filter(
      (c) => c.status === 'failed'
    ).length;

    td.artifacts.push({
      kind: 'chapter',
      label: '章节通过 / 总数',
      value: `${passed} / ${total}`,
    });
    if (pipeline.grade) {
      td.artifacts.push({
        kind: 'verdict-score',
        label: '维度评分',
        value: `${pipeline.grade.overall}/100`,
      });
    }

    // 状态校准：必须 chapters 全过 + grade 出炉
    if (td.status !== 'failed' && td.status !== 'cancelled') {
      if (failed > 0) {
        td.status = 'failed';
      } else if (passed === total && pipeline.grade) {
        td.status = 'done';
      } else {
        td.status = 'in_progress';
        td.endedAt = undefined;
      }
    }
  }

  // ★ 2026-04-30 (#63 截图 17 任务顺序混乱): 按"逻辑流程顺序"重排，避免按事件追加顺序
  //   导致 dim todo（leader plan 后才创建）排在所有 system stage 占位之后。
  //   排序 key = (stageOrder, originSubOrder, createdAt) 三元组。
  const STAGE_ORDER: Record<SystemStageId, number> = {
    's1-budget': 100,
    's2-leader-plan': 200,
    // dim leader-plan todos 排在 s2 后、s3 前
    's3-researchers': 400,
    's4-leader-assess': 500,
    // dim retry todos (leader-assess-retry/replace/extend) 排在 s4 后、s5 前
    's5-reconciler': 700,
    's6-analyst': 800,
    's7-writer-outline': 900,
    's8-writer-draft': 1000,
    's8b-quality-enhancement': 1100,
    's9-critic-l4': 1200,
    's9b-objective-evaluation': 1300,
    's10-leader-signoff': 1400,
    's11-persist': 1500,
    's12-self-evolution': 1600,
  };
  const ORIGIN_SUBORDER: Record<MissionTodoOrigin, number> = {
    'system-stage': 0, // 系统阶段卡按 stageOrder 直接排
    'leader-plan': 300, // s2 之后, s3 之前
    'leader-chat-create': 350,
    'leader-assess-retry': 600, // s4 之后, s5 之前
    'leader-assess-replace': 600,
    'leader-assess-extend': 600,
    'leader-assess-abort': 600,
    'self-heal-retry': 600,
    'reviewer-revise': 1050, // s8 之后
    'critic-blindspot': 1250, // s9 之后（理论上已不再创建独立 todo，仅向后兼容）
    'reconciler-gap': 750, // s5 之后
  };
  const sortKeyOf = (td: MissionTodo): number => {
    if (td.scope === 'system' && td.systemStageId) {
      return STAGE_ORDER[td.systemStageId] ?? 9999;
    }
    return ORIGIN_SUBORDER[td.origin] ?? 9999;
  };
  return order
    .map((id) => todos.get(id)!)
    .map((td, i) => ({ td, i }))
    .sort((a, b) => {
      const ka = sortKeyOf(a.td);
      const kb = sortKeyOf(b.td);
      if (ka !== kb) return ka - kb;
      // 同组内按 createdAt 升序，相等保持原 order（稳定排序 fallback）
      if (a.td.createdAt !== b.td.createdAt)
        return a.td.createdAt - b.td.createdAt;
      return a.i - b.i;
    })
    .map(({ td }) => td);
}

export interface MissionTodoLayer {
  id: 'AI-APP' | 'AI-HARNESS' | 'AI-ENGINE' | 'AI-INFRA';
  label: string;
  detail: string;
}

/**
 * 4 层架构面包屑 —— 给 drawer 顶部用
 * 根据 todo 的 systemStageId / origin 派生
 */
export function deriveLayerBreadcrumb(todo: MissionTodo): MissionTodoLayer[] {
  const harnessLoop = (() => {
    if (todo.scope === 'system' && todo.systemStageId) {
      switch (todo.systemStageId) {
        case 's2-leader-plan':
        case 's4-leader-assess':
        case 's10-leader-signoff':
          return 'Leader-Replanner-Lite';
        case 's3-researchers':
          return 'ReAct + 自愈';
        case 's5-reconciler':
        case 's9-critic-l4':
          return 'Judge';
        case 's6-analyst':
          return 'Reflexion';
        case 's7-writer-outline':
          return 'Planning';
        case 's8-writer-draft':
          return 'ReAct (自愈)';
        case 's1-budget':
        case 's11-persist':
          return '—';
        case 's12-self-evolution':
          return 'FailureLearner + VectorMemory';
      }
    }
    if (todo.scope === 'dimension') return 'ReAct + 自愈';
    if (todo.scope === 'chapter') return 'Chapter-pipeline';
    if (todo.scope === 'review') return 'Judge';
    return '—';
  })();

  const engineCapability = (() => {
    if (todo.scope === 'system' && todo.systemStageId) {
      switch (todo.systemStageId) {
        case 's2-leader-plan':
          return 'TaskProfile · Leader prompt';
        case 's3-researchers':
          return 'Tools · web-search / arxiv / scrape';
        case 's4-leader-assess':
          return 'TaskProfile · 决策提示';
        case 's5-reconciler':
          return 'Skills · 实体抽取 / 冲突检测';
        case 's6-analyst':
          return 'TaskProfile · 综合提示';
        case 's7-writer-outline':
        case 's8-writer-draft':
          return 'Skills · 写作 + 引用规范化';
        case 's9-critic-l4':
          return 'TaskProfile · 独立复审';
        case 's10-leader-signoff':
          return 'TaskProfile · 签字提示';
        case 's1-budget':
          return 'modelRouting · 预估';
        case 's11-persist':
          return 'memory · trajectory';
      }
    }
    if (todo.scope === 'dimension') return 'Tools · web-search / arxiv';
    if (todo.scope === 'chapter') return 'Skills · 写作';
    if (todo.scope === 'review') return 'Skills · 评审';
    return '—';
  })();

  const infraCapability = (() => {
    if (todo.systemStageId === 's1-budget') return 'Credits · 预估 + 闸门';
    if (todo.systemStageId === 's11-persist') return 'Storage · DB 落库';
    return 'Credits · BillingContext + tickCost';
  })();

  return [
    {
      id: 'AI-APP',
      label: 'AI-APP',
      detail: 'agent-playground · 原生 Agent Team',
    },
    {
      id: 'AI-HARNESS',
      label: 'AI-HARNESS',
      detail: harnessLoop,
    },
    {
      id: 'AI-ENGINE',
      label: 'AI-ENGINE',
      detail: engineCapability,
    },
    {
      id: 'AI-INFRA',
      label: 'AI-INFRA',
      detail: infraCapability,
    },
  ];
}
