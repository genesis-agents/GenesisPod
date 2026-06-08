'use client';

/**
 * ComputeUsagePanel — 算力消耗（下沉自公司 MissionReportView 内联 CostPanel）。
 *
 * 简版：吃归一契约 steps: MissionStep[] + usage?: ComputeUsage。总量优先取 usage，
 * 缺则从 steps 的逐步 tokens/costCents 求和。playground 的富版（CapabilityMeters /
 * ComputeUsagePanel）属运行态，留 page.tsx 原地，不归一到此。
 */

import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import type { MissionStep, ComputeUsage } from '../contract';

export interface ComputeUsagePanelProps {
  steps: MissionStep[];
  usage?: ComputeUsage;
}

export function ComputeUsagePanel({ steps, usage }: ComputeUsagePanelProps) {
  const totalTokens =
    usage?.totalTokens ?? steps.reduce((s, st) => s + (st.tokens ?? 0), 0);
  const totalCostCents =
    usage?.totalCostCents ??
    steps.reduce((s, st) => s + (st.costCents ?? 0), 0);

  if (totalTokens === 0) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="暂无算力数据"
        description="该任务未记录 token 用量（旧任务或执行未产生计量）"
      />
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-400">总 Token</div>
          <div className="mt-0.5 text-xl font-bold text-gray-900">
            {totalTokens.toLocaleString()}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-3">
          <div className="text-xs text-gray-400">估算成本</div>
          <div className="mt-0.5 text-xl font-bold text-gray-900">
            ¥{(totalCostCents / 100).toFixed(2)}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <Table className="text-left text-xs">
          <THead className="bg-gray-50 text-gray-500">
            <Tr>
              <Th className="px-3 py-2 font-medium">步骤</Th>
              <Th className="px-3 py-2 font-medium">负责人</Th>
              <Th className="px-3 py-2 text-right font-medium">Token</Th>
              <Th className="px-3 py-2 text-right font-medium">占比</Th>
            </Tr>
          </THead>
          <TBody>
            {steps.map((s, i) => {
              const t = s.tokens ?? 0;
              const pct =
                totalTokens > 0 ? Math.round((t / totalTokens) * 100) : 0;
              return (
                <Tr key={i} className="border-t border-gray-100">
                  <Td className="px-3 py-2 font-medium text-gray-800">
                    {s.label}
                  </Td>
                  <Td className="px-3 py-2 text-gray-600">{s.role}</Td>
                  <Td className="px-3 py-2 text-right text-gray-700">
                    {t.toLocaleString()}
                  </Td>
                  <Td className="px-3 py-2 text-right text-gray-400">{pct}%</Td>
                </Tr>
              );
            })}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

export default ComputeUsagePanel;
