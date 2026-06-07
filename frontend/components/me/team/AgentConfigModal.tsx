'use client';

import { Sparkles, Wrench, Cpu } from 'lucide-react';
import { Modal } from '@/components/ui/dialogs/Modal';
import { Button } from '@/components/ui/primitives/button';
import { EmptyState } from '@/components/ui/states/EmptyState';
import { cn } from '@/lib/utils/common';
import { useCompanyStore, MODEL_OPTIONS } from '@/stores/company/companyStore';
import { findListing } from '@/components/marketplace/marketplace.mock';

/**
 * AgentConfigModal —— 在 Agent（人才）上配置：模型 + 技能 + 工具。
 * 人才库（TalentPoolView）与组队工作台（ComposerView）共用，保证配置入口一致。
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
      subtitle={`${agent.role} —— 选择模型，勾选要装配的技能与工具`}
      footer={<Button onClick={onClose}>完成</Button>}
    >
      <div className="space-y-5">
        {/* 模型 */}
        <div>
          <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
            <Cpu className="h-4 w-4 text-slate-500" /> 模型
          </div>
          <div className="flex flex-wrap gap-2">
            {MODEL_OPTIONS.map((m) => {
              const active = agent.model === m;
              return (
                <button
                  key={m}
                  onClick={() => setAgentModel(instanceId, m)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                  )}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        <ToggleSection
          icon={<Sparkles className="h-4 w-4 text-amber-500" />}
          title="技能"
          ids={acquiredSkillIds}
          activeIds={agent.skillIds}
          onToggle={(id) => toggleAgentSkill(instanceId, id)}
        />
        <ToggleSection
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

function ToggleSection({
  icon,
  title,
  ids,
  activeIds,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  ids: string[];
  activeIds: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-gray-900">
        {icon} {title}
        <span className="text-xs font-normal text-gray-400">
          已选 {activeIds.length}/{ids.length}
        </span>
      </div>
      {ids.length === 0 ? (
        <EmptyState
          size="sm"
          title={`还没有可用的${title}`}
          description="去市场获取"
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          {ids.map((id) => {
            const ref = findListing(id);
            const active = activeIds.includes(id);
            return (
              <button
                key={id}
                onClick={() => onToggle(id)}
                className={cn(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
                )}
              >
                {ref?.name ?? id}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AgentConfigModal;
