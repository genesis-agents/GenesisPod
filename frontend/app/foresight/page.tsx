'use client';

import { Compass } from 'lucide-react';
import AppShell from '@/components/layout/AppShell';
import { EmptyState } from '@/components/ui/states/EmptyState';

/**
 * AI 前瞻（Foresight）—— 判断资产 / 假设图谱。
 *
 * 占位页：P0（假设卡片库 + 影响图谱 + 传播复核）开发中。
 * 交互原型见 docs/demos/insight-graph-demo.html。
 */
export default function ForesightPage() {
  return (
    <AppShell>
      <main className="flex flex-1 items-center justify-center overflow-hidden p-8">
        <EmptyState
          icon={<Compass className="h-12 w-12" />}
          title="AI 前瞻 · 判断资产"
          description="把洞察沉淀为可持续检验的假设图谱：信号驱动复核，跨层影响实时传播。正在建设中。"
        />
      </main>
    </AppShell>
  );
}
