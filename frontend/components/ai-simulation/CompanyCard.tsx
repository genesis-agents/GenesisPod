'use client';

import { useState } from 'react';
import { ScenarioFormCompany } from '@/app/ai-simulation/types';
import { config } from '@/lib/utils/config';
import { getAuthHeader } from '@/lib/utils/auth';
import { useI18n } from '@/lib/i18n/i18n-context';

import { logger } from '@/lib/utils/logger';
interface CompanyCardProps {
  index: number;
  company: ScenarioFormCompany;
  industry: string;
  onUpdate: (value: ScenarioFormCompany) => void;
  onRemove: () => void;
}

export function CompanyCard({
  index,
  company,
  industry,
  onUpdate,
  onRemove,
}: CompanyCardProps) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{
    metrics: Record<string, string | number>;
    reasoning: string;
    dataSource?: string; // 数据来源标识
  } | null>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  // 从metrics中获取值，提供默认值
  const metrics = company.metrics || {};

  const updateMetrics = (key: string, value: string | number) => {
    onUpdate({
      ...company,
      metrics: { ...metrics, [key]: value },
    });
  };

  // AI辅助生成指标
  const handleAiAssist = async () => {
    if (!company.name || !company.type) {
      alert(t('aiSimulation.editor.companies.fillNameAndType'));
      return;
    }

    setAiLoading(true);
    try {
      const res = await fetch(
        `${config.apiUrl}/simulation/ai-assist/generate-metrics`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeader(),
          },
          body: JSON.stringify({
            companyName: company.name,
            companyType: company.type,
            industry: industry,
            market: company.market,
          }),
        }
      );

      if (!res.ok)
        throw new Error(t('aiSimulation.editor.companies.aiGenerateFailed'));

      const result = await res.json();
      // Handle wrapped API response { success: true, data: T }
      const data = result?.data ?? result;
      setAiSuggestion(data);
      setShowConfirmDialog(true);
    } catch (err) {
      logger.error('AI assist error:', err);
      alert(t('aiSimulation.editor.companies.aiGenerateRetry'));
    } finally {
      setAiLoading(false);
    }
  };

  // 确认应用AI建议
  const applyAiSuggestion = () => {
    if (aiSuggestion) {
      onUpdate({
        ...company,
        metrics: aiSuggestion.metrics,
      });
      setShowConfirmDialog(false);
      setAiSuggestion(null);
      setExpanded(true); // 展开查看结果
    }
  };

  const companyTypes = [
    {
      value: 'benchmark',
      label: t('aiSimulation.editor.companies.types.benchmark'),
      color: 'bg-blue-100 text-blue-700',
    },
    {
      value: 'startup',
      label: t('aiSimulation.editor.companies.types.startup'),
      color: 'bg-green-100 text-green-700',
    },
    {
      value: 'regional',
      label: t('aiSimulation.editor.companies.types.regional'),
      color: 'bg-purple-100 text-purple-700',
    },
    {
      value: 'challenger',
      label: t('aiSimulation.editor.companies.types.challenger'),
      color: 'bg-orange-100 text-orange-700',
    },
    {
      value: 'competitor',
      label: t('aiSimulation.editor.companies.types.competitor'),
      color: 'bg-red-100 text-red-700',
    },
    {
      value: 'customer',
      label: t('aiSimulation.editor.companies.types.customer'),
      color: 'bg-cyan-100 text-cyan-700',
    },
    {
      value: 'supplier',
      label: t('aiSimulation.editor.companies.types.supplier'),
      color: 'bg-teal-100 text-teal-700',
    },
    {
      value: 'regulatory',
      label: t('aiSimulation.editor.companies.types.regulatory'),
      color: 'bg-gray-100 text-gray-700',
    },
  ];

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-sm transition-all hover:shadow-md">
      {/* Header - 始终显示 */}
      <div className="flex items-center gap-4 p-4">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-lg font-semibold text-white">
          {index + 1}
        </div>
        <div className="flex-1">
          <input
            value={company.name}
            onChange={(e) => onUpdate({ ...company, name: e.target.value })}
            placeholder={t('aiSimulation.editor.companies.namePlaceholder')}
            className="w-full border-none bg-transparent text-base font-semibold text-gray-900 placeholder-gray-400 focus:outline-none"
          />
          <div className="mt-1 flex items-center gap-2">
            <select
              value={company.type}
              onChange={(e) => onUpdate({ ...company, type: e.target.value })}
              className="rounded border-none bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">
                {t('aiSimulation.editor.companies.selectType')}
              </option>
              {companyTypes.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-400">·</span>
            <input
              value={company.market}
              onChange={(e) => onUpdate({ ...company, market: e.target.value })}
              placeholder={t('aiSimulation.editor.companies.marketPlaceholder')}
              className="w-24 border-none bg-transparent text-xs text-gray-500 placeholder-gray-400 focus:outline-none"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* AI辅助按钮 */}
          <button
            onClick={handleAiAssist}
            disabled={aiLoading}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              aiLoading
                ? 'cursor-wait bg-purple-100 text-purple-400'
                : 'bg-gradient-to-r from-purple-500 to-indigo-500 text-white hover:from-purple-600 hover:to-indigo-600'
            }`}
            title={t('aiSimulation.editor.companies.aiAssistTitle')}
          >
            {aiLoading ? (
              <>
                <svg
                  className="h-3.5 w-3.5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                {t('aiSimulation.editor.companies.generating')}
              </>
            ) : (
              <>
                <svg
                  className="h-3.5 w-3.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
                {t('aiSimulation.editor.companies.aiGenerate')}
              </>
            )}
          </button>
          <button
            onClick={() => setExpanded(!expanded)}
            className={`flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              expanded
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {expanded
              ? t('aiSimulation.editor.companies.collapse')
              : t('aiSimulation.editor.companies.expandMetrics')}
            <svg
              className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
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
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* AI确认对话框 */}
      {showConfirmDialog && aiSuggestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
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
                    d="M13 10V3L4 14h7v7l9-11h-7z"
                  />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  {t('aiSimulation.editor.companies.aiGeneratedSuggestion')}
                </h3>
                <p className="text-sm text-gray-500">{company.name}</p>
              </div>
            </div>

            {/* 数据来源标识 */}
            {aiSuggestion.dataSource && (
              <div className="mb-3 flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                    aiSuggestion.dataSource.includes('External')
                      ? 'bg-green-100 text-green-700'
                      : aiSuggestion.dataSource.includes('LLM')
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  📊 {aiSuggestion.dataSource}
                </span>
              </div>
            )}

            {/* AI推理说明 */}
            <div className="mb-4 rounded-lg bg-indigo-50 p-3 text-sm text-indigo-700">
              <span className="font-medium">
                {t('aiSimulation.editor.companies.aiAnalysis')}
              </span>{' '}
              {aiSuggestion.reasoning}
            </div>

            {/* 指标预览 */}
            <div className="mb-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.cash')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    ${aiSuggestion.metrics.cash?.toLocaleString()}
                    {t('aiSimulation.editor.companies.units.tenThousandUSD')}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.share')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.share}%
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.margin')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.margin}%
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.debt')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    ${aiSuggestion.metrics.debt?.toLocaleString()}
                    {t('aiSimulation.editor.companies.units.tenThousandUSD')}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.capacity')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.capacity?.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.inventory')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.inventory?.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.priceRange')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.priceBand}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.deliveryTime')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.delivery}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.patents')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.patents?.toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-gray-50 p-2">
                  <span className="text-gray-500">
                    {t('aiSimulation.editor.companies.metrics.channels')}
                  </span>
                  <p className="font-semibold text-gray-900">
                    {aiSuggestion.metrics.channels}
                  </p>
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setAiSuggestion(null);
                }}
                className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
              >
                {t('aiSimulation.editor.companies.cancel')}
              </button>
              <button
                onClick={applyAiSuggestion}
                className="flex-1 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:from-purple-600 hover:to-indigo-700"
              >
                {t('aiSimulation.editor.companies.applySuggestion')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Expanded - 量化指标详情 */}
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4">
          {/* {t("aiSimulation.editor.companies.sections.core")} */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-green-100 text-green-600">
                $
              </span>
              核心财务指标
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.cash')}{' '}
                  {t('aiSimulation.editor.companies.units.tenThousandUSD')}
                </label>
                <input
                  type="number"
                  value={metrics.cash || ''}
                  onChange={(e) =>
                    updateMetrics('cash', parseFloat(e.target.value) || 0)
                  }
                  placeholder="10000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.share')}{' '}
                  {t('aiSimulation.editor.companies.units.percent')}
                </label>
                <input
                  type="number"
                  value={metrics.share || ''}
                  onChange={(e) =>
                    updateMetrics('share', parseFloat(e.target.value) || 0)
                  }
                  placeholder="15"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.margin')}{' '}
                  {t('aiSimulation.editor.companies.units.percent')}
                </label>
                <input
                  type="number"
                  value={metrics.margin || ''}
                  onChange={(e) =>
                    updateMetrics('margin', parseFloat(e.target.value) || 0)
                  }
                  placeholder="35"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.debt')}{' '}
                  {t('aiSimulation.editor.companies.units.tenThousandUSD')}
                </label>
                <input
                  type="number"
                  value={metrics.debt || ''}
                  onChange={(e) =>
                    updateMetrics('debt', parseFloat(e.target.value) || 0)
                  }
                  placeholder="5000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* {t("aiSimulation.editor.companies.sections.operations")} */}
          <div className="mb-4">
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-blue-100 text-blue-600">
                ⚡
              </span>
              运营指标
            </h4>
            <div className="grid gap-3 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.capacity')}{' '}
                  {t('aiSimulation.editor.companies.units.units')}
                </label>
                <input
                  type="number"
                  value={metrics.capacity || ''}
                  onChange={(e) =>
                    updateMetrics('capacity', parseFloat(e.target.value) || 0)
                  }
                  placeholder="1000"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.inventory')}{' '}
                  {t('aiSimulation.editor.companies.units.units')}
                </label>
                <input
                  type="number"
                  value={metrics.inventory || ''}
                  onChange={(e) =>
                    updateMetrics('inventory', parseFloat(e.target.value) || 0)
                  }
                  placeholder="200"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.priceRange')}
                </label>
                <input
                  type="text"
                  value={metrics.priceBand || ''}
                  onChange={(e) => updateMetrics('priceBand', e.target.value)}
                  placeholder={t(
                    'aiSimulation.editor.companies.placeholders.priceRange'
                  )}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.deliveryTime')}
                </label>
                <input
                  type="text"
                  value={metrics.delivery || ''}
                  onChange={(e) => updateMetrics('delivery', e.target.value)}
                  placeholder={t(
                    'aiSimulation.editor.companies.placeholders.deliveryTime'
                  )}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          {/* {t("aiSimulation.editor.companies.sections.moat")}指标 */}
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-purple-100 text-purple-600">
                🏰
              </span>
              护城河
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.patents')}
                </label>
                <input
                  type="number"
                  value={metrics.patents || ''}
                  onChange={(e) =>
                    updateMetrics('patents', parseInt(e.target.value) || 0)
                  }
                  placeholder="50"
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.channels')}
                </label>
                <input
                  type="text"
                  value={metrics.channels || ''}
                  onChange={(e) => updateMetrics('channels', e.target.value)}
                  placeholder={t(
                    'aiSimulation.editor.companies.placeholders.channels'
                  )}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">
                  {t('aiSimulation.editor.companies.metrics.brand')}
                </label>
                <select
                  value={metrics.brand || ''}
                  onChange={(e) => updateMetrics('brand', e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">
                    {t('aiSimulation.editor.companies.brandOptions.select')}
                  </option>
                  <option value="global_leader">
                    {t(
                      'aiSimulation.editor.companies.brandOptions.globalLeader'
                    )}
                  </option>
                  <option value="strong">
                    {t('aiSimulation.editor.companies.brandOptions.strong')}
                  </option>
                  <option value="growing">
                    {t('aiSimulation.editor.companies.brandOptions.growing')}
                  </option>
                  <option value="niche">
                    {t('aiSimulation.editor.companies.brandOptions.niche')}
                  </option>
                  <option value="emerging">
                    {t('aiSimulation.editor.companies.brandOptions.emerging')}
                  </option>
                </select>
              </div>
            </div>
          </div>

          {/* AI补充提示 */}
          <div className="mt-4 flex items-center gap-2 rounded-lg border border-indigo-100 bg-indigo-50/50 px-3 py-2 text-xs text-indigo-600">
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
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <span>{t('aiSimulation.editor.companies.aiHint')}</span>
          </div>
        </div>
      )}
    </div>
  );
}
