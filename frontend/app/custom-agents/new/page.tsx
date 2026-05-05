'use client';

/**
 * E R4 Phase 2 (PR-E1, 2026-05-05): 创建 Custom Agent 入口页
 *
 * 当前骨架：仅 Step 1 (basic info)。后续 PR-E2 加 Step 2-5。
 * 路由：/custom-agents/new
 */
import { useRouter } from 'next/navigation';
import { BasicInfoStep } from '@/components/custom-agents/BasicInfoStep';

export default function NewCustomAgentPage() {
  const router = useRouter();
  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <h1 className="mb-2 text-2xl font-semibold">创建自定义 Agent</h1>
      <p className="mb-6 text-sm text-gray-500">
        创建一个属于你的 agent。完整流程 5 步（当前骨架阶段先开放第 1 步）。
      </p>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <BasicInfoStep
          onSaved={(id) => {
            router.push(`/custom-agents/${id}`);
          }}
        />
      </div>
    </div>
  );
}
