import { Injectable } from "@nestjs/common";

export interface PlanningTemplate {
  id: string;
  name: string;
  description: string;
  icon: string;
  defaultGoalPrompt: string;
  phasePrompts: Record<number, string>;
}

const PLANNING_TEMPLATES: PlanningTemplate[] = [
  {
    id: "general",
    name: "通用策划",
    description: "适用于各类策划场景的通用模板",
    icon: "target",
    defaultGoalPrompt: "请分析以下策划目标，拆解为可执行的方案：",
    phasePrompts: {
      1: "分析策划目标，识别关键需求、约束条件和成功标准。",
      2: "围绕策划目标进行调研，收集相关数据、案例和行业趋势。",
      3: "基于调研结果，进行头脑风暴，提出多种可行方案。",
      4: "对各方案进行辩论评估，分析优劣势和风险。",
      5: "综合辩论结论，整合最优方案，形成完整策划。",
      6: "输出最终策划文档，包含执行计划和关键里程碑。",
    },
  },
  {
    id: "marketing",
    name: "营销策划",
    description: "品牌推广、活动策划、内容营销",
    icon: "megaphone",
    defaultGoalPrompt: "请分析以下营销目标，制定完整营销方案：",
    phasePrompts: {
      1: "分析营销目标，明确目标受众、预算和KPI。",
      2: "调研目标市场、竞品策略和用户画像。",
      3: "头脑风暴营销创意和渠道组合方案。",
      4: "评估各方案的ROI、可行性和风险。",
      5: "综合形成完整营销策划方案。",
      6: "输出营销方案文档，含预算分配、时间表和效果预估。",
    },
  },
  {
    id: "product",
    name: "产品策划",
    description: "产品规划、功能设计、用户研究",
    icon: "box",
    defaultGoalPrompt: "请分析以下产品目标，制定产品策划方案：",
    phasePrompts: {
      1: "分析产品目标，明确用户需求和商业目标。",
      2: "调研竞品、用户反馈和技术可行性。",
      3: "头脑风暴产品功能和用户体验方案。",
      4: "评估各方案的技术成本、用户价值和市场潜力。",
      5: "综合形成产品规划方案。",
      6: "输出产品策划文档，含功能列表、优先级排序和路线图。",
    },
  },
  {
    id: "event",
    name: "活动策划",
    description: "线上线下活动方案、执行计划",
    icon: "calendar",
    defaultGoalPrompt: "请分析以下活动目标，制定活动策划方案：",
    phasePrompts: {
      1: "分析活动目标，明确规模、预算和预期效果。",
      2: "调研场地、供应商、参考案例和潜在风险。",
      3: "头脑风暴活动形式、主题和互动环节。",
      4: "评估各方案的可行性、成本和预期效果。",
      5: "综合形成完整活动方案。",
      6: "输出活动策划文档，含时间表、责任分工和应急预案。",
    },
  },
];

@Injectable()
export class PlanningTemplateService {
  getTemplates(): PlanningTemplate[] {
    return PLANNING_TEMPLATES;
  }

  getTemplate(templateId: string): PlanningTemplate | undefined {
    return PLANNING_TEMPLATES.find((t) => t.id === templateId);
  }

  getDefaultTemplate(): PlanningTemplate {
    return PLANNING_TEMPLATES[0];
  }
}
