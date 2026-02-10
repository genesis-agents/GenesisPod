'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { useAiPlanningStore } from '@/stores/aiPlanningStore';
import AppShell from '@/components/layout/AppShell';
import PlanPhaseBar from '@/components/ai-planning/PlanPhaseBar';
import PlanningPanel from '@/components/ai-planning/PlanningPanel';
import PlanExportDialog from '@/components/ai-planning/PlanExportDialog';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/stores';
import * as api from '@/lib/api/ai-planning';
import { PHASE_KEYS } from '@/lib/constants/ai-planning';

export default function PlanDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const planId = params?.planId as string;

  const { user, accessToken, isLoading: authLoading } = useAuth();
  const {
    currentPlan,
    isLoadingDetail,
    fetchPlanDetail,
    advancePhase,
    retryPhase,
    deletePlan,
  } = useAiPlanningStore();

  const [isAdvancing, setIsAdvancing] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exportMarkdown, setExportMarkdown] = useState('');
  const [selectedPhase, setSelectedPhase] = useState<number | null>(null);

  const isAuthenticated = !!accessToken;

  useEffect(() => {
    if (!authLoading && isAuthenticated && planId) {
      fetchPlanDetail(planId);
    }
  }, [authLoading, isAuthenticated, planId, fetchPlanDetail]);

  const handleAdvance = async () => {
    if (!planId) return;
    setIsAdvancing(true);
    try {
      await advancePhase(planId);
      toast.success(t('aiPlanning.actions.advanceSuccess'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('aiPlanning.error.advanceFailed')
      );
    } finally {
      setIsAdvancing(false);
    }
  };

  const handleRetry = async (phase: number) => {
    if (!planId) return;
    try {
      await retryPhase(planId, phase);
      toast.success(t('aiPlanning.actions.retrySuccess'));
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('aiPlanning.error.retryFailed')
      );
    }
  };

  const handleExport = async () => {
    if (!planId) return;
    try {
      const markdown = await api.exportPlan(planId);
      setExportMarkdown(markdown);
      setShowExport(true);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('aiPlanning.error.exportFailed')
      );
    }
  };

  const handleDelete = async () => {
    if (!planId) return;
    if (!confirm(t('aiPlanning.confirmDelete'))) return;
    try {
      await deletePlan(planId);
      router.push('/ai-planning');
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('aiPlanning.error.deleteFailed')
      );
    }
  };

  const handlePhaseClick = (phase: number) => {
    setSelectedPhase(phase === selectedPhase ? null : phase);
  };

  if (authLoading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 p-8">
          <h2 className="text-xl font-semibold text-gray-700">
            {t('aiPlanning.signIn')}
          </h2>
        </div>
      </AppShell>
    );
  }

  if (isLoadingDetail || !currentPlan) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex h-full flex-col">
        {/* Top bar: Back + title + actions */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/ai-planning')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">
                {currentPlan.name}
              </h1>
              <p className="max-w-md truncate text-xs text-gray-500">
                {currentPlan.goal}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              {t('aiPlanning.actions.export')}
            </button>
            <button
              onClick={handleDelete}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </button>
          </div>
        </div>

        {/* Phase Bar */}
        <div className="border-b border-gray-100 bg-gray-50">
          <PlanPhaseBar
            currentPhase={currentPlan.currentPhase}
            phaseStatus={currentPlan.phaseStatus}
            onPhaseClick={handlePhaseClick}
          />
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Center: Phase detail / overview */}
          <div className="flex-1 overflow-y-auto p-6">
            {selectedPhase ? (
              <PhaseDetail
                plan={currentPlan}
                phase={selectedPhase}
                phaseKey={PHASE_KEYS[selectedPhase]}
              />
            ) : (
              <PlanOverview plan={currentPlan} />
            )}
          </div>

          {/* Right panel */}
          <div className="hidden w-72 lg:block">
            <PlanningPanel
              plan={currentPlan}
              onAdvance={handleAdvance}
              onRetry={handleRetry}
              onExport={handleExport}
              isAdvancing={isAdvancing}
            />
          </div>
        </div>
      </div>

      {/* Export dialog */}
      {showExport && (
        <PlanExportDialog
          markdown={exportMarkdown}
          planName={currentPlan.name}
          onClose={() => setShowExport(false)}
        />
      )}
    </AppShell>
  );
}

// Plan Overview
function PlanOverview({
  plan,
}: {
  plan: import('@/lib/api/ai-planning').PlanDetail;
}) {
  const { t } = useTranslation();

  const completedPhases = Object.values(plan.phaseStatus).filter(
    (s) => s.status === 'completed'
  ).length;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Goal */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('aiPlanning.create.goal')}
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {plan.goal}
        </p>
      </div>

      {/* Progress */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('aiPlanning.panel.progress')}
        </h3>
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>
              {completedPhases}/{plan.totalPhases}{' '}
              {t('aiPlanning.panel.phasesCompleted')}
            </span>
            <span>
              {Math.round((completedPhases / plan.totalPhases) * 100)}%
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-gray-100">
            <div
              className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all"
              style={{
                width: `${(completedPhases / plan.totalPhases) * 100}%`,
              }}
            />
          </div>
        </div>
      </div>

      {/* Info */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <h3 className="text-sm font-semibold text-gray-900">
          {t('aiPlanning.panel.info')}
        </h3>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500">{t('aiPlanning.create.depth')}</dt>
            <dd className="font-medium text-gray-700">{plan.depth}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500">{t('aiPlanning.members.title')}</dt>
            <dd className="font-medium text-gray-700">
              {plan.members?.length || 0} AI
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

// Phase Detail View
function PhaseDetail({
  plan,
  phase,
  phaseKey,
}: {
  plan: import('@/lib/api/ai-planning').PlanDetail;
  phase: number;
  phaseKey: string;
}) {
  const { t } = useTranslation();
  const status = plan.phaseStatus[phase];

  if (!status) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400">
        {t('aiPlanning.phaseStatus.pending')}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <span
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium ${
              status.status === 'completed'
                ? 'bg-green-500 text-white'
                : status.status === 'active'
                  ? 'bg-amber-400 text-white'
                  : 'bg-gray-200 text-gray-400'
            }`}
          >
            {status.status === 'completed' ? (
              <svg
                className="h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            ) : (
              phase
            )}
          </span>
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t(`aiPlanning.phases.${phaseKey}`)}
            </h2>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                status.status === 'completed'
                  ? 'bg-green-100 text-green-700'
                  : status.status === 'active'
                    ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-500'
              }`}
            >
              {t(`aiPlanning.phaseStatus.${status.status}`)}
            </span>
          </div>
        </div>

        {status.summary ? (
          <div className="mt-4 whitespace-pre-wrap rounded-lg border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed text-gray-700">
            {status.summary}
          </div>
        ) : status.status === 'active' ? (
          <div className="mt-4 flex items-center gap-2 text-sm text-amber-600">
            <div className="h-2 w-2 animate-pulse rounded-full bg-amber-400" />
            {t('aiPlanning.phaseStatus.active')}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-400">
            {t('aiPlanning.phaseStatus.pending')}
          </p>
        )}
      </div>
    </div>
  );
}
