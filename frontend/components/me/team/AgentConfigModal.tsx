'use client';

import { Sparkles, Wrench, Cpu, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { cn } from '@/lib/utils/common';
import { useCompanyStore, MODEL_OPTIONS } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';

const SELECT_CLS =
  'w-full max-w-xs rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

/**
 * AgentConfigModal —— 在 Agent（人才）上配置：模型 + 技能 + 工具。
 * 模型用下拉单选；技能/工具用「已选标签（可删）+ 下拉添加」，避免平铺全部选项导致弹层过大。
 * 人才库（TalentPoolView）与组队工作台（ComposerView）共用。
 */
export function AgentConfigModal({
  instanceId,
  onClose,
}: {
  instanceId: string;
  onClose: () => void;
}) {
  const {
    hired,
    acquiredSkillIds,
    acquiredToolIds,
    toggleAgentSkill,
    toggleAgentTool,
    setAgentModel,
  } = useCompanyStore();
  const agent = hired.find((h) => h.instanceId === instanceId);
  if (!agent) return null;

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`配置 · ${agent.name}`}
      subtitle={`${agent.role} —— 选择模型与要装配的技能、工具`}
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div className="space-y-5">
        <Field icon={<Cpu className="h-4 w-4 text-slate-500" />} title="模型">
          <select
            className={SELECT_CLS}
            value={agent.model}
            onChange={(e) => setAgentModel(instanceId, e.target.value)}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Field>

        <MultiSelectField
          icon={<Sparkles className="h-4 w-4 text-amber-500" />}
          title="技能"
          ids={acquiredSkillIds}
          activeIds={agent.skillIds}
          onToggle={(id) => toggleAgentSkill(instanceId, id)}
        />
        <MultiSelectField
          icon={<Wrench className="h-4 w-4 text-blue-500" />}
          title="工具"
          ids={acquiredToolIds}
          activeIds={agent.toolIds}
          onToggle={(id) => toggleAgentTool(instanceId, id)}
        />
      </div>
    </Modal>
  );
}

function Field({
  icon,
  title,
  extra,
  children,
}: {
  icon: ReactNode;
  title: string;
  extra?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        {icon} {title}
        {extra}
      </div>
      {children}
    </div>
  );
}

function MultiSelectField({
  icon,
  title,
  ids,
  activeIds,
  onToggle,
}: {
  icon: ReactNode;
  title: string;
  ids: string[];
  activeIds: string[];
  onToggle: (id: string) => void;
}) {
  const available = ids.filter((id) => !activeIds.includes(id));
  const nameOf = (id: string) => findListing(id)?.name ?? id;
  const hasAny = ids.length > 0;
  const hasSelected = activeIds.length > 0;
  const hasAvailable = available.length > 0;

  return (
    <Field
      icon={icon}
      title={title}
      extra={
        <span className="text-xs font-normal text-gray-400">
          已选 {activeIds.length}
        </span>
      }
    >
      {/* 已选标签（可删） */}
      {hasSelected ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {activeIds.map((id) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
            >
              {nameOf(id)}
              <button
                type="button"
                onClick={() => onToggle(id)}
                className="rounded-full p-0.5 hover:bg-white/20"
                aria-label="移除"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-xs text-gray-400">未装配{title}</p>
      )}

      {/* 下拉添加（只列未选项） */}
      {hasAvailable ? (
        <select
          className={SELECT_CLS}
          value=""
          onChange={(e) => {
            if (e.target.value) onToggle(e.target.value);
          }}
        >
          <option value="">+ 添加{title}…</option>
          {available.map((id) => (
            <option key={id} value={id}>
              {nameOf(id)}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-gray-300">
          {hasAny ? '已全部装配' : `还没有可用的${title}，去市场获取`}
        </p>
      )}
    </Field>
  );
}

export default AgentConfigModal;
