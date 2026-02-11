'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Settings, Download, Trash2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useAiPlanningStore } from '@/stores/aiPlanningStore';
import AppShell from '@/components/layout/AppShell';
import PlanPhaseBar from '@/components/ai-planning/PlanPhaseBar';
import { PlanTeamPanel } from '@/components/ai-planning/PlanTeamPanel';
import {
  PlanContentPanel,
  type PlanContentTabType,
} from '@/components/ai-planning/PlanContentPanel';
import PlanExportDialog from '@/components/ai-planning/PlanExportDialog';
import PlanSettingsModal from '@/components/ai-planning/PlanSettingsModal';
import { useTranslation } from '@/lib/i18n';
import { toast } from '@/stores';
import * as api from '@/lib/api/ai-planning';

export default function PlanDetailPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useParams();
  const planId = params?.planId as string;

  const { accessToken, isLoading: authLoading } = useAuth();
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
  const [showSettings, setShowSettings] = useState(false);
  const [contentTab, setContentTab] = useState<PlanContentTabType>('phases');
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

  const handleSettingsSave = async (data: {
    name: string;
    goal: string;
    depth: string;
  }) => {
    // Optimistic: update local store, backend PATCH not yet available
    if (currentPlan) {
      useAiPlanningStore.setState({
        currentPlan: { ...currentPlan, ...data },
      });
    }
    toast.success(t('aiPlanning.settings.saveSuccess'));
  };

  // Left panel phase click → switch to Tasks tab and expand that phase
  const handlePhaseSelect = (phase: number) => {
    setContentTab('phases');
    setSelectedPhase(phase);
  };

  // Determine if any phase is currently active
  const isAnyPhaseActive =
    currentPlan &&
    Object.values(currentPlan.phaseStatus).some((s) => s.status === 'active');

  // Auth loading
  if (authLoading) {
    return (
      <AppShell>
        <div className="flex flex-1 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-500 border-t-transparent" />
        </div>
      </AppShell>
    );
  }

  // Not authenticated
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

  // Loading plan detail
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
      <div className="flex h-full flex-col bg-gray-50">
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/ai-planning')}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold text-gray-900">
                {currentPlan.name}
              </h1>
              <p className="max-w-md truncate text-xs text-gray-500">
                {currentPlan.goal}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Status indicator */}
            {isAnyPhaseActive && (
              <span className="flex items-center gap-1.5 text-xs text-blue-600">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
                {t('aiPlanning.status.inProgress')}
              </span>
            )}
            {/* Settings */}
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            >
              <Settings className="h-4 w-4" />
            </button>
            {/* Export */}
            <button
              onClick={handleExport}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-4 w-4" />
              {t('aiPlanning.actions.export')}
            </button>
            {/* Delete */}
            <button
              onClick={handleDelete}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Phase Bar */}
        <div className="border-b border-gray-100 bg-gray-50">
          <PlanPhaseBar
            currentPhase={currentPlan.currentPhase}
            phaseStatus={currentPlan.phaseStatus}
            onPhaseClick={() => setContentTab('phases')}
          />
        </div>

        {/* Main content: left panel + right panel */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left Panel - Team */}
          <div className="hidden w-[360px] shrink-0 lg:block">
            <PlanTeamPanel
              plan={currentPlan}
              isAdvancing={isAdvancing}
              onStart={handleAdvance}
              onAdvance={handleAdvance}
              onRetry={handleRetry}
              onExport={handleExport}
              onPhaseSelect={handlePhaseSelect}
            />
          </div>

          {/* Right Panel - Content */}
          <div className="flex-1 overflow-hidden">
            <PlanContentPanel
              plan={currentPlan}
              activeTab={contentTab}
              onTabChange={setContentTab}
              selectedPhase={selectedPhase}
              onPhaseDeselect={() => setSelectedPhase(null)}
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

      {/* Settings modal */}
      {showSettings && (
        <PlanSettingsModal
          open={showSettings}
          onClose={() => setShowSettings(false)}
          plan={currentPlan}
          onSave={handleSettingsSave}
        />
      )}
    </AppShell>
  );
}
