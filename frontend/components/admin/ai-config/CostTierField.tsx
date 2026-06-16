'use client';

import React from 'react';

/**
 * CostTierField — admin 模型表单的「成本档位」字段。
 *
 * 从 AIModelSettings 抽出（god-class size guard：该文件 >2500 行，新增逻辑须拆分）。
 * 选 costTier 时回填该档位默认单价，admin 可在价格输入框手动覆盖。
 *
 * TIER_DEFAULT_PRICING_UI 镜像后端 pricing-defaults.const.ts（仅表单预填提示；
 * 权威默认在后端 ModelPricingRegistry）。
 */
export const TIER_DEFAULT_PRICING_UI: Record<
  string,
  { inputPerM: number; outputPerM: number }
> = {
  basic: { inputPerM: 0.5, outputPerM: 1.5 },
  standard: { inputPerM: 3, outputPerM: 12 },
  strong: { inputPerM: 15, outputPerM: 60 },
};

interface CostTierFieldProps {
  costTier?: string;
  /** 选档位时回填 costTier + 该档默认单价（调用方 merge 进 formData） */
  onChange: (patch: {
    costTier: string;
    priceInputPerMillion: number;
    priceOutputPerMillion: number;
  }) => void;
}

export function CostTierField({ costTier, onChange }: CostTierFieldProps) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-medium text-gray-700">
        成本档位 (costTier)
      </label>
      <select
        value={costTier || 'standard'}
        onChange={(e) => {
          const tier = e.target.value;
          const def =
            TIER_DEFAULT_PRICING_UI[tier] ?? TIER_DEFAULT_PRICING_UI.standard;
          onChange({
            costTier: tier,
            priceInputPerMillion: def.inputPerM,
            priceOutputPerMillion: def.outputPerM,
          });
        }}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <option value="basic">basic（便宜小模型）</option>
        <option value="standard">standard（主力模型）</option>
        <option value="strong">strong（旗舰/推理）</option>
      </select>
      <p className="mt-1 text-xs text-gray-500">
        选档位会预填默认单价；未填精确价时，预算护栏按档位默认价估算（避免按 $0
        计、护栏失效）。
      </p>
    </div>
  );
}
