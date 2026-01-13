'use client';

/**
 * TrendReport - 趋势报告组件
 * 展示科技趋势分析结果
 */

import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Calendar,
  Database,
  Target,
  ChevronDown,
  ChevronUp,
  Zap,
  Clock,
  ExternalLink,
  BarChart3,
} from 'lucide-react';

export interface TechTrend {
  name: string;
  direction: 'rising' | 'stable' | 'declining';
  maturityStage: string;
  momentumScore: number;
  adoptionRate: number;
  relatedTechs: string[];
  keyPlayers: string[];
  summary: string;
}

export interface TrendReportData {
  title: string;
  generatedAt: string;
  timeRange: string;
  executiveSummary: string;
  topTrends: TechTrend[];
  emergingTechs: string[];
  decliningTechs: string[];
  dataSourcesCount: number;
  confidenceScore: number;
}

interface TrendReportProps {
  report: TrendReportData;
  onTechClick?: (techName: string) => void;
  onViewHypeCycle?: () => void;
}

const DIRECTION_CONFIG = {
  rising: {
    icon: <TrendingUp className="h-4 w-4" />,
    color: 'text-green-600',
    bg: 'bg-green-50',
    label: '上升',
  },
  stable: {
    icon: <Minus className="h-4 w-4" />,
    color: 'text-yellow-600',
    bg: 'bg-yellow-50',
    label: '稳定',
  },
  declining: {
    icon: <TrendingDown className="h-4 w-4" />,
    color: 'text-red-600',
    bg: 'bg-red-50',
    label: '下降',
  },
};

const MATURITY_LABELS: Record<string, string> = {
  innovation_trigger: '创新触发期',
  peak_of_expectations: '期望膨胀期',
  trough_of_disillusionment: '泡沫破裂期',
  slope_of_enlightenment: '稳步爬升期',
  plateau_of_productivity: '生产成熟期',
};

function TrendCard({
  trend,
  index,
  onClick,
}: {
  trend: TechTrend;
  index: number;
  onClick?: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const dirConfig = DIRECTION_CONFIG[trend.direction];

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white transition-shadow hover:shadow-md">
      {/* Header */}
      <div
        className="flex cursor-pointer items-center justify-between p-4"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-600">
            {index + 1}
          </span>
          <div>
            <h3
              className="cursor-pointer font-semibold text-gray-900 hover:text-blue-600"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
              }}
            >
              {trend.name}
            </h3>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${dirConfig.bg} ${dirConfig.color}`}
              >
                {dirConfig.icon}
                {dirConfig.label}
              </span>
              <span className="text-xs text-gray-500">
                {MATURITY_LABELS[trend.maturityStage] || trend.maturityStage}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Momentum Score */}
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">
              {Math.round(trend.momentumScore)}
            </div>
            <div className="text-xs text-gray-500">动量</div>
          </div>

          {/* Adoption Rate */}
          <div className="text-right">
            <div className="text-sm font-medium text-gray-900">
              {Math.round(trend.adoptionRate)}%
            </div>
            <div className="text-xs text-gray-500">采用率</div>
          </div>

          {isExpanded ? (
            <ChevronUp className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          )}
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-gray-50 p-4">
          <p className="mb-3 text-sm text-gray-600">{trend.summary}</p>

          {/* Related Technologies */}
          {trend.relatedTechs.length > 0 && (
            <div className="mb-3">
              <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">
                相关技术
              </h4>
              <div className="flex flex-wrap gap-1">
                {trend.relatedTechs.map((tech) => (
                  <span
                    key={tech}
                    className="cursor-pointer rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700 hover:bg-blue-200"
                    onClick={() => onClick?.()}
                  >
                    {tech}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Key Players */}
          {trend.keyPlayers.length > 0 && (
            <div>
              <h4 className="mb-1 text-xs font-medium uppercase text-gray-500">
                主要参与者
              </h4>
              <div className="flex flex-wrap gap-1">
                {trend.keyPlayers.map((player) => (
                  <span
                    key={player}
                    className="rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-700"
                  >
                    {player}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrendReport({
  report,
  onTechClick,
  onViewHypeCycle,
}: TrendReportProps) {
  const confidencePercent = Math.round(report.confidenceScore * 100);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-xl border border-gray-200 bg-white p-6">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{report.title}</h2>
            <div className="mt-2 flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                {new Date(report.generatedAt).toLocaleDateString('zh-CN')}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {report.timeRange}
              </span>
              <span className="flex items-center gap-1">
                <Database className="h-4 w-4" />
                {report.dataSourcesCount} 数据源
              </span>
            </div>
          </div>

          {/* Confidence Badge */}
          <div className="text-right">
            <div
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                confidencePercent >= 70
                  ? 'bg-green-100 text-green-700'
                  : confidencePercent >= 40
                    ? 'bg-yellow-100 text-yellow-700'
                    : 'bg-red-100 text-red-700'
              }`}
            >
              置信度 {confidencePercent}%
            </div>
          </div>
        </div>

        {/* Executive Summary */}
        <div className="rounded-lg bg-blue-50 p-4">
          <h3 className="mb-2 flex items-center gap-2 font-medium text-blue-900">
            <Target className="h-4 w-4" />
            执行摘要
          </h3>
          <p className="text-sm leading-relaxed text-blue-800">
            {report.executiveSummary}
          </p>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-green-600">
            <TrendingUp className="h-5 w-5" />
            <span className="text-2xl font-bold">
              {report.emergingTechs.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">新兴技术</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {report.emergingTechs.slice(0, 3).map((tech) => (
              <span
                key={tech}
                className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-blue-600">
            <Zap className="h-5 w-5" />
            <span className="text-2xl font-bold">
              {report.topTrends.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">热门趋势</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {report.topTrends.slice(0, 3).map((trend) => (
              <span
                key={trend.name}
                className="rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700"
              >
                {trend.name}
              </span>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <div className="flex items-center gap-2 text-red-600">
            <TrendingDown className="h-5 w-5" />
            <span className="text-2xl font-bold">
              {report.decliningTechs.length}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-500">下降趋势</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {report.decliningTechs.slice(0, 3).map((tech) => (
              <span
                key={tech}
                className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Hype Cycle Button */}
      {onViewHypeCycle && (
        <button
          onClick={onViewHypeCycle}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white p-4 text-gray-700 transition-colors hover:bg-gray-50"
        >
          <BarChart3 className="h-5 w-5" />
          <span className="font-medium">查看 Hype Cycle 图表</span>
          <ExternalLink className="h-4 w-4" />
        </button>
      )}

      {/* Top Trends */}
      <div>
        <h3 className="mb-4 text-lg font-semibold text-gray-900">热门趋势</h3>
        <div className="space-y-3">
          {report.topTrends.map((trend, index) => (
            <TrendCard
              key={trend.name}
              trend={trend}
              index={index}
              onClick={() => onTechClick?.(trend.name)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
