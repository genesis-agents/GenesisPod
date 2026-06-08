'use client';

import { useState, type ReactNode } from 'react';
import { Sparkles, Wrench, Cpu, X } from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { cn } from '@/lib/utils/common';
import { useCompanyStore } from '@/stores/company/companyStore';
import { useAIModels } from '@/hooks/features/useAIModels';
import { findListing } from '@/components/marketplace/marketplace.mock';

const CONTROL_CLS =
  'w-full max-w-sm rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-primary';

interface Option {
  id: string;
  name: string;
}

/**
 * AgentConfigModal —— 在 Agent（人才）上配置：模型 fallback 链 + 技能 + 工具。
 * 模型：有序 fallback 链（主→备）+ 自动 fallback 开关。
 * 技能/工具：可搜索添加 + 已选标签（可删），避免平铺全部选项。
 * 人才库（TalentPoolView）唯一配置入口。
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
    setAgentModels,
    setAgentAutoFallback,
  } = useCompanyStore();
  // 模型来自用户「我的模型」（BYOK 真实模型），不再硬编码 Opus/Sonnet/Haiku 档位
  const { models: aiModels } = useAIModels();
  const agent = hired.find((h) => h.instanceId === instanceId);
  if (!agent) return null;

  const modelOptions: Option[] = aiModels
    .filter(
      (m) =>
        m.modelType !== 'IMAGE_GENERATION' && m.modelType !== 'IMAGE_EDITING'
    )
    .map((m) => ({ id: m.modelId, name: m.name }));
  const skillOptions: Option[] = acquiredSkillIds.map((id) => ({
    id,
    name: findListing(id)?.name ?? id,
  }));
  const toolOptions: Option[] = acquiredToolIds.map((id) => ({
    id,
    name: findListing(id)?.name ?? id,
  }));

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={`配置 · ${agent.name}`}
      subtitle={`${agent.role} —— 配置模型 fallback 链、技能与工具`}
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div className="space-y-5">
        <CapabilityPicker
          icon={<Cpu className="h-4 w-4 text-slate-500" />}
          title="模型"
          options={modelOptions}
          selected={agent.models}
          ordered
          onAdd={(id) => void setAgentModels(instanceId, [...agent.models, id])}
          onRemove={(id) =>
            void setAgentModels(
              instanceId,
              agent.models.filter((m) => m !== id)
            )
          }
          footer={
            <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
              <input
                type="checkbox"
                checked={agent.autoFallback}
                onChange={(e) =>
                  void setAgentAutoFallback(instanceId, e.target.checked)
                }
                className="h-3.5 w-3.5 rounded border-gray-300 text-primary focus:ring-primary"
              />
              主模型不可用时，自动按链顺序 fallback 到备用模型
            </label>
          }
        />

        <CapabilityPicker
          icon={<Sparkles className="h-4 w-4 text-amber-500" />}
          title="技能"
          options={skillOptions}
          selected={agent.skillIds}
          searchable
          onAdd={(id) => void toggleAgentSkill(instanceId, id)}
          onRemove={(id) => void toggleAgentSkill(instanceId, id)}
        />
        <CapabilityPicker
          icon={<Wrench className="h-4 w-4 text-blue-500" />}
          title="工具"
          options={toolOptions}
          selected={agent.toolIds}
          searchable
          onAdd={(id) => void toggleAgentTool(instanceId, id)}
          onRemove={(id) => void toggleAgentTool(instanceId, id)}
        />
      </div>
    </Modal>
  );
}

function CapabilityPicker({
  icon,
  title,
  options,
  selected,
  onAdd,
  onRemove,
  ordered = false,
  searchable = false,
  footer,
}: {
  icon: ReactNode;
  title: string;
  options: Option[];
  selected: string[];
  onAdd: (id: string) => void;
  onRemove: (id: string) => void;
  ordered?: boolean;
  searchable?: boolean;
  footer?: ReactNode;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const nameOf = (id: string) => options.find((o) => o.id === id)?.name ?? id;
  const available = options.filter((o) => !selected.includes(o.id));
  const q = query.trim().toLowerCase();
  const filtered = q
    ? available.filter((o) => o.name.toLowerCase().includes(q))
    : available;
  const hasSelected = selected.length > 0;
  const hasAvailable = available.length > 0;

  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        {icon} {title}
        <span className="text-xs font-normal text-gray-400">
          已选 {selected.length}
        </span>
      </div>

      {/* 已选标签（模型有序，显示 主/备） */}
      {hasSelected ? (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.map((id, idx) => (
            <span
              key={id}
              className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
            >
              {ordered && (
                <span className="rounded bg-white/25 px-1 text-[10px]">
                  {idx === 0 ? '主' : `备${idx}`}
                </span>
              )}
              {nameOf(id)}
              <button
                type="button"
                onClick={() => onRemove(id)}
                className="rounded-full p-0.5 hover:bg-white/20"
                aria-label="移除"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="mb-2 text-xs text-gray-400">未选择{title}</p>
      )}

      {/* 添加：可搜索输入 / 下拉 */}
      {hasAvailable ? (
        searchable ? (
          <div className="relative max-w-sm">
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              onBlur={() => setTimeout(() => setOpen(false), 150)}
              placeholder={`搜索并添加${title}…`}
              className={CONTROL_CLS}
            />
            {open && (
              <div className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                {filtered.length > 0 ? (
                  filtered.map((o) => (
                    <button
                      key={o.id}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        onAdd(o.id);
                        setQuery('');
                      }}
                      className="block w-full px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50"
                    >
                      {o.name}
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-2 text-xs text-gray-400">无匹配项</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <select
            className={CONTROL_CLS}
            value=""
            onChange={(e) => {
              if (e.target.value) onAdd(e.target.value);
            }}
          >
            <option value="">+ 添加{title}…</option>
            {available.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        )
      ) : (
        <p className="text-xs text-gray-300">已全部添加</p>
      )}

      {footer}
    </div>
  );
}

export default AgentConfigModal;
