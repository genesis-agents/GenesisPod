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
  | 's9-critic-l4'
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

  // 启动时种入 S1 budget todo
  for (const ev of events) {
    if (ev.type === 'agent-playground.mission:started') {
      upsert(
        'system:s1-budget',
        () =>
          systemStageInit(
            's1-budget',
            '预算闸门 + Mission 启动',
            '根据用户档位（depth × budgetProfile）估算 token 预算并校验余额',
            'mission',
            ev.timestamp
          ),
        (t) => {
          if (t.status === 'pending') {
            t.status = 'in_progress';
            t.startedAt = ev.timestamp;
          }
        }
      );
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
      const childOrigin: MissionTodoOrigin = isLeaderTriggered
        ? reason === 'leader-assess-replace'
          ? 'leader-assess-replace'
          : reason === 'leader-assess-extend'
            ? 'leader-assess-extend'
            : 'leader-assess-retry'
        : 'self-heal-retry';
      const childId = `${parentTodo?.id ?? `dim:${dim}`}:retry@${ev.timestamp}`;
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
              ? `Leader 触发重派：${critique?.slice(0, 150) ?? '提升覆盖率与来源质量'}`
              : `自愈重试（上一轮 ${reason}）`,
            tone: isLeaderTriggered ? 'info' : 'warn',
          },
        ],
        dimensionRef: dim,
      }));
      if (parentTodo) {
        // ★ 关键修复：Leader 重派时父 dim 从 done 回退到 in_progress，
        //   sub-status 才能在 UI 上显示"重派采集中"，让用户看到 dim 真在重做
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
            ? `Leader 触发重派：${critique?.slice(0, 200) ?? '需要补充证据'}`
            : '触发自愈重试',
          'warn'
        );
      }
    } else if (t === 'agent-playground.researcher:completed') {
      const dim = (p.dimension as string | undefined) ?? '';
      const cnt = (p.findingsCount as number | undefined) ?? 0;
      const state = p.state as string | undefined;
      const summary = p.summary as string | undefined;
      const target = order
        .map((id) => todos.get(id)!)
        .reverse()
        .find((td) => td.scope === 'dimension' && td.dimensionRef === dim);
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
      warnings.forEach((w, i) => {
        const wid = `critic:${ev.timestamp}#${i}`;
        upsert(wid, () => ({
          id: wid,
          parentId: s9.id,
          origin: 'critic-blindspot',
          createdBy: 'critic',
          createdAt: ev.timestamp,
          reasonText: w.message,
          scope: 'review',
          title: `${w.kind === 'l4-blindspot' ? '盲点' : w.kind === 'l4-bias' ? '偏见' : w.kind === 'l4-suggestion' ? '建议' : 'L4 警示'} · ${w.message.slice(0, 60)}`,
          assignee: { role: 'critic' },
          status: 'done',
          endedAt: ev.timestamp,
          artifacts: [],
          narrativeLog: [{ ts: ev.timestamp, text: w.message, tone: 'warn' }],
        }));
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
  for (const td of dimTodos) {
    if (!td.dimensionRef) continue;
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

  return order.map((id) => todos.get(id)!);
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
