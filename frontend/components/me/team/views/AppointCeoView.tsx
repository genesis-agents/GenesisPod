'use client';

import { Crown, Check } from 'lucide-react';
import { toast } from '@/stores';
import { useCompanyStore } from '@/stores/company/companyStore';
import { AgentAvatar, seniorityLabel } from '../team-shared';

export function AppointCeoView() {
  const { hired, ceoId, appointCeo } = useCompanyStore();

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
        <p className="text-sm text-slate-700">
          CEO 是你任命的「职业经理人」——替你统管多个
          Team、做跨部门协调。可选，也可随时更换。
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {hired.map((a) => {
          const isCeo = a.instanceId === ceoId;
          return (
            <div
              key={a.instanceId}
              className={`flex flex-col rounded-xl border bg-white p-4 transition-colors ${
                isCeo
                  ? 'border-slate-700 ring-1 ring-slate-700'
                  : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-3">
                <AgentAvatar agent={a} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="truncate font-semibold text-gray-900">
                      {a.name}
                    </h3>
                    {isCeo && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-white">
                        <Crown className="h-3 w-3" /> 现任 CEO
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    {a.role} · {seniorityLabel(a)}
                  </p>
                </div>
              </div>

              <div className="mt-4">
                {isCeo ? (
                  <button
                    onClick={() => {
                      void appointCeo(null);
                      toast.info(`已卸任 ${a.name} 的 CEO 职务`);
                    }}
                    className="w-full rounded-lg border border-gray-200 bg-white py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                  >
                    卸任
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      void appointCeo(a.instanceId);
                      toast.success(`已任命 ${a.name} 为 CEO`);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-700 py-2 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <Check className="h-4 w-4" /> 任命为 CEO
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
