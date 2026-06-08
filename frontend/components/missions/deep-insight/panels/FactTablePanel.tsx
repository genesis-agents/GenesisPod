'use client';

/**
 * FactTablePanel — 事实表（下沉自公司 MissionReportView 内联 FactTablePanel）。
 *
 * 吃归一契约 facts: Fact[] + reconciliationReport?。playground 侧 reportArtifact.factTable
 * 经 adapter 归一为 Fact[] 后同样喂入。
 */

import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import type { Fact } from '../contract';

export interface FactTablePanelProps {
  facts: Fact[];
  reconciliationReport?: string;
}

export function FactTablePanel({
  facts,
  reconciliationReport,
}: FactTablePanelProps) {
  if (facts.length === 0) {
    return (
      <EmptyState
        type="default"
        size="sm"
        title="暂无事实表"
        description="对账阶段未产出结构化事实，或该任务跳过了对账"
      />
    );
  }
  return (
    <div className="space-y-3">
      {reconciliationReport && (
        <p className="rounded-xl border border-gray-200 bg-gray-50/60 p-3 text-xs leading-relaxed text-gray-600">
          {reconciliationReport}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-gray-200">
        <Table className="border-collapse text-left text-xs">
          <THead className="bg-gray-50 text-gray-500">
            <Tr>
              <Th className="px-3 py-2 font-medium">实体</Th>
              <Th className="px-3 py-2 font-medium">属性</Th>
              <Th className="px-3 py-2 font-medium">取值</Th>
              <Th className="px-3 py-2 font-medium">来源</Th>
            </Tr>
          </THead>
          <TBody>
            {facts.map((f, i) => (
              <Tr key={f.id ?? i} className="border-t border-gray-100">
                <Td className="px-3 py-2 font-medium text-gray-800">
                  {f.entity ?? '—'}
                </Td>
                <Td className="px-3 py-2 text-gray-600">
                  {f.attribute ?? '—'}
                </Td>
                <Td className="px-3 py-2 text-gray-800">{f.value ?? '—'}</Td>
                <Td className="px-3 py-2 text-gray-400">
                  {(f.sources ?? []).length} 条
                </Td>
              </Tr>
            ))}
          </TBody>
        </Table>
      </div>
    </div>
  );
}

export default FactTablePanel;
