/**
 * SelfDrivenPlanCard
 *
 * Renders the MissionExecutionPlan emitted by the `plan` event:
 *   - Steps list with loopKind badge
 *   - Role assignments table
 *   - Rubric dimensions table (dimension / weight / passLine)
 *   - Deliverable type chip
 *
 * Stateless presentational component; all data comes from the plan event payload.
 * Uses canonical SectionPanelCard (R2) + Table primitives (R8) per standard 22.
 */
'use client';

import { ClipboardList, Users, Star, Package } from 'lucide-react';
import type { PlanEvent } from '@/lib/api/self-driven-stream';
import { SectionPanelCard } from '@/components/ui/cards/SectionPanelCard';
import { Table, THead, TBody, Tr, Th, Td } from '@/components/ui/table/Table';

const LOOP_KIND_LABEL: Record<string, string> = {
  react: 'ReAct',
  'plan-act': 'Plan-Act',
  'leader-worker': 'Leader-Worker',
};

const LOOP_KIND_CLS: Record<string, string> = {
  react: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200',
  'plan-act': 'bg-blue-50 text-blue-700 ring-1 ring-blue-200',
  'leader-worker': 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
};

function SectionHeader({
  icon,
  label,
}: {
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {icon}
      {label}
    </div>
  );
}

export function SelfDrivenPlanCard({ ev }: { ev: PlanEvent }) {
  const { plan } = ev;
  const hasRoleAssignments =
    plan.roleAssignments && plan.roleAssignments.length > 0;
  const hasRubric = plan.rubric && plan.rubric.length > 0;

  return (
    <SectionPanelCard
      title="Execution Plan"
      icon={<ClipboardList className="h-4 w-4" aria-hidden />}
      accent="blue"
      actions={
        plan.deliverableType ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
            <Package className="h-3 w-3" aria-hidden />
            {plan.deliverableType}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4 px-4 py-3">
        {/* Steps */}
        {plan.steps.length > 0 && (
          <div className="space-y-1.5">
            <SectionHeader
              icon={<ClipboardList size={12} aria-hidden />}
              label="Steps"
            />
            <ol className="space-y-1">
              {plan.steps.map((step, idx) => (
                <li
                  key={step.id}
                  className="flex items-start gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm"
                >
                  <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600">
                    {idx + 1}
                  </span>
                  <span className="flex-1 text-gray-800">{step.name}</span>
                  {step.loopKind && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium ${LOOP_KIND_CLS[step.loopKind] ?? 'bg-gray-100 text-gray-600 ring-1 ring-gray-200'}`}
                    >
                      {LOOP_KIND_LABEL[step.loopKind] ?? step.loopKind}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Role Assignments */}
        {hasRoleAssignments && (
          <div className="space-y-1.5">
            <SectionHeader
              icon={<Users size={12} aria-hidden />}
              label="Role Assignments"
            />
            <Table
              bordered
              className="text-xs"
              containerClassName="border-gray-100"
            >
              <THead className="bg-gray-50">
                <Tr>
                  <Th className="px-3 py-1.5 font-semibold text-gray-500">
                    Role
                  </Th>
                  <Th className="px-3 py-1.5 font-semibold text-gray-500">
                    Model
                  </Th>
                </Tr>
              </THead>
              <TBody className="divide-y divide-gray-100">
                {plan.roleAssignments?.map((r) => (
                  <Tr key={r.roleId}>
                    <Td className="px-3 py-1.5 font-medium text-gray-700">
                      {r.roleId}
                    </Td>
                    <Td className="font-mono px-3 py-1.5 text-gray-500">
                      {r.modelId || '—'}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}

        {/* Rubric */}
        {hasRubric && (
          <div className="space-y-1.5">
            <SectionHeader
              icon={<Star size={12} aria-hidden />}
              label="Acceptance Rubric"
            />
            <Table
              bordered
              className="text-xs"
              containerClassName="border-gray-100"
            >
              <THead className="bg-gray-50">
                <Tr>
                  <Th className="px-3 py-1.5 font-semibold text-gray-500">
                    Dimension
                  </Th>
                  <Th className="px-3 py-1.5 text-right font-semibold text-gray-500">
                    Weight
                  </Th>
                  <Th className="px-3 py-1.5 text-right font-semibold text-gray-500">
                    Pass Line
                  </Th>
                </Tr>
              </THead>
              <TBody className="divide-y divide-gray-100">
                {plan.rubric?.map((r) => (
                  <Tr key={r.dimension}>
                    <Td className="px-3 py-1.5 text-gray-700">{r.dimension}</Td>
                    <Td className="px-3 py-1.5 text-right text-gray-500">
                      {r.weight}
                    </Td>
                    <Td className="px-3 py-1.5 text-right">
                      <span className="inline-block rounded-full bg-emerald-50 px-1.5 py-0.5 font-medium text-emerald-700 ring-1 ring-emerald-200">
                        {r.passLine}
                      </span>
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </div>
    </SectionPanelCard>
  );
}
