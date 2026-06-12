'use client';

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/dialogs/Modal';
import {
  createCard,
  createEdge,
  type ForesightCard,
} from '@/services/foresight/api';
import { FORESIGHT_LAYERS, STAGE_META } from './foresight-meta';

const fieldCls =
  'w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:border-gray-700 focus:outline-none';
const labelCls = 'mb-1 block text-xs font-medium text-gray-600';

/** 按层级推荐下一个空闲编号（A-L{n}-{seq}），可手改 */
function suggestKey(cards: ForesightCard[], layer: string): string {
  const seqs = cards
    .filter((c) => c.layer === layer)
    .map((c) => parseInt(c.cardKey.split('-').pop() ?? '0', 10))
    .filter((n) => !Number.isNaN(n));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  return `A-${layer}-${String(next).padStart(2, '0')}`;
}

function splitLines(v: string): string[] {
  return v
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
}

interface CreateCardDialogProps {
  open: boolean;
  cards: ForesightCard[];
  onClose: () => void;
  onCreated: () => void;
}

/** 新建假设卡 —— 真实判断资产的手动录入通道（P0） */
export function CreateCardDialog({
  open,
  cards,
  onClose,
  onCreated,
}: CreateCardDialogProps) {
  const [layer, setLayer] = useState('L0');
  const [cardKey, setCardKey] = useState('');
  const [title, setTitle] = useState('');
  const [claim, setClaim] = useState('');
  const [conf, setConf] = useState('0.5');
  const [sens, setSens] = useState('mid');
  const [horizon, setHorizon] = useState('2028');
  const [stage, setStage] = useState('exploring');
  const [evidence, setEvidence] = useState('');
  const [falsifiers, setFalsifiers] = useState('');
  const [sources, setSources] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const effectiveKey = cardKey.trim() || suggestKey(cards, layer);

  async function handleSubmit() {
    if (!title.trim() || !claim.trim()) {
      setError('标题与断言为必填');
      return;
    }
    const fals = splitLines(falsifiers);
    if (fals.length === 0) {
      setError(
        '至少写一条证伪信号（falsifier）——写不出"什么情况出现说明这条假设错了"的断言不具备入库资格'
      );
      return;
    }
    const confNum = parseFloat(conf);
    if (Number.isNaN(confNum) || confNum < 0 || confNum > 1) {
      setError('置信度必须在 0–1 之间');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createCard({
        cardKey: effectiveKey,
        layer,
        title: title.trim(),
        claim: claim.trim(),
        conf: confNum,
        sens,
        horizon: parseInt(horizon, 10) || 2028,
        stage,
        evidence: splitLines(evidence),
        falsifiers: fals,
        sources: splitLines(sources).flatMap((line) => {
          const [org, t, type, url] = line.split('|').map((s) => s.trim());
          return org && t
            ? [{ org, title: t, type: type || 'report', url: url || '' }]
            : [];
        }),
        originType: 'manual',
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建假设卡"
      subtitle="一条可证伪的判断 — 证伪信号（falsifier）是入库门槛"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? '保存中…' : '入库'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>层级</label>
            <select
              value={layer}
              onChange={(e) => setLayer(e.target.value)}
              className={fieldCls}
            >
              {FORESIGHT_LAYERS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} {l.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>编号（留空自动）</label>
            <input
              value={cardKey}
              onChange={(e) => setCardKey(e.target.value)}
              placeholder={effectiveKey}
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>代际阶段</label>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className={fieldCls}
            >
              {Object.entries(STAGE_META).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>标题 *</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="如：HBM4 路线图兑现"
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>断言 *（具体、可检验，带量化指标）</label>
          <textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            rows={2}
            placeholder="如：HBM4 于 2026–27 量产，2028 单栈达 48GB / 2TB·s 级，供应不构成第一瓶颈。"
            className={fieldCls}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={labelCls}>置信度（0–1）</label>
            <input
              value={conf}
              onChange={(e) => setConf(e.target.value)}
              type="number"
              step="0.05"
              min="0"
              max="1"
              className={fieldCls}
            />
          </div>
          <div>
            <label className={labelCls}>敏感度</label>
            <select
              value={sens}
              onChange={(e) => setSens(e.target.value)}
              className={fieldCls}
            >
              <option value="high">高敏（翻了下游影响大）</option>
              <option value="mid">中敏</option>
              <option value="low">低敏</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Horizon（年份）</label>
            <input
              value={horizon}
              onChange={(e) => setHorizon(e.target.value)}
              type="number"
              min="2024"
              max="2045"
              className={fieldCls}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>
            证伪信号 *（每行一条 — 什么信号出现说明这条假设错了）
          </label>
          <textarea
            value={falsifiers}
            onChange={(e) => setFalsifiers(e.target.value)}
            rows={2}
            placeholder={
              'HBM4 良率爬坡延期超过 2 个季度\n头部买家锁产能造成结构性短缺'
            }
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>证据要点（每行一条，选填）</label>
          <textarea
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            rows={2}
            className={fieldCls}
          />
        </div>
        <div>
          <label className={labelCls}>
            信源（每行一条，格式：机构 | 标题 |
            类型(vendor/paper/report/oss/std) | URL，选填）
          </label>
          <textarea
            value={sources}
            onChange={(e) => setSources(e.target.value)}
            rows={2}
            placeholder="SK hynix | HBM4 量产节奏 Newsroom | vendor | https://news.skhynix.com"
            className={fieldCls}
          />
        </div>
      </div>
    </Modal>
  );
}

interface CreateEdgeDialogProps {
  open: boolean;
  cards: ForesightCard[];
  /** 预选上游卡（从详情面板进入时） */
  defaultFromKey?: string;
  onClose: () => void;
  onCreated: () => void;
}

/** 新建影响边 —— 跨层影响必须经过量化参数中转，metric 为必填语义 */
export function CreateEdgeDialog({
  open,
  cards,
  defaultFromKey,
  onClose,
  onCreated,
}: CreateEdgeDialogProps) {
  const [fromKey, setFromKey] = useState(defaultFromKey ?? '');
  const [toKey, setToKey] = useState('');
  const [metric, setMetric] = useState('');
  const [type, setType] = useState<'flow' | 'constrain'>('flow');
  const [weight, setWeight] = useState('0.7');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...cards].sort((a, b) => a.cardKey.localeCompare(b.cardKey)),
    [cards]
  );

  async function handleSubmit() {
    if (!fromKey || !toKey || !metric.trim()) {
      setError(
        '上游 / 下游 / 量化参数均为必填 — 不经参数中转的"领域到领域"边没有信息量'
      );
      return;
    }
    if (fromKey === toKey) {
      setError('上下游不能是同一张卡');
      return;
    }
    const w = parseFloat(weight);
    if (Number.isNaN(w) || w < 0.05 || w > 1) {
      setError('传导强度必须在 0.05–1 之间');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createEdge({
        fromKey,
        toKey,
        metric: metric.trim(),
        type,
        weight: w,
      });
      onCreated();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="新建影响边"
      subtitle="影响经由量化参数传导 — 传导强度决定冲击衰减速度"
      footer={
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {submitting ? '保存中…' : '连接'}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {error && (
          <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>上游假设（变动方）</label>
            <select
              value={fromKey}
              onChange={(e) => setFromKey(e.target.value)}
              className={fieldCls}
            >
              <option value="">选择…</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.cardKey}>
                  {c.cardKey} · {c.title}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>下游假设（被影响方）</label>
            <select
              value={toKey}
              onChange={(e) => setToKey(e.target.value)}
              className={fieldCls}
            >
              <option value="">选择…</option>
              {sorted.map((c) => (
                <option key={c.id} value={c.cardKey}>
                  {c.cardKey} · {c.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className={labelCls}>
            量化传导参数 *（影响通过什么量传导，如"专家并行 EP 通信量"）
          </label>
          <input
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className={fieldCls}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>边类型</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'flow' | 'constrain')}
              className={fieldCls}
            >
              <option value="flow">影响传导（需求自上而下）</option>
              <option value="constrain">约束反压（物理极限向上）</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>传导强度（0.05–1）</label>
            <input
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              type="number"
              step="0.1"
              min="0.05"
              max="1"
              className={fieldCls}
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}
