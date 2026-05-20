'use client';

/**
 * StageStepper — mission 阶段进度条（纯展示组件）
 *
 * 从 MissionFlowView 提取的阶段格子 grid。各 domain（playground / social /
 * ai-radar）通过 stages prop 喂自己的阶段定义 + 状态，视觉完全统一。
 *
 * 不知道任何 domain 业务 —— 调用方负责把 events 派生成 StageStepperItem[]。
 * - playground: MissionFlowView 内部从 todo-ledger systemStageId 派生
 * - social:     deriveSocialStages(events)（扫 social stage:lifecycle）
 */

import { cn } from '@/lib/utils/common';
import { Sparkles, type LucideIcon } from 'lucide-react';

export type StageStepperStatus = 'pending' | 'in_progress' | 'done' | 'failed';

export interface StageStepperItem {
  id: string;
  short: string;
  Icon: LucideIcon;
  status: StageStepperStatus;
  /** hover tooltip，默认用 short */
  title?: string;
}

interface StageStepperProps {
  stages: StageStepperItem[];
  /** 标题，默认 "Mission 阶段" */
  heading?: string;
}

const TONE: Record<StageStepperStatus, string> = {
  done: 'bg-emerald-100 text-emerald-700 ring-emerald-300',
  in_progress: 'animate-pulse bg-blue-100 text-blue-700 ring-blue-300',
  failed: 'bg-red-100 text-red-700 ring-red-300',
  pending: 'bg-gray-50 text-gray-400 ring-gray-200',
};

const MARK: Record<StageStepperStatus, string> = {
  done: '✓',
  in_progress: '⟳',
  failed: '✗',
  pending: '○',
};

export function StageStepper({
  stages,
  heading = 'Mission 阶段',
}: StageStepperProps) {
  if (stages.length === 0) return null;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-900">{heading}</h3>
        <span className="text-xs text-gray-500">· {stages.length} 阶段</span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-6 lg:grid-cols-12">
        {stages.map((s) => {
          const Icon = s.Icon;
          return (
            <div
              key={s.id}
              className={cn(
                'flex flex-col items-center justify-center gap-0.5 rounded-lg px-1.5 py-1.5 ring-1',
                TONE[s.status]
              )}
              title={s.title ?? s.short}
            >
              <Icon className="h-3.5 w-3.5" />
              <span className="text-center text-[10px] font-medium leading-tight">
                {s.short}
              </span>
              <span className="text-[9px]">{MARK[s.status]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
