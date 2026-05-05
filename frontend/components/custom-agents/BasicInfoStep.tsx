'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): Step 1 — 基础信息
 *
 * PR-E1 时是独立 step（含 slug 创建逻辑）；PR-E2 重构为受控组件，
 * slug 仅在 create 模式可编辑（由 wizard 外壳处理）。
 */
import type { CustomAgentBasicInfo } from './types';

export interface BasicInfoStepProps {
  value: CustomAgentBasicInfo;
  onChange: (next: CustomAgentBasicInfo) => void;
  /** create 模式才显示 slug 输入；edit 模式不显示（slug 不可改） */
  slug?: string;
  onSlugChange?: (slug: string) => void;
  /** create 模式必填 displayName，作为列表显示用 */
  displayName?: string;
  onDisplayNameChange?: (name: string) => void;
  isCreate?: boolean;
}

export function BasicInfoStep({
  value,
  onChange,
  slug,
  onSlugChange,
  displayName,
  onDisplayNameChange,
  isCreate,
}: BasicInfoStepProps) {
  return (
    <div className="space-y-4">
      {isCreate && (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium">Slug *</label>
            <input
              value={slug ?? ''}
              onChange={(e) => onSlugChange?.(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              placeholder="e.g. my-research-agent"
            />
            <p className="mt-1 text-xs text-gray-500">
              kebab-case，作为 agent 唯一标识，创建后不可修改
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">显示名 *</label>
            <input
              value={displayName ?? ''}
              onChange={(e) => onDisplayNameChange?.(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium">Agent 名称 *</label>
        <input
          value={value.name ?? ''}
          onChange={(e) => onChange({ ...value, name: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="给你的 agent 起个名"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">用途 *</label>
        <input
          value={value.purpose ?? ''}
          onChange={(e) => onChange({ ...value, purpose: e.target.value })}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          placeholder="e.g. 分析竞品定价策略"
        />
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium">描述</label>
        <textarea
          value={value.description ?? ''}
          onChange={(e) => onChange({ ...value, description: e.target.value })}
          rows={3}
          className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">语言</label>
          <select
            value={value.language ?? 'zh'}
            onChange={(e) =>
              onChange({
                ...value,
                language: e.target.value as CustomAgentBasicInfo['language'],
              })
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="zh">中文</option>
            <option value="en">English</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">受众</label>
          <select
            value={value.audience ?? 'general'}
            onChange={(e) =>
              onChange({
                ...value,
                audience: e.target.value as CustomAgentBasicInfo['audience'],
              })
            }
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="general">一般</option>
            <option value="executive">高管</option>
            <option value="technical">技术</option>
            <option value="academic">学术</option>
          </select>
        </div>
      </div>
    </div>
  );
}
