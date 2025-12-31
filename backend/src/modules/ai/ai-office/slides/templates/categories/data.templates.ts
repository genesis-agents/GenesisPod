/**
 * Slides Engine v3.0 - Data Templates
 *
 * 数据型模板 (6个)：用于展示数据、指标和分析
 * D-001 ~ D-006
 */

import { SlideTemplate } from "../base/template-registry";
import {
  COMMON_CONTAINER,
  CARD_STYLE,
  FOOTER_STYLE,
  COLORS,
} from "../base/common-styles";

// ============================================================================
// D-001: Big-Number (大数字)
// ============================================================================

export const BIG_NUMBER_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "D-001",
    type: "dashboard",
    name: "大数字",
    description: "突出展示单个核心数据指标",
    useCases: ["核心指标", "关键数据", "重点数字"],
    contentDensity: "low",
    visualStyle: "data-driven",
    recommendedFor: ["数据亮点", "成果展示"],
    maxContentBlocks: 3,
    variables: ["{{TITLE}}", "{{NUMBER}}", "{{LABEL}}", "{{CHANGE}}"],
    keywords: ["数字", "指标", "数据", "增长", "统计", "KPI"],
    positionFit: { opening: 0.5, middle: 0.9, closing: 0.6 },
    compatibility: {
      goodBefore: ["C-003", "A-001"],
      goodAfter: ["S-002", "N-002"],
      avoidNear: ["D-002"],
    },
    tone: "positive",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">核心业务指标</p>

  <div style="display: flex; align-items: center; justify-content: center; height: calc(100% - 160px);">
    <div style="text-align: center;">
      <div style="font-size: 120px; font-weight: 900; color: ${COLORS.primary}; line-height: 1; margin-bottom: 16px;">{{NUMBER}}</div>
      <div style="font-size: 28px; color: #94A3B8; margin-bottom: 24px;">{{LABEL}}</div>
      <div style="display: inline-flex; align-items: center; gap: 12px; padding: 12px 24px; background: rgba(16, 185, 129, 0.15); border-radius: 8px;">
        <span style="color: ${COLORS.success}; font-size: 20px;">↑</span>
        <span style="color: ${COLORS.success}; font-size: 18px; font-weight: 600;">{{CHANGE}}</span>
        <span style="color: #94A3B8; font-size: 14px;">较上期</span>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">数据更新时间: {{DATE}} | {{TITLE}}</div>
</div>
  `.trim(),
};

// ============================================================================
// D-002: Dashboard-4KPI (四指标仪表盘)
// ============================================================================

export const DASHBOARD_4KPI_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "D-002",
    type: "dashboard",
    name: "四指标仪表盘",
    description: "展示四个关键业务指标的综合视图",
    useCases: ["数据仪表盘", "KPI监控", "业务概览"],
    contentDensity: "high",
    visualStyle: "data-driven",
    recommendedFor: ["业务汇报", "指标监控"],
    maxContentBlocks: 4,
    variables: ["{{TITLE}}", "{{KPI1}}", "{{KPI2}}", "{{KPI3}}", "{{KPI4}}"],
    keywords: ["仪表盘", "KPI", "指标", "监控", "Dashboard", "数据"],
    positionFit: { opening: 0.3, middle: 0.95, closing: 0.4 },
    compatibility: {
      goodBefore: ["C-003", "A-001"],
      goodAfter: ["S-002", "D-001"],
      avoidNear: ["D-001"],
    },
    tone: "analytical",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">关键业务指标一览</p>

  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; height: calc(100% - 140px);">
    <div style="${CARD_STYLE} display: flex; flex-direction: column; justify-content: center; border-left: 4px solid ${COLORS.primary};">
      <div style="font-size: 48px; font-weight: 900; color: ${COLORS.primary}; margin-bottom: 8px;">{{KPI1_VALUE}}</div>
      <div style="font-size: 16px; color: #94A3B8; margin-bottom: 12px;">{{KPI1_LABEL}}</div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: ${COLORS.success}; font-size: 14px;">↑ {{KPI1_CHANGE}}</span>
        <span style="color: #64748B; font-size: 12px;">较上月</span>
      </div>
    </div>

    <div style="${CARD_STYLE} display: flex; flex-direction: column; justify-content: center; border-left: 4px solid ${COLORS.secondary};">
      <div style="font-size: 48px; font-weight: 900; color: ${COLORS.secondary}; margin-bottom: 8px;">{{KPI2_VALUE}}</div>
      <div style="font-size: 16px; color: #94A3B8; margin-bottom: 12px;">{{KPI2_LABEL}}</div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: ${COLORS.success}; font-size: 14px;">↑ {{KPI2_CHANGE}}</span>
        <span style="color: #64748B; font-size: 12px;">较上月</span>
      </div>
    </div>

    <div style="${CARD_STYLE} display: flex; flex-direction: column; justify-content: center; border-left: 4px solid ${COLORS.success};">
      <div style="font-size: 48px; font-weight: 900; color: ${COLORS.success}; margin-bottom: 8px;">{{KPI3_VALUE}}</div>
      <div style="font-size: 16px; color: #94A3B8; margin-bottom: 12px;">{{KPI3_LABEL}}</div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: ${COLORS.success}; font-size: 14px;">↑ {{KPI3_CHANGE}}</span>
        <span style="color: #64748B; font-size: 12px;">较上月</span>
      </div>
    </div>

    <div style="${CARD_STYLE} display: flex; flex-direction: column; justify-content: center; border-left: 4px solid ${COLORS.purple};">
      <div style="font-size: 48px; font-weight: 900; color: ${COLORS.purple}; margin-bottom: 8px;">{{KPI4_VALUE}}</div>
      <div style="font-size: 16px; color: #94A3B8; margin-bottom: 12px;">{{KPI4_LABEL}}</div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="color: ${COLORS.success}; font-size: 14px;">↑ {{KPI4_CHANGE}}</span>
        <span style="color: #64748B; font-size: 12px;">较上月</span>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">数据更新时间: {{DATE}} | 来源: 业务数据平台</div>
</div>
  `.trim(),
};

// ============================================================================
// D-003: Trend-Chart (趋势图)
// ============================================================================

export const TREND_CHART_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "D-003",
    type: "dashboard",
    name: "趋势图",
    description: "展示数据随时间变化的趋势",
    useCases: ["趋势分析", "增长曲线", "时间序列"],
    contentDensity: "medium",
    visualStyle: "data-driven",
    recommendedFor: ["数据分析", "趋势展示"],
    maxContentBlocks: 2,
    variables: ["{{TITLE}}", "{{CHART_DATA}}"],
    keywords: ["趋势", "增长", "变化", "曲线", "Chart", "图表"],
    positionFit: { opening: 0.3, middle: 0.9, closing: 0.4 },
    compatibility: {
      goodBefore: ["C-003", "A-001"],
      goodAfter: ["D-001", "D-002"],
      avoidNear: [],
    },
    tone: "analytical",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">数据趋势分析</p>

  <div style="display: flex; gap: 32px; height: calc(100% - 120px);">
    <div style="flex: 1; ${CARD_STYLE}">
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 16px; color: #94A3B8;">趋势走势</div>
      <div id="chart-trend" style="width: 100%; height: calc(100% - 40px);"></div>
    </div>

    <div style="flex: 0 0 280px; display: flex; flex-direction: column; gap: 16px;">
      <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.primary};">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">当前值</div>
        <div style="font-size: 32px; font-weight: 900; color: ${COLORS.primary};">{{CURRENT_VALUE}}</div>
      </div>
      <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.success};">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">环比增长</div>
        <div style="font-size: 24px; font-weight: 700; color: ${COLORS.success};">{{MOM_CHANGE}}</div>
      </div>
      <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.secondary};">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">同比增长</div>
        <div style="font-size: 24px; font-weight: 700; color: ${COLORS.secondary};">{{YOY_CHANGE}}</div>
      </div>
      <div style="${CARD_STYLE} flex: 1;">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">关键洞察</div>
        <p style="font-size: 13px; color: #94A3B8; margin: 0; line-height: 1.6;">{{INSIGHT}}</p>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">数据周期: {{PERIOD}} | {{TITLE}}</div>
</div>
  `.trim(),
  script: `
var chart = echarts.init(document.getElementById('chart-trend'));
chart.setOption({
  backgroundColor: 'transparent',
  textStyle: { color: '#94A3B8' },
  grid: { left: 50, right: 20, top: 20, bottom: 40 },
  xAxis: { type: 'category', data: {{X_DATA}}, axisLine: { lineStyle: { color: '#334155' } } },
  yAxis: { type: 'value', axisLine: { lineStyle: { color: '#334155' } }, splitLine: { lineStyle: { color: '#334155' } } },
  series: [{
    type: 'line',
    data: {{Y_DATA}},
    smooth: true,
    lineStyle: { color: '#D4AF37', width: 3 },
    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(212, 175, 55, 0.3)' }, { offset: 1, color: 'rgba(212, 175, 55, 0)' }] } },
    symbol: 'circle',
    symbolSize: 8,
    itemStyle: { color: '#D4AF37' }
  }]
});
  `.trim(),
};

// ============================================================================
// D-004: Comparison-Dual (双向对比)
// ============================================================================

export const COMPARISON_DUAL_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "D-004",
    type: "comparison",
    name: "双向对比",
    description: "并排展示两个选项的优劣对比",
    useCases: ["方案对比", "A/B对比", "优劣分析"],
    contentDensity: "high",
    visualStyle: "professional",
    recommendedFor: ["决策支持", "方案选择"],
    maxContentBlocks: 2,
    variables: ["{{TITLE}}", "{{OPTION_A}}", "{{OPTION_B}}"],
    keywords: ["对比", "比较", "VS", "方案", "选择", "优劣"],
    positionFit: { opening: 0.3, middle: 0.95, closing: 0.5 },
    compatibility: {
      goodBefore: ["A-001", "A-003"],
      goodAfter: ["S-002", "N-002"],
      avoidNear: ["D-005"],
    },
    tone: "analytical",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">方案对比分析</p>

  <div style="display: flex; gap: 32px; height: calc(100% - 120px);">
    <div style="flex: 1; ${CARD_STYLE} border-color: ${COLORS.primary}; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <div style="width: 40px; height: 40px; background: ${COLORS.primary}; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900;">A</div>
        <h3 style="font-size: 20px; font-weight: 700; margin: 0;">{{OPTION_A_TITLE}}</h3>
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
          <span style="color: ${COLORS.success};">✓</span>
          <span style="font-size: 14px;">{{A_PRO1}}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
          <span style="color: ${COLORS.success};">✓</span>
          <span style="font-size: 14px;">{{A_PRO2}}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">
          <span style="color: ${COLORS.danger};">✗</span>
          <span style="font-size: 14px; color: #94A3B8;">{{A_CON1}}</span>
        </div>
      </div>

      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
        <div style="font-size: 14px; color: #64748B;">预估投入</div>
        <div style="font-size: 28px; font-weight: 900; color: ${COLORS.primary};">{{A_COST}}</div>
      </div>
    </div>

    <div style="flex: 1; ${CARD_STYLE} border-color: ${COLORS.secondary}; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <div style="width: 40px; height: 40px; background: ${COLORS.secondary}; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900;">B</div>
        <h3 style="font-size: 20px; font-weight: 700; margin: 0;">{{OPTION_B_TITLE}}</h3>
      </div>

      <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
          <span style="color: ${COLORS.success};">✓</span>
          <span style="font-size: 14px;">{{B_PRO1}}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px;">
          <span style="color: ${COLORS.success};">✓</span>
          <span style="font-size: 14px;">{{B_PRO2}}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px;">
          <span style="color: ${COLORS.danger};">✗</span>
          <span style="font-size: 14px; color: #94A3B8;">{{B_CON1}}</span>
        </div>
      </div>

      <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #334155;">
        <div style="font-size: 14px; color: #64748B;">预估投入</div>
        <div style="font-size: 28px; font-weight: 900; color: ${COLORS.secondary};">{{B_COST}}</div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">数据来源: 市场调研报告 | {{TITLE}}</div>
</div>
  `.trim(),
};

// ============================================================================
// D-005: Comparison-Table (对比表格)
// ============================================================================

export const COMPARISON_TABLE_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "D-005",
    type: "comparison",
    name: "对比表格",
    description: "表格形式的多维度对比",
    useCases: ["特性对比", "产品对比", "多维比较"],
    contentDensity: "high",
    visualStyle: "professional",
    recommendedFor: ["产品选型", "特性比较"],
    maxContentBlocks: 6,
    variables: ["{{TITLE}}", "{{HEADERS}}", "{{ROWS}}"],
    keywords: ["表格", "对比", "特性", "产品", "比较"],
    positionFit: { opening: 0.2, middle: 0.9, closing: 0.4 },
    compatibility: {
      goodBefore: ["A-001", "A-003"],
      goodAfter: ["S-002"],
      avoidNear: ["D-004"],
    },
    tone: "analytical",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">特性对比分析</p>

  <div style="height: calc(100% - 140px); overflow: hidden;">
    <table style="width: 100%; border-collapse: collapse;">
      <thead>
        <tr>
          <th style="padding: 16px; text-align: left; font-size: 14px; font-weight: 700; color: #94A3B8; border-bottom: 2px solid #334155;">特性</th>
          <th style="padding: 16px; text-align: center; font-size: 14px; font-weight: 700; color: ${COLORS.primary}; border-bottom: 2px solid #334155;">{{COL1_HEADER}}</th>
          <th style="padding: 16px; text-align: center; font-size: 14px; font-weight: 700; color: ${COLORS.secondary}; border-bottom: 2px solid #334155;">{{COL2_HEADER}}</th>
          <th style="padding: 16px; text-align: center; font-size: 14px; font-weight: 700; color: ${COLORS.success}; border-bottom: 2px solid #334155;">{{COL3_HEADER}}</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW1_LABEL}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW1_COL1}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW1_COL2}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW1_COL3}}</td>
        </tr>
        <tr style="background: rgba(30, 41, 59, 0.5);">
          <td style="padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW2_LABEL}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW2_COL1}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW2_COL2}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW2_COL3}}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW3_LABEL}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW3_COL1}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW3_COL2}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW3_COL3}}</td>
        </tr>
        <tr style="background: rgba(30, 41, 59, 0.5);">
          <td style="padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW4_LABEL}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW4_COL1}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW4_COL2}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 14px; border-bottom: 1px solid #334155;">{{ROW4_COL3}}</td>
        </tr>
        <tr>
          <td style="padding: 14px 16px; font-size: 14px; font-weight: 700;">{{ROW5_LABEL}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 16px; font-weight: 700; color: ${COLORS.primary};">{{ROW5_COL1}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 16px; font-weight: 700; color: ${COLORS.secondary};">{{ROW5_COL2}}</td>
          <td style="padding: 14px 16px; text-align: center; font-size: 16px; font-weight: 700; color: ${COLORS.success};">{{ROW5_COL3}}</td>
        </tr>
      </tbody>
    </table>
  </div>

  <div style="${FOOTER_STYLE}">{{TITLE}} | 特性对比</div>
</div>
  `.trim(),
};

// ============================================================================
// D-006: Ranking-List (排名列表)
// ============================================================================

export const RANKING_LIST_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "D-006",
    type: "dashboard",
    name: "排名列表",
    description: "展示排名数据的列表视图",
    useCases: ["排行榜", "Top N", "排名展示"],
    contentDensity: "high",
    visualStyle: "data-driven",
    recommendedFor: ["竞争分析", "业绩排名"],
    maxContentBlocks: 6,
    variables: ["{{TITLE}}", "{{ITEMS}}"],
    keywords: ["排名", "Top", "排行", "列表", "第一", "榜单"],
    positionFit: { opening: 0.3, middle: 0.9, closing: 0.4 },
    compatibility: {
      goodBefore: ["C-003", "A-001"],
      goodAfter: ["D-001", "D-002"],
      avoidNear: [],
    },
    tone: "analytical",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">排名数据一览</p>

  <div style="display: flex; gap: 32px; height: calc(100% - 120px);">
    <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 16px; border-left: 4px solid ${COLORS.primary};">
        <div style="width: 40px; height: 40px; background: ${COLORS.primary}; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900;">1</div>
        <div style="flex: 1;">
          <div style="font-size: 16px; font-weight: 700;">{{RANK1_NAME}}</div>
          <div style="font-size: 13px; color: #94A3B8;">{{RANK1_DESC}}</div>
        </div>
        <div style="font-size: 24px; font-weight: 900; color: ${COLORS.primary};">{{RANK1_VALUE}}</div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 16px; border-left: 4px solid ${COLORS.secondary};">
        <div style="width: 40px; height: 40px; background: ${COLORS.secondary}; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900;">2</div>
        <div style="flex: 1;">
          <div style="font-size: 16px; font-weight: 700;">{{RANK2_NAME}}</div>
          <div style="font-size: 13px; color: #94A3B8;">{{RANK2_DESC}}</div>
        </div>
        <div style="font-size: 24px; font-weight: 900; color: ${COLORS.secondary};">{{RANK2_VALUE}}</div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 16px; border-left: 4px solid ${COLORS.success};">
        <div style="width: 40px; height: 40px; background: ${COLORS.success}; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900;">3</div>
        <div style="flex: 1;">
          <div style="font-size: 16px; font-weight: 700;">{{RANK3_NAME}}</div>
          <div style="font-size: 13px; color: #94A3B8;">{{RANK3_DESC}}</div>
        </div>
        <div style="font-size: 24px; font-weight: 900; color: ${COLORS.success};">{{RANK3_VALUE}}</div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 16px; border-left: 4px solid #64748B;">
        <div style="width: 40px; height: 40px; background: #475569; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900;">4</div>
        <div style="flex: 1;">
          <div style="font-size: 16px; font-weight: 700;">{{RANK4_NAME}}</div>
          <div style="font-size: 13px; color: #94A3B8;">{{RANK4_DESC}}</div>
        </div>
        <div style="font-size: 24px; font-weight: 900; color: #94A3B8;">{{RANK4_VALUE}}</div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 16px; border-left: 4px solid #64748B;">
        <div style="width: 40px; height: 40px; background: #475569; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 900;">5</div>
        <div style="flex: 1;">
          <div style="font-size: 16px; font-weight: 700;">{{RANK5_NAME}}</div>
          <div style="font-size: 13px; color: #94A3B8;">{{RANK5_DESC}}</div>
        </div>
        <div style="font-size: 24px; font-weight: 900; color: #94A3B8;">{{RANK5_VALUE}}</div>
      </div>
    </div>

    <div style="flex: 0 0 280px; ${CARD_STYLE} display: flex; flex-direction: column; justify-content: center; background: rgba(212, 175, 55, 0.1); border-color: rgba(212, 175, 55, 0.3);">
      <div style="font-size: 14px; color: ${COLORS.primary}; font-weight: 600; margin-bottom: 16px;">榜单洞察</div>
      <p style="font-size: 14px; color: #F8FAFC; margin: 0 0 16px 0; line-height: 1.6;">{{INSIGHT}}</p>
      <div style="padding-top: 16px; border-top: 1px solid rgba(212, 175, 55, 0.3);">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">数据截止</div>
        <div style="font-size: 14px; font-weight: 600;">{{DATE}}</div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">{{TITLE}}</div>
</div>
  `.trim(),
};

// ============================================================================
// Export All Data Templates
// ============================================================================

export const DATA_TEMPLATES: SlideTemplate[] = [
  BIG_NUMBER_TEMPLATE,
  DASHBOARD_4KPI_TEMPLATE,
  TREND_CHART_TEMPLATE,
  COMPARISON_DUAL_TEMPLATE,
  COMPARISON_TABLE_TEMPLATE,
  RANKING_LIST_TEMPLATE,
];
