/**
 * Chart Validation Utilities
 *
 * 图表数据验证工具
 *
 * 功能:
 * 1. 验证图表数据点格式
 * 2. 检查 NaN/Infinity 值
 * 3. 验证饼图百分比总和
 * 4. 过滤无效数据点
 */

import type { ReportChart, ChartDataPoint } from '@/types/topic-research';

/**
 * 验证结果
 */
export interface ChartValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  /** 清洗后的有效数据（已移除无效数据点） */
  cleanedData?: ChartDataPoint[];
}

/**
 * 验证单个数据点是否有效
 */
export function isValidDataPoint(point: ChartDataPoint): boolean {
  // 检查 value 是否为有效数字
  if (typeof point.value !== 'number' || !isFinite(point.value)) {
    return false;
  }

  // 检查 label 是否存在
  if (
    !point.label ||
    typeof point.label !== 'string' ||
    point.label.trim() === ''
  ) {
    return false;
  }

  return true;
}

/**
 * 验证图表数据
 */
export function validateChartData(chart: ReportChart): ChartValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 检查基础字段
  if (!chart.id) {
    errors.push('图表缺少 ID');
  }

  if (!chart.title) {
    warnings.push('图表缺少标题');
  }

  // 对于生成图表，检查数据
  if (chart.chartType === 'generated') {
    if (!chart.type) {
      errors.push('生成图表缺少类型 (type)');
    }

    if (!chart.data || !Array.isArray(chart.data)) {
      errors.push('生成图表缺少数据 (data)');
      return { isValid: false, errors, warnings };
    }

    if (chart.data.length === 0) {
      errors.push('图表数据为空');
      return { isValid: false, errors, warnings };
    }

    // 验证每个数据点
    const cleanedData: ChartDataPoint[] = [];
    let invalidCount = 0;

    chart.data.forEach((point, index) => {
      if (isValidDataPoint(point)) {
        cleanedData.push(point);
      } else {
        invalidCount++;
        if (typeof point.value !== 'number' || !isFinite(point.value)) {
          warnings.push(`数据点 ${index} 的值无效: ${point.value}`);
        }
        if (!point.label || point.label.trim() === '') {
          warnings.push(`数据点 ${index} 的标签为空`);
        }
      }
    });

    if (invalidCount > 0) {
      warnings.push(`已过滤 ${invalidCount} 个无效数据点`);
    }

    // 检查饼图百分比
    if (chart.type === 'pie' && cleanedData.length > 0) {
      const total = cleanedData.reduce((sum, d) => sum + d.value, 0);
      if (Math.abs(total - 100) > 1) {
        warnings.push(`饼图数据总和为 ${total.toFixed(1)}%，不等于 100%`);
      }
    }

    // 检查数据点数量
    if (cleanedData.length > 100) {
      warnings.push(`数据点过多 (${cleanedData.length})，可能影响渲染性能`);
    }

    return {
      isValid: cleanedData.length > 0,
      errors,
      warnings,
      cleanedData,
    };
  }

  // 对于引用图表，检查图片 URL
  if (chart.chartType === 'reference') {
    if (!chart.imageUrl) {
      errors.push('引用图表缺少图片 URL');
    } else if (!isValidUrl(chart.imageUrl)) {
      warnings.push('图片 URL 格式可能无效');
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * 验证 URL 格式
 */
export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 清洗图表数据（移除无效数据点）
 */
export function cleanChartData(chart: ReportChart): ReportChart {
  if (chart.chartType !== 'generated' || !chart.data) {
    return chart;
  }

  const cleanedData = chart.data.filter(isValidDataPoint);

  return {
    ...chart,
    data: cleanedData,
  };
}

/**
 * 批量验证图表
 */
export function validateCharts(charts: ReportChart[]): {
  validCharts: ReportChart[];
  invalidCharts: Array<{ chart: ReportChart; errors: string[] }>;
  summary: {
    total: number;
    valid: number;
    invalid: number;
  };
} {
  const validCharts: ReportChart[] = [];
  const invalidCharts: Array<{ chart: ReportChart; errors: string[] }> = [];

  charts.forEach((chart) => {
    const result = validateChartData(chart);
    if (result.isValid) {
      // 使用清洗后的数据
      if (result.cleanedData && chart.chartType === 'generated') {
        validCharts.push({ ...chart, data: result.cleanedData });
      } else {
        validCharts.push(chart);
      }
    } else {
      invalidCharts.push({ chart, errors: result.errors });
    }
  });

  return {
    validCharts,
    invalidCharts,
    summary: {
      total: charts.length,
      valid: validCharts.length,
      invalid: invalidCharts.length,
    },
  };
}

/**
 * 降采样大数据集（用于性能优化）
 */
export function downsampleChartData(
  data: ChartDataPoint[],
  maxPoints: number = 100
): ChartDataPoint[] {
  if (data.length <= maxPoints) {
    return data;
  }

  const step = Math.ceil(data.length / maxPoints);
  const sampled: ChartDataPoint[] = [];

  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }

  // 确保最后一个数据点被包含
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }

  return sampled;
}

/**
 * 标准化图表数据（确保一致的数据格式）
 */
export function normalizeChartData(chart: ReportChart): ReportChart {
  const cleaned = cleanChartData(chart);

  if (cleaned.chartType === 'generated' && cleaned.data) {
    // 确保数值精度
    cleaned.data = cleaned.data.map((point) => ({
      ...point,
      value: Number(point.value.toFixed(2)),
      label: point.label.trim(),
    }));

    // 如果数据点过多，进行降采样
    if (cleaned.data.length > 500) {
      cleaned.data = downsampleChartData(cleaned.data, 500);
    }
  }

  return cleaned;
}
