/**
 * Slides Engine v3.0 - Action Templates
 *
 * 行动型模板 (5个)：用于结尾、建议和号召行动
 * A-001 ~ A-005
 */

import { SlideTemplate } from "../base/template-registry";
import {
  COMMON_CONTAINER,
  CARD_STYLE,
  FOOTER_STYLE,
  COLORS,
} from "../base/common-styles";

// ============================================================================
// A-001: Recommendations-3Col (三列建议)
// ============================================================================

export const RECOMMENDATIONS_3COL_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "A-001",
    type: "recommendations",
    name: "三列建议",
    description: "三列式建议展示，按紧急程度分类",
    useCases: ["建议", "行动计划", "下一步"],
    contentDensity: "high",
    visualStyle: "professional",
    recommendedFor: ["结论建议", "行动规划"],
    maxContentBlocks: 9,
    variables: ["{{TITLE}}", "{{RECOMMENDATIONS}}"],
    keywords: ["建议", "行动", "下一步", "计划", "措施"],
    positionFit: { opening: 0.2, middle: 0.6, closing: 0.95 },
    compatibility: {
      goodBefore: ["A-004", "A-005"],
      goodAfter: ["D-004", "C-007"],
      avoidNear: ["A-002"],
    },
    tone: "inspiring",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">基于分析的核心建议与行动计划</p>

  <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; height: calc(100% - 120px);">
    <div style="${CARD_STYLE} border-left: 4px solid ${COLORS.danger}; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(239, 68, 68, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: ${COLORS.danger}; font-size: 20px;">🔥</span>
        </div>
        <div>
          <div style="font-size: 12px; color: ${COLORS.danger}; font-weight: 600;">紧急</div>
          <div style="font-size: 16px; font-weight: 700;">立即行动</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
        <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{URGENT1_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{URGENT1_DESC}}</div>
        </div>
        <div style="padding: 12px; background: rgba(239, 68, 68, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{URGENT2_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{URGENT2_DESC}}</div>
        </div>
      </div>
    </div>

    <div style="${CARD_STYLE} border-left: 4px solid ${COLORS.warning}; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(245, 158, 11, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: ${COLORS.warning}; font-size: 20px;">📋</span>
        </div>
        <div>
          <div style="font-size: 12px; color: ${COLORS.warning}; font-weight: 600;">1-3 个月</div>
          <div style="font-size: 16px; font-weight: 700;">短期规划</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
        <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{SHORT1_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{SHORT1_DESC}}</div>
        </div>
        <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{SHORT2_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{SHORT2_DESC}}</div>
        </div>
        <div style="padding: 12px; background: rgba(245, 158, 11, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{SHORT3_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{SHORT3_DESC}}</div>
        </div>
      </div>
    </div>

    <div style="${CARD_STYLE} border-left: 4px solid ${COLORS.success}; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(16, 185, 129, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: ${COLORS.success}; font-size: 20px;">🎯</span>
        </div>
        <div>
          <div style="font-size: 12px; color: ${COLORS.success}; font-weight: 600;">6-12 个月</div>
          <div style="font-size: 16px; font-weight: 700;">长期战略</div>
        </div>
      </div>
      <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{LONG1_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{LONG1_DESC}}</div>
        </div>
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{LONG2_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{LONG2_DESC}}</div>
        </div>
        <div style="padding: 12px; background: rgba(16, 185, 129, 0.1); border-radius: 8px; font-size: 14px;">
          <div style="font-weight: 600; margin-bottom: 4px;">{{LONG3_TITLE}}</div>
          <div style="color: #94A3B8; font-size: 12px;">{{LONG3_DESC}}</div>
        </div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">战略规划 | 执行负责人: {{OWNER}}</div>
</div>
  `.trim(),
};

// ============================================================================
// A-002: Risk-Opportunity (风险机遇)
// ============================================================================

export const RISK_OPPORTUNITY_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "A-002",
    type: "riskOpportunity",
    name: "风险机遇",
    description: "双列展示风险和机遇",
    useCases: ["风险分析", "机遇识别", "SWOT"],
    contentDensity: "high",
    visualStyle: "professional",
    recommendedFor: ["风险评估", "机会分析"],
    maxContentBlocks: 8,
    variables: ["{{TITLE}}", "{{RISKS}}", "{{OPPORTUNITIES}}"],
    keywords: ["风险", "机遇", "机会", "威胁", "SWOT"],
    positionFit: { opening: 0.3, middle: 0.8, closing: 0.7 },
    compatibility: {
      goodBefore: ["A-001", "A-003"],
      goodAfter: ["D-004", "S-003"],
      avoidNear: ["A-001"],
    },
    tone: "warning",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 32px 0;">风险与机遇全景分析</p>

  <div style="display: flex; gap: 32px; height: calc(100% - 120px);">
    <div style="flex: 1; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(239, 68, 68, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: ${COLORS.danger}; font-size: 20px;">⚠️</span>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: ${COLORS.danger};">风险因素</div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
        <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.danger};">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="padding: 2px 8px; background: ${COLORS.danger}; border-radius: 4px; font-size: 10px; font-weight: 600;">高</div>
            <div style="font-size: 15px; font-weight: 600;">{{RISK1_TITLE}}</div>
          </div>
          <p style="font-size: 13px; color: #94A3B8; margin: 0;">{{RISK1_DESC}}</p>
        </div>

        <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.warning};">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="padding: 2px 8px; background: ${COLORS.warning}; border-radius: 4px; font-size: 10px; font-weight: 600;">中</div>
            <div style="font-size: 15px; font-weight: 600;">{{RISK2_TITLE}}</div>
          </div>
          <p style="font-size: 13px; color: #94A3B8; margin: 0;">{{RISK2_DESC}}</p>
        </div>

        <div style="${CARD_STYLE} border-left: 3px solid #64748B;">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="padding: 2px 8px; background: #64748B; border-radius: 4px; font-size: 10px; font-weight: 600;">低</div>
            <div style="font-size: 15px; font-weight: 600;">{{RISK3_TITLE}}</div>
          </div>
          <p style="font-size: 13px; color: #94A3B8; margin: 0;">{{RISK3_DESC}}</p>
        </div>
      </div>
    </div>

    <div style="width: 2px; background: linear-gradient(180deg, ${COLORS.danger}, ${COLORS.success});"></div>

    <div style="flex: 1; display: flex; flex-direction: column;">
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 20px;">
        <div style="width: 40px; height: 40px; background: rgba(16, 185, 129, 0.2); border-radius: 8px; display: flex; align-items: center; justify-content: center;">
          <span style="color: ${COLORS.success}; font-size: 20px;">💡</span>
        </div>
        <div style="font-size: 18px; font-weight: 700; color: ${COLORS.success};">机遇因素</div>
      </div>

      <div style="display: flex; flex-direction: column; gap: 12px; flex: 1;">
        <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.success};">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="padding: 2px 8px; background: ${COLORS.success}; border-radius: 4px; font-size: 10px; font-weight: 600;">高</div>
            <div style="font-size: 15px; font-weight: 600;">{{OPP1_TITLE}}</div>
          </div>
          <p style="font-size: 13px; color: #94A3B8; margin: 0;">{{OPP1_DESC}}</p>
        </div>

        <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.secondary};">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="padding: 2px 8px; background: ${COLORS.secondary}; border-radius: 4px; font-size: 10px; font-weight: 600;">中</div>
            <div style="font-size: 15px; font-weight: 600;">{{OPP2_TITLE}}</div>
          </div>
          <p style="font-size: 13px; color: #94A3B8; margin: 0;">{{OPP2_DESC}}</p>
        </div>

        <div style="${CARD_STYLE} border-left: 3px solid ${COLORS.primary};">
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
            <div style="padding: 2px 8px; background: ${COLORS.primary}; border-radius: 4px; font-size: 10px; font-weight: 600;">潜在</div>
            <div style="font-size: 15px; font-weight: 600;">{{OPP3_TITLE}}</div>
          </div>
          <p style="font-size: 13px; color: #94A3B8; margin: 0;">{{OPP3_DESC}}</p>
        </div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">风险与机遇分析 | {{TITLE}}</div>
</div>
  `.trim(),
};

// ============================================================================
// A-003: Key-Conclusions (关键结论)
// ============================================================================

export const KEY_CONCLUSIONS_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "A-003",
    type: "recommendations",
    name: "关键结论",
    description: "突出展示核心结论和关键发现",
    useCases: ["核心结论", "关键发现", "总结"],
    contentDensity: "medium",
    visualStyle: "professional",
    recommendedFor: ["报告总结", "核心洞察"],
    maxContentBlocks: 4,
    variables: ["{{TITLE}}", "{{CONCLUSIONS}}"],
    keywords: ["结论", "总结", "关键", "核心", "发现", "洞察"],
    positionFit: { opening: 0.3, middle: 0.7, closing: 0.95 },
    compatibility: {
      goodBefore: ["A-001", "A-004", "A-005"],
      goodAfter: ["D-002", "C-007"],
      avoidNear: [],
    },
    tone: "analytical",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <div style="text-align: center; margin-bottom: 48px;">
    <div style="font-size: 14px; color: ${COLORS.primary}; font-weight: 600; margin-bottom: 8px;">核心洞察</div>
    <h1 style="font-size: 42px; font-weight: 900; margin: 0;">{{TITLE}}</h1>
  </div>

  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 24px; max-width: 1000px; margin: 0 auto;">
    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px; border-top: 4px solid ${COLORS.primary};">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${COLORS.primary}, #B8962E); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <span style="font-size: 20px; font-weight: 900;">1</span>
      </div>
      <div>
        <h4 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">{{CONCLUSION1_TITLE}}</h4>
        <p style="font-size: 14px; color: #94A3B8; margin: 0; line-height: 1.6;">{{CONCLUSION1_DESC}}</p>
      </div>
    </div>

    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px; border-top: 4px solid ${COLORS.secondary};">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${COLORS.secondary}, #2563EB); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <span style="font-size: 20px; font-weight: 900;">2</span>
      </div>
      <div>
        <h4 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">{{CONCLUSION2_TITLE}}</h4>
        <p style="font-size: 14px; color: #94A3B8; margin: 0; line-height: 1.6;">{{CONCLUSION2_DESC}}</p>
      </div>
    </div>

    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px; border-top: 4px solid ${COLORS.success};">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${COLORS.success}, #059669); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <span style="font-size: 20px; font-weight: 900;">3</span>
      </div>
      <div>
        <h4 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">{{CONCLUSION3_TITLE}}</h4>
        <p style="font-size: 14px; color: #94A3B8; margin: 0; line-height: 1.6;">{{CONCLUSION3_DESC}}</p>
      </div>
    </div>

    <div style="${CARD_STYLE} display: flex; align-items: flex-start; gap: 16px; border-top: 4px solid ${COLORS.purple};">
      <div style="width: 48px; height: 48px; background: linear-gradient(135deg, ${COLORS.purple}, #7C3AED); border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <span style="font-size: 20px; font-weight: 900;">4</span>
      </div>
      <div>
        <h4 style="font-size: 18px; font-weight: 700; margin: 0 0 8px 0;">{{CONCLUSION4_TITLE}}</h4>
        <p style="font-size: 14px; color: #94A3B8; margin: 0; line-height: 1.6;">{{CONCLUSION4_DESC}}</p>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">关键结论 | {{TITLE}}</div>
</div>
  `.trim(),
};

// ============================================================================
// A-004: Next-Steps (下一步)
// ============================================================================

export const NEXT_STEPS_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "A-004",
    type: "recommendations",
    name: "下一步",
    description: "清晰列出下一步行动计划",
    useCases: ["下一步", "行动计划", "待办事项"],
    contentDensity: "medium",
    visualStyle: "professional",
    recommendedFor: ["会议结尾", "行动规划"],
    maxContentBlocks: 5,
    variables: ["{{TITLE}}", "{{STEPS}}"],
    keywords: ["下一步", "行动", "计划", "TODO", "待办"],
    positionFit: { opening: 0.2, middle: 0.5, closing: 0.95 },
    compatibility: {
      goodBefore: ["A-005"],
      goodAfter: ["A-001", "A-003"],
      avoidNear: [],
    },
    tone: "inspiring",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <h1 style="font-size: 36px; font-weight: 900; margin: 0 0 8px 0;">{{TITLE}}</h1>
  <p style="font-size: 18px; color: #94A3B8; margin: 0 0 40px 0;">明确的行动路径</p>

  <div style="display: flex; gap: 32px; height: calc(100% - 140px);">
    <div style="flex: 1; display: flex; flex-direction: column; gap: 16px;">
      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="width: 48px; height: 48px; background: ${COLORS.primary}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; flex-shrink: 0;">1</div>
        <div style="flex: 1; ${CARD_STYLE}">
          <h4 style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">{{STEP1_TITLE}}</h4>
          <p style="font-size: 14px; color: #94A3B8; margin: 0;">{{STEP1_DESC}}</p>
          <div style="display: flex; gap: 16px; margin-top: 12px;">
            <div style="font-size: 12px;"><span style="color: #64748B;">负责人:</span> <span style="color: ${COLORS.primary};">{{STEP1_OWNER}}</span></div>
            <div style="font-size: 12px;"><span style="color: #64748B;">截止:</span> <span style="color: #F8FAFC;">{{STEP1_DUE}}</span></div>
          </div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="width: 48px; height: 48px; background: ${COLORS.secondary}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; flex-shrink: 0;">2</div>
        <div style="flex: 1; ${CARD_STYLE}">
          <h4 style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">{{STEP2_TITLE}}</h4>
          <p style="font-size: 14px; color: #94A3B8; margin: 0;">{{STEP2_DESC}}</p>
          <div style="display: flex; gap: 16px; margin-top: 12px;">
            <div style="font-size: 12px;"><span style="color: #64748B;">负责人:</span> <span style="color: ${COLORS.secondary};">{{STEP2_OWNER}}</span></div>
            <div style="font-size: 12px;"><span style="color: #64748B;">截止:</span> <span style="color: #F8FAFC;">{{STEP2_DUE}}</span></div>
          </div>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 16px;">
        <div style="width: 48px; height: 48px; background: ${COLORS.success}; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 900; flex-shrink: 0;">3</div>
        <div style="flex: 1; ${CARD_STYLE}">
          <h4 style="font-size: 16px; font-weight: 700; margin: 0 0 8px 0;">{{STEP3_TITLE}}</h4>
          <p style="font-size: 14px; color: #94A3B8; margin: 0;">{{STEP3_DESC}}</p>
          <div style="display: flex; gap: 16px; margin-top: 12px;">
            <div style="font-size: 12px;"><span style="color: #64748B;">负责人:</span> <span style="color: ${COLORS.success};">{{STEP3_OWNER}}</span></div>
            <div style="font-size: 12px;"><span style="color: #64748B;">截止:</span> <span style="color: #F8FAFC;">{{STEP3_DUE}}</span></div>
          </div>
        </div>
      </div>
    </div>

    <div style="flex: 0 0 280px; ${CARD_STYLE} display: flex; flex-direction: column; background: rgba(212, 175, 55, 0.1); border-color: rgba(212, 175, 55, 0.3);">
      <div style="font-size: 14px; color: ${COLORS.primary}; font-weight: 600; margin-bottom: 16px;">关键里程碑</div>

      <div style="flex: 1; display: flex; flex-direction: column; gap: 12px;">
        <div style="padding: 12px; background: rgba(30, 41, 59, 0.5); border-radius: 8px;">
          <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">{{MILESTONE1_DATE}}</div>
          <div style="font-size: 14px; font-weight: 600;">{{MILESTONE1_TITLE}}</div>
        </div>
        <div style="padding: 12px; background: rgba(30, 41, 59, 0.5); border-radius: 8px;">
          <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">{{MILESTONE2_DATE}}</div>
          <div style="font-size: 14px; font-weight: 600;">{{MILESTONE2_TITLE}}</div>
        </div>
        <div style="padding: 12px; background: rgba(30, 41, 59, 0.5); border-radius: 8px;">
          <div style="font-size: 12px; color: #64748B; margin-bottom: 4px;">{{MILESTONE3_DATE}}</div>
          <div style="font-size: 14px; font-weight: 600;">{{MILESTONE3_TITLE}}</div>
        </div>
      </div>
    </div>
  </div>

  <div style="${FOOTER_STYLE}">行动计划 | {{TITLE}}</div>
</div>
  `.trim(),
};

// ============================================================================
// A-005: Thank-You (感谢页)
// ============================================================================

export const THANK_YOU_TEMPLATE: SlideTemplate = {
  metadata: {
    id: "A-005",
    type: "cover",
    name: "感谢页",
    description: "演示结尾的感谢页",
    useCases: ["结尾", "感谢", "联系方式"],
    contentDensity: "low",
    visualStyle: "professional",
    recommendedFor: ["演示结尾", "致谢"],
    maxContentBlocks: 3,
    variables: ["{{TITLE}}", "{{CONTACT}}"],
    keywords: ["感谢", "谢谢", "Thank", "结尾", "联系"],
    positionFit: { opening: 0.0, middle: 0.0, closing: 1.0 },
    compatibility: {
      goodBefore: [],
      goodAfter: ["A-001", "A-003", "A-004"],
      avoidNear: ["N-001"],
    },
    tone: "positive",
  },
  html: `
<div style="${COMMON_CONTAINER}">
  <div style="position: absolute; top: -100px; right: -100px; width: 400px; height: 400px; background: radial-gradient(circle, rgba(212, 175, 55, 0.1) 0%, transparent 70%); border-radius: 50%;"></div>
  <div style="position: absolute; bottom: -50px; left: -50px; width: 300px; height: 300px; background: radial-gradient(circle, rgba(59, 130, 246, 0.1) 0%, transparent 70%); border-radius: 50%;"></div>

  <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; text-align: center; position: relative; z-index: 1;">
    <div style="width: 80px; height: 4px; background: linear-gradient(90deg, ${COLORS.primary} 0%, ${COLORS.secondary} 100%); margin-bottom: 32px;"></div>

    <h1 style="font-size: 64px; font-weight: 900; margin: 0 0 16px 0;">感谢聆听</h1>
    <p style="font-size: 24px; color: #94A3B8; margin: 0 0 48px 0;">{{SUBTITLE}}</p>

    <div style="${CARD_STYLE} display: inline-flex; gap: 48px; padding: 32px 48px;">
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">演示者</div>
        <div style="font-size: 18px; font-weight: 600;">{{PRESENTER}}</div>
      </div>
      <div style="width: 1px; background: #334155;"></div>
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">邮箱</div>
        <div style="font-size: 18px; font-weight: 600; color: ${COLORS.primary};">{{EMAIL}}</div>
      </div>
      <div style="width: 1px; background: #334155;"></div>
      <div style="text-align: center;">
        <div style="font-size: 12px; color: #64748B; margin-bottom: 8px;">日期</div>
        <div style="font-size: 18px; font-weight: 600;">{{DATE}}</div>
      </div>
    </div>

    <div style="margin-top: 48px;">
      <p style="font-size: 14px; color: #64748B;">{{COMPANY}}</p>
    </div>
  </div>

  <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 4px; background: linear-gradient(90deg, ${COLORS.primary}, ${COLORS.secondary}, ${COLORS.success});"></div>
</div>
  `.trim(),
};

// ============================================================================
// Export All Action Templates
// ============================================================================

export const ACTION_TEMPLATES: SlideTemplate[] = [
  RECOMMENDATIONS_3COL_TEMPLATE,
  RISK_OPPORTUNITY_TEMPLATE,
  KEY_CONCLUSIONS_TEMPLATE,
  NEXT_STEPS_TEMPLATE,
  THANK_YOU_TEMPLATE,
];
