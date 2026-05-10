'use client';

import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Clock3, Search, Users } from 'lucide-react';
import { DemoLauncher } from '@/components/agent-playground';

export default function ResearchTeamLauncherPage() {
  return (
    <div className="h-full overflow-auto bg-[radial-gradient(circle_at_top,_rgba(219,234,254,0.55),_transparent_36%),linear-gradient(180deg,#f8fafc_0%,#f8fafc_100%)]">
      <div className="sticky top-0 z-10 border-b border-white/60 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-8 py-6">
          <Link
            href="/agent-playground"
            className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-blue-700"
          >
            <ArrowLeft className="h-4 w-4" />
            返回 Playground
          </Link>
          <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#2563eb,#38bdf8)] shadow-[0_18px_40px_-22px_rgba(37,99,235,0.7)]">
                <Users className="h-7 w-7 text-white" />
              </div>
              <div>
                <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-700">
                  Research Team
                </div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-950">
                  研究团队配置台
                </h1>
                <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                  用一套清晰的配置启动多 Agent
                  研究任务。搜索时效、知识源、审核深度和输出风格会被完整写入
                  mission，并沿研究链路持续生效。
                </p>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <HeaderStat
                Icon={Search}
                title="真实搜索"
                text="web / arXiv / GitHub / 学术源"
              />
              <HeaderStat
                Icon={CheckCircle2}
                title="结构化约束"
                text="时效、知识库、审计参数全透传"
              />
              <HeaderStat
                Icon={Clock3}
                title="实时进度"
                text="WebSocket 持续推送 mission 状态"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl px-8 py-8">
        <DemoLauncher />
      </div>
    </div>
  );
}

function HeaderStat({
  Icon,
  title,
  text,
}: {
  Icon: typeof Search;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/85 px-4 py-3 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.5)]">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-500">{text}</p>
        </div>
      </div>
    </div>
  );
}
