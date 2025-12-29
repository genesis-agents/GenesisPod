/**
 * Slides Engine v3.0 - Professional HTML Templates
 *
 * 专业 HTML 模板库，为 15 种页面类型提供高质量参考模板
 * 所有模板遵循 Genspark 设计系统规范
 */

import { PageTemplateType } from "../checkpoint/checkpoint.types";

// ============================================================================
// Template Interface
// ============================================================================

export interface SlideTemplate {
  type: PageTemplateType;
  name: string;
  description: string;
  html: string;
  variables: string[]; // 可替换的变量列表
}

// ============================================================================
// Common Styles
// ============================================================================

const COMMON_CONTAINER = `
  width: 1280px;
  height: 720px;
  background: linear-gradient(135deg, #0F172A 0%, #1E293B 100%);
  font-family: 'Noto Sans SC', sans-serif;
  color: #F8FAFC;
  padding: 50px 80px 80px 80px;
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
`;

const CARD_STYLE = `
  background: rgba(30, 41, 59, 0.8);
  border: 1px solid #334155;
  border-radius: 12px;
  padding: 24px;
`;

const STAT_LARGE = `
  font-size: 56px;
  font-weight: 900;
  color: #D4AF37;
  line-height: 1;
`;

const FOOTER_STYLE = `
  position: absolute;
  bottom: 24px;
  left: 80px;
  right: 80px;
  font-size: 12px;
  color: #64748B;
`;

// ============================================================================
// Template: Cover (封面)
// ============================================================================

export const COVER_TEMPLATE: SlideTemplate = {
  type: "cover",
  name: "封面页",
  description: "演示文稿的首页，包含标题、副标题和装饰元素",
  variables: ["{{TITLE}}", "{{SUBTITLE}}", "{{AUTHOR}}", "{{DATE}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <!-- 装饰元素 -->
  <div style="position: absolute; top: -100px; right: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(212, 175, 55, 0.1) 0%, transparent 70%); border-radius: 50%;"></div>
  <div style="position: absolute; bottom: -50px; left: -50px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%); border-radius: 50%;"></div>

  <!-- 主内容区 -->
  <div style="display: flex; flex-direction: column; justify-content: center; height: 100%; position: relative; z-index: 1;">
    <!-- 顶部装饰线 -->
    <div style="width: 80px; height: 4px; background: linear-gradient(90deg, #D4AF37 0%, #3B82F6 100%); margin-bottom: 32px;"></div>

    <!-- 标题 -->
    <h1 style="font-size: 52px; font-weight: 900; margin: 0 0 16px 0; line-height: 1.2;">{{TITLE}}</h1>

    <!-- 副标题 -->
    <p style="font-size: 24px; color: #94A3B8; margin: 0 0 48px 0; max-width: 70%;">{{SUBTITLE}}</p>

    <!-- 元信息 -->
    <div style="display: flex; gap: 32px; margin-top: auto;">
      <div>
        <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">演示者</div>
        <div style="font-size: 16px; font-weight: 500;">{{AUTHOR}}</div>
      </div>
      <div>
        <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">日期</div>
        <div style="font-size: 16px; font-weight: 500;">{{DATE}}</div>
      </div>
    </div>
  </div>

  <!-- 底部装饰 -->
  <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, #D4AF37, #3B82F6, #10B981);"></div>
</div>
  `.trim(),
};

// ============================================================================
// Template: TOC (目录)
// ============================================================================

export const TOC_TEMPLATE: SlideTemplate = {
  type: "toc",
  name: "目录页",
  description: "展示演示文稿的内容结构和章节",
  variables: ["{{TITLE}}", "{{CHAPTERS}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">内容概览</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 40px 0;">{{TITLE}}</p>

  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px;">
    <!-- 章节卡片 1 -->
    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
      <div style="flex-shrink: 0; width: 48px; height: 48px; background: linear-gradient(135deg, #D4AF37, #B8962E); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900;">01</div>
      <div>
        <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">市场背景分析</h3>
        <p style="font-size: 14px; color: #94A3B8; margin: 0;">深入了解当前市场环境和行业趋势</p>
      </div>
    </div>

    <!-- 章节卡片 2 -->
    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
      <div style="flex-shrink: 0; width: 48px; height: 48px; background: linear-gradient(135deg, #3B82F6, #2563EB); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900;">02</div>
      <div>
        <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">核心策略方案</h3>
        <p style="font-size: 14px; color: #94A3B8; margin: 0;">详细阐述解决方案和实施策略</p>
      </div>
    </div>

    <!-- 章节卡片 3 -->
    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
      <div style="flex-shrink: 0; width: 48px; height: 48px; background: linear-gradient(135deg, #10B981, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900;">03</div>
      <div>
        <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">实施路线图</h3>
        <p style="font-size: 14px; color: #94A3B8; margin: 0;">明确时间节点和关键里程碑</p>
      </div>
    </div>

    <!-- 章节卡片 4 -->
    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
      <div style="flex-shrink: 0; width: 48px; height: 48px; background: linear-gradient(135deg, #8B5CF6, #7C3AED); border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900;">04</div>
      <div>
        <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">预期成果展望</h3>
        <p style="font-size: 14px; color: #94A3B8; margin: 0;">量化目标和投资回报分析</p>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">{{TITLE}} | 内容概览</div>
</div>
  `.trim(),
};

// ============================================================================
// Template: Dashboard (数据仪表盘)
// ============================================================================

export const DASHBOARD_TEMPLATE: SlideTemplate = {
  type: "dashboard",
  name: "数据仪表盘",
  description: "展示多个关键指标和数据的综合视图",
  variables: [
    "{{TITLE}}",
    "{{STAT1_VALUE}}",
    "{{STAT1_LABEL}}",
    "{{STAT2_VALUE}}",
    "{{STAT2_LABEL}}",
    "{{STAT3_VALUE}}",
    "{{STAT3_LABEL}}",
  ],
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">关键业务指标一览</p>

  <div style="display: flex; gap: 24px; height: calc(100% - 120px);">
    <!-- 左侧大数据卡片 -->
    <div style="flex: 0 0 320px; ${CARD_STYLE} display: flex; flex-direction: column; justify-content: center;">
      <div style="${STAT_LARGE}">{{STAT1_VALUE}}</div>
      <div style="font-size: 18px; color: #94A3B8; margin-top: 8px;">{{STAT1_LABEL}}</div>
      <div style="display: flex; align-items: center; gap: 8px; margin-top: 16px;">
        <span style="color: #10B981; font-size: 14px;">↑ 12.5%</span>
        <span style="color: #64748B; font-size: 12px;">较上月</span>
      </div>
    </div>

    <!-- 右侧内容区 -->
    <div style="flex: 1; display: flex; flex-direction: column; gap: 24px;">
      <!-- 小数据卡片行 -->
      <div style="display: flex; gap: 24px;">
        <div style="flex: 1; ${CARD_STYLE}">
          <div style="font-size: 32px; font-weight: 900; color: #3B82F6;">{{STAT2_VALUE}}</div>
          <div style="font-size: 14px; color: #94A3B8; margin-top: 4px;">{{STAT2_LABEL}}</div>
        </div>
        <div style="flex: 1; ${CARD_STYLE}">
          <div style="font-size: 32px; font-weight: 900; color: #10B981;">{{STAT3_VALUE}}</div>
          <div style="font-size: 14px; color: #94A3B8; margin-top: 4px;">{{STAT3_LABEL}}</div>
        </div>
      </div>

      <!-- 图表区域 -->
      <div style="flex: 1; ${CARD_STYLE}">
        <div style="font-size: 14px; font-weight: 600; margin-bottom: 16px;">趋势分析</div>
        <div id="chart-dashboard" style="width: 100%; height: calc(100% - 30px);"></div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">数据更新时间: 2024年12月 | 来源: 业务数据平台</div>
</div>
<script src="https://cdn.jsdelivr.net/npm/echarts@5.4.3/dist/echarts.min.js"></script>
<script>
  var chart = echarts.init(document.getElementById('chart-dashboard'));
  chart.setOption({
    backgroundColor: 'transparent',
    textStyle: { color: '#94A3B8' },
    grid: { left: 40, right: 20, top: 20, bottom: 30 },
    xAxis: { type: 'category', data: ['1月', '2月', '3月', '4月', '5月', '6月'], axisLine: { lineStyle: { color: '#334155' } } },
    yAxis: { type: 'value', axisLine: { lineStyle: { color: '#334155' } }, splitLine: { lineStyle: { color: '#334155' } } },
    series: [{
      type: 'line',
      data: [820, 932, 901, 1234, 1290, 1430],
      smooth: true,
      lineStyle: { color: '#D4AF37', width: 3 },
      areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(212, 175, 55, 0.3)' }, { offset: 1, color: 'rgba(212, 175, 55, 0)' }] } },
      symbol: 'circle',
      symbolSize: 8,
      itemStyle: { color: '#D4AF37' }
    }]
  });
</script>
  `.trim(),
};

// ============================================================================
// Template: Comparison (对比页)
// ============================================================================

export const COMPARISON_TEMPLATE: SlideTemplate = {
  type: "comparison",
  name: "对比分析",
  description: "并排展示两个或多个选项的对比",
  variables: ["{{TITLE}}", "{{OPTION_A}}", "{{OPTION_B}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">方案对比分析</p>

  <div style="display: flex; gap: 32px; height: calc(100% - 120px);">
    <!-- 方案 A -->
    <div style="flex: 1; ${CARD_STYLE} border-color: #D4AF37;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <div style="width: 40px; height: 40px; background: #D4AF37; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900;">A</div>
        <h3 style="font-size: 20px; font-weight: 700; margin: 0;">{{OPTION_A}}</h3>
      </div>

      <div style="space-y: 16px;">
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #334155;">
          <span style="color: #10B981;">✓</span>
          <span style="font-size: 14px;">快速部署，2周内上线</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #334155;">
          <span style="color: #10B981;">✓</span>
          <span style="font-size: 14px;">成本效益高，ROI 达 250%</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #334155;">
          <span style="color: #10B981;">✓</span>
          <span style="font-size: 14px;">技术成熟，风险可控</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0;">
          <span style="color: #EF4444;">✗</span>
          <span style="font-size: 14px; color: #94A3B8;">扩展性有限</span>
        </div>
      </div>

      <div style="margin-top: auto; padding-top: 24px; border-top: 1px solid #334155;">
        <div style="font-size: 14px; color: #64748B;">预估投入</div>
        <div style="font-size: 28px; font-weight: 900; color: #D4AF37;">¥180万</div>
      </div>
    </div>

    <!-- 方案 B -->
    <div style="flex: 1; ${CARD_STYLE} border-color: #3B82F6;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
        <div style="width: 40px; height: 40px; background: #3B82F6; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: 900;">B</div>
        <h3 style="font-size: 20px; font-weight: 700; margin: 0;">{{OPTION_B}}</h3>
      </div>

      <div style="space-y: 16px;">
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #334155;">
          <span style="color: #10B981;">✓</span>
          <span style="font-size: 14px;">高度可扩展，支持百万级用户</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #334155;">
          <span style="color: #10B981;">✓</span>
          <span style="font-size: 14px;">功能全面，一站式解决</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid #334155;">
          <span style="color: #F59E0B;">△</span>
          <span style="font-size: 14px;">实施周期 6-8 周</span>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; padding: 12px 0;">
          <span style="color: #EF4444;">✗</span>
          <span style="font-size: 14px; color: #94A3B8;">初期投入较高</span>
        </div>
      </div>

      <div style="margin-top: auto; padding-top: 24px; border-top: 1px solid #334155;">
        <div style="font-size: 14px; color: #64748B;">预估投入</div>
        <div style="font-size: 28px; font-weight: 900; color: #3B82F6;">¥350万</div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">数据来源: 市场调研报告 | 更新时间: 2024年12月</div>
</div>
  `.trim(),
};

// ============================================================================
// Template: Timeline (时间线)
// ============================================================================

export const TIMELINE_TEMPLATE: SlideTemplate = {
  type: "timeline",
  name: "时间线",
  description: "展示项目或事件的时间进度",
  variables: ["{{TITLE}}", "{{MILESTONES}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 48px 0;">项目实施路线图</p>

  <!-- 时间线 -->
  <div style="position: relative; padding-top: 40px;">
    <!-- 连接线 -->
    <div style="position: absolute; top: 60px; left: 80px; right: 80px; height: 4px; background: linear-gradient(90deg, #D4AF37, #3B82F6, #10B981, #8B5CF6);"></div>

    <!-- 里程碑 -->
    <div style="display: flex; justify-content: space-between; position: relative;">
      <!-- Q1 -->
      <div style="flex: 1; text-align: center;">
        <div style="width: 24px; height: 24px; background: #D4AF37; border-radius: 50%; margin: 0 auto 16px; position: relative; z-index: 1;"></div>
        <div style="${CARD_STYLE} margin: 0 8px;">
          <div style="font-size: 14px; font-weight: 700; color: #D4AF37; margin-bottom: 8px;">Q1 2025</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">需求分析</div>
          <ul style="font-size: 12px; color: #94A3B8; margin: 0; padding-left: 16px; text-align: left;">
            <li>用户调研</li>
            <li>竞品分析</li>
            <li>需求文档</li>
          </ul>
        </div>
      </div>

      <!-- Q2 -->
      <div style="flex: 1; text-align: center;">
        <div style="width: 24px; height: 24px; background: #3B82F6; border-radius: 50%; margin: 0 auto 16px; position: relative; z-index: 1;"></div>
        <div style="${CARD_STYLE} margin: 0 8px;">
          <div style="font-size: 14px; font-weight: 700; color: #3B82F6; margin-bottom: 8px;">Q2 2025</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">设计开发</div>
          <ul style="font-size: 12px; color: #94A3B8; margin: 0; padding-left: 16px; text-align: left;">
            <li>UI/UX 设计</li>
            <li>核心功能开发</li>
            <li>单元测试</li>
          </ul>
        </div>
      </div>

      <!-- Q3 -->
      <div style="flex: 1; text-align: center;">
        <div style="width: 24px; height: 24px; background: #10B981; border-radius: 50%; margin: 0 auto 16px; position: relative; z-index: 1;"></div>
        <div style="${CARD_STYLE} margin: 0 8px;">
          <div style="font-size: 14px; font-weight: 700; color: #10B981; margin-bottom: 8px;">Q3 2025</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">测试上线</div>
          <ul style="font-size: 12px; color: #94A3B8; margin: 0; padding-left: 16px; text-align: left;">
            <li>集成测试</li>
            <li>灰度发布</li>
            <li>正式上线</li>
          </ul>
        </div>
      </div>

      <!-- Q4 -->
      <div style="flex: 1; text-align: center;">
        <div style="width: 24px; height: 24px; background: #8B5CF6; border-radius: 50%; margin: 0 auto 16px; position: relative; z-index: 1;"></div>
        <div style="${CARD_STYLE} margin: 0 8px;">
          <div style="font-size: 14px; font-weight: 700; color: #8B5CF6; margin-bottom: 8px;">Q4 2025</div>
          <div style="font-size: 16px; font-weight: 600; margin-bottom: 8px;">优化迭代</div>
          <ul style="font-size: 12px; color: #94A3B8; margin: 0; padding-left: 16px; text-align: left;">
            <li>用户反馈</li>
            <li>功能优化</li>
            <li>性能提升</li>
          </ul>
        </div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">项目周期: 2025年全年 | 预计总投入: 500人天</div>
</div>
  `.trim(),
};

// ============================================================================
// Template: Pillars (支柱页)
// ============================================================================

export const PILLARS_TEMPLATE: SlideTemplate = {
  type: "pillars",
  name: "核心支柱",
  description: "展示战略的核心支撑要素",
  variables: ["{{TITLE}}", "{{PILLARS}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <div style="text-align: center; margin-bottom: 40px;">
    <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
    <p style="font-size: 18px; color: #94A3B8; margin: 0;">驱动业务增长的四大核心支柱</p>
  </div>

  <div style="display: flex; gap: 24px; height: calc(100% - 180px);">
    <!-- 支柱 1 -->
    <div style="flex: 1; ${CARD_STYLE} display: flex; flex-direction: column; border-top: 4px solid #D4AF37;">
      <div style="width: 56px; height: 56px; background: linear-gradient(135deg, rgba(212, 175, 55, 0.2), rgba(212, 175, 55, 0.1)); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <span style="font-size: 24px;">🎯</span>
      </div>
      <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0; color: #D4AF37;">战略聚焦</h3>
      <p style="font-size: 14px; color: #94A3B8; margin: 0; flex: 1;">明确核心业务方向，集中资源突破关键领域，实现差异化竞争优势</p>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #334155;">
        <div style="font-size: 24px; font-weight: 900; color: #D4AF37;">35%</div>
        <div style="font-size: 12px; color: #64748B;">市场份额目标</div>
      </div>
    </div>

    <!-- 支柱 2 -->
    <div style="flex: 1; ${CARD_STYLE} display: flex; flex-direction: column; border-top: 4px solid #3B82F6;">
      <div style="width: 56px; height: 56px; background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(59, 130, 246, 0.1)); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <span style="font-size: 24px;">⚡</span>
      </div>
      <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0; color: #3B82F6;">技术创新</h3>
      <p style="font-size: 14px; color: #94A3B8; margin: 0; flex: 1;">持续投入研发，应用前沿技术，构建技术壁垒和产品护城河</p>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #334155;">
        <div style="font-size: 24px; font-weight: 900; color: #3B82F6;">¥2亿</div>
        <div style="font-size: 12px; color: #64748B;">年度研发投入</div>
      </div>
    </div>

    <!-- 支柱 3 -->
    <div style="flex: 1; ${CARD_STYLE} display: flex; flex-direction: column; border-top: 4px solid #10B981;">
      <div style="width: 56px; height: 56px; background: linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(16, 185, 129, 0.1)); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <span style="font-size: 24px;">👥</span>
      </div>
      <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0; color: #10B981;">人才发展</h3>
      <p style="font-size: 14px; color: #94A3B8; margin: 0; flex: 1;">吸引顶尖人才，建设学习型组织，打造高效协作的精英团队</p>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #334155;">
        <div style="font-size: 24px; font-weight: 900; color: #10B981;">500+</div>
        <div style="font-size: 12px; color: #64748B;">核心人才储备</div>
      </div>
    </div>

    <!-- 支柱 4 -->
    <div style="flex: 1; ${CARD_STYLE} display: flex; flex-direction: column; border-top: 4px solid #8B5CF6;">
      <div style="width: 56px; height: 56px; background: linear-gradient(135deg, rgba(139, 92, 246, 0.2), rgba(139, 92, 246, 0.1)); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
        <span style="font-size: 24px;">🌐</span>
      </div>
      <h3 style="font-size: 18px; font-weight: 700; margin: 0 0 12px 0; color: #8B5CF6;">生态共建</h3>
      <p style="font-size: 14px; color: #94A3B8; margin: 0; flex: 1;">构建开放生态，与合作伙伴共同成长，实现多方共赢的商业模式</p>
      <div style="margin-top: 16px; padding-top: 16px; border-top: 1px solid #334155;">
        <div style="font-size: 24px; font-weight: 900; color: #8B5CF6;">120+</div>
        <div style="font-size: 12px; color: #64748B;">生态合作伙伴</div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">战略规划期: 2025-2027 | 版本: V2.0</div>
</div>
  `.trim(),
};

// ============================================================================
// Template: Split Layout (分栏布局)
// ============================================================================

export const SPLIT_LAYOUT_TEMPLATE: SlideTemplate = {
  type: "splitLayout",
  name: "分栏布局",
  description: "左右分栏展示数据和内容",
  variables: ["{{TITLE}}", "{{STAT_VALUE}}", "{{STAT_LABEL}}", "{{POINTS}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">数据驱动的决策支持</p>

  <div style="display: flex; gap: 40px; height: calc(100% - 120px);">
    <!-- 左侧数据区 -->
    <div style="flex: 0 0 40%; display: flex; flex-direction: column; justify-content: center;">
      <div style="${CARD_STYLE} text-align: center; padding: 48px 32px;">
        <div style="${STAT_LARGE} font-size: 72px;">{{STAT_VALUE}}</div>
        <div style="font-size: 20px; color: #94A3B8; margin-top: 12px;">{{STAT_LABEL}}</div>
        <div style="display: flex; justify-content: center; gap: 24px; margin-top: 24px;">
          <div>
            <div style="font-size: 24px; font-weight: 700; color: #10B981;">+23%</div>
            <div style="font-size: 12px; color: #64748B;">同比增长</div>
          </div>
          <div style="width: 1px; background: #334155;"></div>
          <div>
            <div style="font-size: 24px; font-weight: 700; color: #3B82F6;">Top 3</div>
            <div style="font-size: 12px; color: #64748B;">行业排名</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 右侧要点区 -->
    <div style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
      <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
        <div style="width: 32px; height: 32px; background: #D4AF37; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span style="font-size: 14px; font-weight: 900;">1</span>
        </div>
        <div>
          <h4 style="font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">用户增长强劲</h4>
          <p style="font-size: 14px; color: #94A3B8; margin: 0;">月活跃用户突破 500 万，日均使用时长达 45 分钟，用户留存率持续提升</p>
        </div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
        <div style="width: 32px; height: 32px; background: #3B82F6; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span style="font-size: 14px; font-weight: 900;">2</span>
        </div>
        <div>
          <h4 style="font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">商业化进展顺利</h4>
          <p style="font-size: 14px; color: #94A3B8; margin: 0;">付费转化率达 8.5%，ARPU 提升 32%，企业客户数量翻番</p>
        </div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
        <div style="width: 32px; height: 32px; background: #10B981; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span style="font-size: 14px; font-weight: 900;">3</span>
        </div>
        <div>
          <h4 style="font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">技术壁垒稳固</h4>
          <p style="font-size: 14px; color: #94A3B8; margin: 0;">核心算法性能领先竞品 40%，申请专利 28 项，技术团队扩充至 200 人</p>
        </div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px;">
        <div style="width: 32px; height: 32px; background: #8B5CF6; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span style="font-size: 14px; font-weight: 900;">4</span>
        </div>
        <div>
          <h4 style="font-size: 16px; font-weight: 600; margin: 0 0 8px 0;">市场拓展加速</h4>
          <p style="font-size: 14px; color: #94A3B8; margin: 0;">新进入 5 个区域市场，建立 50+ 渠道合作，品牌知名度提升显著</p>
        </div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">数据截至: 2024年12月 | 来源: 内部业务报告</div>
</div>
  `.trim(),
};

// ============================================================================
// Template: Recommendations (建议页)
// ============================================================================

export const RECOMMENDATIONS_TEMPLATE: SlideTemplate = {
  type: "recommendations",
  name: "建议与行动",
  description: "展示核心建议和下一步行动",
  variables: ["{{TITLE}}", "{{RECOMMENDATIONS}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">基于分析的核心建议与行动计划</p>

  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; height: calc(100% - 120px);">
    <!-- 立即行动 -->
    <div style="${CARD_STYLE} border-left: 4px solid #EF4444;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(239, 68, 68, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: #EF4444; font-size: 20px;">🔥</span>
        </div>
        <div>
          <div style="font-size: 12px; color: #EF4444; font-weight: 600;">紧急</div>
          <div style="font-size: 16px; font-weight: 700;">立即行动</div>
        </div>
      </div>
      <div style="space-y: 12px;">
        <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">优化核心转化流程</div>
          <div style="color: #94A3B8; font-size: 12px;">预期提升转化率 15%</div>
        </div>
        <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">修复关键性能瓶颈</div>
          <div style="color: #94A3B8; font-size: 12px;">影响 30% 用户体验</div>
        </div>
      </div>
    </div>

    <!-- 短期规划 -->
    <div style="${CARD_STYLE} border-left: 4px solid #F59E0B;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(245, 158, 11, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: #F59E0B; font-size: 20px;">📋</span>
        </div>
        <div>
          <div style="font-size: 12px; color: #F59E0B; font-weight: 600;">1-3 个月</div>
          <div style="font-size: 16px; font-weight: 700;">短期规划</div>
        </div>
      </div>
      <div style="space-y: 12px;">
        <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">启动用户调研计划</div>
          <div style="color: #94A3B8; font-size: 12px;">深度访谈 100+ 用户</div>
        </div>
        <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">搭建数据监控体系</div>
          <div style="color: #94A3B8; font-size: 12px;">实时追踪核心指标</div>
        </div>
        <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">完善团队配置</div>
          <div style="color: #94A3B8; font-size: 12px;">招聘 5 名核心岗位</div>
        </div>
      </div>
    </div>

    <!-- 长期战略 -->
    <div style="${CARD_STYLE} border-left: 4px solid #10B981;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(16, 185, 129, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: #10B981; font-size: 20px;">🎯</span>
        </div>
        <div>
          <div style="font-size: 12px; color: #10B981; font-weight: 600;">6-12 个月</div>
          <div style="font-size: 16px; font-weight: 700;">长期战略</div>
        </div>
      </div>
      <div style="space-y: 12px;">
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">拓展海外市场</div>
          <div style="color: #94A3B8; font-size: 12px;">首批进入东南亚</div>
        </div>
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">构建技术生态</div>
          <div style="color: #94A3B8; font-size: 12px;">开放 API 平台</div>
        </div>
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">探索新业务线</div>
          <div style="color: #94A3B8; font-size: 12px;">孵化 2-3 个创新项目</div>
        </div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">战略规划 | 执行负责人: 产品团队</div>
</div>
  `.trim(),
};

// ============================================================================
// Template: Questions (问题页)
// ============================================================================

export const QUESTIONS_TEMPLATE: SlideTemplate = {
  type: "questions",
  name: "核心问题",
  description: "提出关键问题引发思考",
  variables: ["{{TITLE}}", "{{QUESTIONS}}"],
  html: `
<div style="${COMMON_CONTAINER}">
  <div style="display: flex; flex-direction: column; justify-content: center; height: 100%;">
    <div style="text-align: center; margin-bottom: 48px;">
      <div style="font-size: 14px; color: #D4AF37; font-weight: 600; margin-bottom: 8px;">核心议题</div>
      <h1 style="font-size: 42px; font-weight: 900; margin: 0;">我们需要思考的关键问题</h1>
    </div>

    <div style="display: flex; flex-direction: column; gap: 24px; max-width: 900px; margin: 0 auto;">
      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 20px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #D4AF37, #B8962E); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">?</div>
        <div style="font-size: 18px; font-weight: 500;">如何在保持增长的同时提升盈利能力？</div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 20px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #3B82F6, #2563EB); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">?</div>
        <div style="font-size: 18px; font-weight: 500;">面对日益激烈的竞争，我们的核心壁垒是什么？</div>
      </div>

      <div style="${CARD_STYLE} display: flex; align-items: center; gap: 20px;">
        <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #10B981, #059669); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; flex-shrink: 0;">?</div>
        <div style="font-size: 18px; font-weight: 500;">未来 3 年，最大的机会和风险分别是什么？</div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">战略研讨会 | 开放讨论环节</div>
</div>
  `.trim(),
};

// ============================================================================
// Export All Templates
// ============================================================================

export const TEMPLATES: Record<PageTemplateType, SlideTemplate> = {
  cover: COVER_TEMPLATE,
  toc: TOC_TEMPLATE,
  questions: QUESTIONS_TEMPLATE,
  pillars: PILLARS_TEMPLATE,
  framework: PILLARS_TEMPLATE, // 复用支柱模板
  timeline: TIMELINE_TEMPLATE,
  evolutionRoadmap: TIMELINE_TEMPLATE, // 复用时间线模板
  dashboard: DASHBOARD_TEMPLATE,
  comparison: COMPARISON_TEMPLATE,
  splitLayout: SPLIT_LAYOUT_TEMPLATE,
  caseStudy: SPLIT_LAYOUT_TEMPLATE, // 复用分栏模板
  multiColumn: PILLARS_TEMPLATE, // 复用支柱模板
  recommendations: RECOMMENDATIONS_TEMPLATE,
  maturityModel: PILLARS_TEMPLATE, // 复用支柱模板
  riskOpportunity: COMPARISON_TEMPLATE, // 复用对比模板
};

/**
 * 获取指定类型的模板
 */
export function getTemplate(type: PageTemplateType): SlideTemplate {
  return TEMPLATES[type] || SPLIT_LAYOUT_TEMPLATE;
}

/**
 * 获取所有模板类型
 */
export function getTemplateTypes(): PageTemplateType[] {
  return Object.keys(TEMPLATES) as PageTemplateType[];
}

/**
 * 替换模板变量
 */
export function applyTemplateVariables(
  template: SlideTemplate,
  variables: Record<string, string>,
): string {
  let html = template.html;
  for (const [key, value] of Object.entries(variables)) {
    html = html.replace(new RegExp(key, "g"), value);
  }
  return html;
}
