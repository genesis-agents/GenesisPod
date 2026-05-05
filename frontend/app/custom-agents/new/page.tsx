'use client';

/**
 * E R4 Phase 2 (PR-E2, 2026-05-05): 创建 Custom Agent 入口页
 *
 * PR-E1 仅 Step 1；PR-E2 切到完整 5 步向导（CustomAgentWizard）。
 */
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { CustomAgentWizard } from '@/components/custom-agents/CustomAgentWizard';

export default function NewCustomAgentPage() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <Link
        href="/custom-agents"
        className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
      >
        <ChevronLeft className="h-3 w-3" /> 返回列表
      </Link>
      <h1 className="mb-2 text-2xl font-semibold">创建自定义 Agent</h1>
      <p className="mb-6 text-sm text-gray-500">
        通过 5 步向导配置一个属于你的 agent：基础信息 → 话题维度 → 技能 → 流水线
        → 集成 → 复核发布。
      </p>
      <CustomAgentWizard />
    </div>
  );
}
