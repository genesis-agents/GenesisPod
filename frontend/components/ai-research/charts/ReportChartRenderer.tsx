'use client';

/**
 * ReportChartRenderer - 报告图表渲染组件
 *
 * 支持多种图表类型：折线图、柱状图、饼图、面积图、雷达图
 * 基于 Recharts 实现
 */

import { useMemo } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ComposedChart,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  ZAxis,
} from 'recharts';
import type { ReportChart, ChartDataPoint } from '@/types/topic-research';

// 图表配色方案
const CHART_COLORS = [
  '#3B82F6', // blue-500
  '#10B981', // emerald-500
  '#F59E0B', // amber-500
  '#EF4444', // red-500
  '#8B5CF6', // violet-500
  '#EC4899', // pink-500
  '#06B6D4', // cyan-500
  '#84CC16', // lime-500
];

// 风险矩阵颜色
const RISK_COLORS = {
  low: '#10B981',
  medium: '#F59E0B',
  high: '#EF4444',
};

interface ReportChartRendererProps {
  chart: ReportChart;
  className?: string;
}

/**
 * 转换数据为 Recharts 格式
 */
function transformData(data: ChartDataPoint[]): Record<string, unknown>[] {
  // 检查是否有多系列数据
  const hasSeries = data.some((d) => d.series);

  if (!hasSeries) {
    // 单系列数据
    return data.map((d) => ({
      name: d.label,
      value: d.value,
      ...d.extra,
    }));
  }

  // 多系列数据：按 label 分组
  const grouped: Record<string, Record<string, unknown>> = {};
  data.forEach((d) => {
    if (!grouped[d.label]) {
      grouped[d.label] = { name: d.label };
    }
    if (d.series) {
      grouped[d.label][d.series] = d.value;
    }
  });

  return Object.values(grouped);
}

/**
 * 获取系列名称列表
 */
function getSeriesNames(data: ChartDataPoint[]): string[] {
  const seriesSet = new Set<string>();
  data.forEach((d) => {
    if (d.series) {
      seriesSet.add(d.series);
    }
  });
  return Array.from(seriesSet);
}

/**
 * 折线图
 */
function LineChartComponent({
  chart,
  data,
}: {
  chart: ReportChart;
  data: Record<string, unknown>[];
}) {
  const seriesNames = getSeriesNames(chart.data);
  const hasSeries = seriesNames.length > 0;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
          label={
            chart.yAxis?.unit
              ? { value: chart.yAxis.unit, angle: -90, position: 'insideLeft' }
              : undefined
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          }}
        />
        <Legend />
        {hasSeries ? (
          seriesNames.map((series, idx) => (
            <Line
              key={series}
              type="monotone"
              dataKey={series}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            />
          ))
        ) : (
          <Line
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            strokeWidth={2}
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * 柱状图
 */
function BarChartComponent({
  chart,
  data,
}: {
  chart: ReportChart;
  data: Record<string, unknown>[];
}) {
  const seriesNames = getSeriesNames(chart.data);
  const hasSeries = seriesNames.length > 0;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
          label={
            chart.yAxis?.unit
              ? { value: chart.yAxis.unit, angle: -90, position: 'insideLeft' }
              : undefined
          }
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
            boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
          }}
        />
        <Legend />
        {hasSeries ? (
          seriesNames.map((series, idx) => (
            <Bar
              key={series}
              dataKey={series}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              radius={[4, 4, 0, 0]}
            />
          ))
        ) : (
          <Bar dataKey="value" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}

/**
 * 面积图
 */
function AreaChartComponent({
  chart,
  data,
}: {
  chart: ReportChart;
  data: Record<string, unknown>[];
}) {
  const seriesNames = getSeriesNames(chart.data);
  const hasSeries = seriesNames.length > 0;

  return (
    <ResponsiveContainer width="100%" height={300}>
      <AreaChart
        data={data}
        margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          dataKey="name"
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
        />
        <YAxis
          tick={{ fontSize: 12 }}
          tickLine={false}
          axisLine={{ stroke: '#E5E7EB' }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
          }}
        />
        <Legend />
        {hasSeries ? (
          seriesNames.map((series, idx) => (
            <Area
              key={series}
              type="monotone"
              dataKey={series}
              stroke={CHART_COLORS[idx % CHART_COLORS.length]}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
              fillOpacity={0.3}
            />
          ))
        ) : (
          <Area
            type="monotone"
            dataKey="value"
            stroke={CHART_COLORS[0]}
            fill={CHART_COLORS[0]}
            fillOpacity={0.3}
          />
        )}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/**
 * 饼图
 */
function PieChartComponent({
  data,
}: {
  chart: ReportChart;
  data: Record<string, unknown>[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius={100}
          label={({ name, percent }) =>
            `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`
          }
          labelLine={{ stroke: '#9CA3AF' }}
        >
          {data.map((_, idx) => (
            <Cell
              key={`cell-${idx}`}
              fill={CHART_COLORS[idx % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
          }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}

/**
 * 雷达图
 */
function RadarChartComponent({
  data,
}: {
  chart: ReportChart;
  data: Record<string, unknown>[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={data}>
        <PolarGrid stroke="#E5E7EB" />
        <PolarAngleAxis dataKey="name" tick={{ fontSize: 12 }} />
        <PolarRadiusAxis tick={{ fontSize: 10 }} />
        <Radar
          dataKey="value"
          stroke={CHART_COLORS[0]}
          fill={CHART_COLORS[0]}
          fillOpacity={0.5}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: '#fff',
            border: '1px solid #E5E7EB',
            borderRadius: '8px',
          }}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
}

/**
 * 风险矩阵图（散点图）
 */
function RiskMatrixComponent({ chart }: { chart: ReportChart }) {
  const data = chart.data.map((d) => ({
    name: d.label,
    probability: d.value,
    impact: (d.extra?.impact as number) || 50,
    risk: d.label,
  }));

  // 根据风险等级分配颜色
  const getColor = (probability: number, impact: number) => {
    const score = (probability + impact) / 2;
    if (score >= 70) return RISK_COLORS.high;
    if (score >= 40) return RISK_COLORS.medium;
    return RISK_COLORS.low;
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ScatterChart margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
        <XAxis
          type="number"
          dataKey="probability"
          name="发生概率"
          domain={[0, 100]}
          tick={{ fontSize: 12 }}
          label={{ value: '发生概率 (%)', position: 'bottom', offset: 0 }}
        />
        <YAxis
          type="number"
          dataKey="impact"
          name="影响程度"
          domain={[0, 100]}
          tick={{ fontSize: 12 }}
          label={{ value: '影响程度 (%)', angle: -90, position: 'insideLeft' }}
        />
        <ZAxis range={[100, 400]} />
        <Tooltip
          cursor={{ strokeDasharray: '3 3' }}
          content={({ payload }) => {
            if (!payload || payload.length === 0) return null;
            const item = payload[0].payload;
            return (
              <div className="rounded-lg border bg-white p-3 shadow-lg">
                <p className="font-medium">{item.risk}</p>
                <p className="text-sm text-gray-600">
                  概率: {item.probability}%
                </p>
                <p className="text-sm text-gray-600">影响: {item.impact}%</p>
              </div>
            );
          }}
        />
        <Scatter data={data} shape="circle">
          {data.map((entry, idx) => (
            <Cell
              key={`cell-${idx}`}
              fill={getColor(entry.probability, entry.impact)}
            />
          ))}
        </Scatter>
        {/* 风险区域背景 */}
        <defs>
          <linearGradient id="riskGradient" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0%" stopColor="#10B981" stopOpacity={0.1} />
            <stop offset="50%" stopColor="#F59E0B" stopOpacity={0.1} />
            <stop offset="100%" stopColor="#EF4444" stopOpacity={0.1} />
          </linearGradient>
        </defs>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/**
 * 主渲染组件
 */
export function ReportChartRenderer({
  chart,
  className = '',
}: ReportChartRendererProps) {
  const transformedData = useMemo(
    () => transformData(chart.data),
    [chart.data]
  );

  const renderChart = () => {
    switch (chart.type) {
      case 'line':
        return <LineChartComponent chart={chart} data={transformedData} />;
      case 'bar':
        return <BarChartComponent chart={chart} data={transformedData} />;
      case 'area':
        return <AreaChartComponent chart={chart} data={transformedData} />;
      case 'pie':
        return <PieChartComponent chart={chart} data={transformedData} />;
      case 'radar':
        return <RadarChartComponent chart={chart} data={transformedData} />;
      case 'composed':
        // 组合图使用柱状图+折线图
        return <BarChartComponent chart={chart} data={transformedData} />;
      default:
        return <BarChartComponent chart={chart} data={transformedData} />;
    }
  };

  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}
    >
      {/* 图表标题 */}
      <div className="mb-4">
        <h4 className="text-base font-semibold text-gray-900">{chart.title}</h4>
        {chart.description && (
          <p className="mt-1 text-sm text-gray-500">{chart.description}</p>
        )}
      </div>

      {/* 图表内容 */}
      <div className="min-h-[300px]">{renderChart()}</div>

      {/* 数据来源 */}
      {chart.source && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="text-xs text-gray-400">数据来源: {chart.source}</p>
        </div>
      )}
    </div>
  );
}

/**
 * 风险矩阵专用渲染
 */
export function RiskMatrixRenderer({
  chart,
  className = '',
}: ReportChartRendererProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-4 shadow-sm ${className}`}
    >
      <div className="mb-4">
        <h4 className="text-base font-semibold text-gray-900">{chart.title}</h4>
        {chart.description && (
          <p className="mt-1 text-sm text-gray-500">{chart.description}</p>
        )}
      </div>

      <RiskMatrixComponent chart={chart} />

      {/* 图例 */}
      <div className="mt-4 flex items-center justify-center gap-6">
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: RISK_COLORS.low }}
          />
          <span className="text-sm text-gray-600">低风险</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: RISK_COLORS.medium }}
          />
          <span className="text-sm text-gray-600">中风险</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: RISK_COLORS.high }}
          />
          <span className="text-sm text-gray-600">高风险</span>
        </div>
      </div>
    </div>
  );
}

export default ReportChartRenderer;
