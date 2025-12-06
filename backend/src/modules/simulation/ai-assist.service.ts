import { Injectable, Logger } from "@nestjs/common";
import { ExternalDataService } from "./external-data.service";

interface IndustryAnalysis {
  companies: Array<{
    name: string;
    type: string;
    market: string;
    reason: string;
  }>;
  agents: Array<{
    role: string;
    team: "BLUE" | "RED" | "GREEN" | "CHAOS";
    reason: string;
  }>;
  goals: {
    targetShare: string;
    risk: string;
    growth: string;
  };
  insights: string[];
}

// 行业知识库 - 基于PRD的AI算力基础设施行业
const INDUSTRY_KNOWLEDGE: Record<string, IndustryAnalysis> = {
  "AI Compute Infrastructure": {
    companies: [
      {
        name: "NVIDIA",
        type: "benchmark",
        market: "Global",
        reason: "GPU市场绝对领导者，数据中心芯片占主导",
      },
      {
        name: "AMD",
        type: "challenger",
        market: "Global",
        reason: "MI300系列挑战NVIDIA，性价比优势",
      },
      {
        name: "Intel",
        type: "regional",
        market: "US",
        reason: "Gaudi系列AI加速器，传统CPU厂商转型",
      },
      {
        name: "华为昇腾",
        type: "regional",
        market: "China",
        reason: "国产替代主力，受出口管制影响",
      },
      {
        name: "寒武纪",
        type: "startup",
        market: "China",
        reason: "国产AI芯片新势力，聚焦推理芯片",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "战略决策者，平衡增长与风险" },
      { role: "CFO", team: "BLUE", reason: "财务把控，现金流管理" },
      { role: "CEO", team: "RED", reason: "竞争对手决策者" },
      { role: "销售VP", team: "RED", reason: "市场抢夺执行者" },
      { role: "监管官员", team: "GREEN", reason: "出口管制、反垄断审查" },
      { role: "行业分析师", team: "GREEN", reason: "市场舆情、评级影响" },
      { role: "黑天鹅事件", team: "CHAOS", reason: "供应链中断、政策突变" },
    ],
    goals: {
      targetShare: "守住现有份额，寻找差异化突破点",
      risk: "控制供应链风险，应对出口管制不确定性",
      growth: "提升算力利用率，优化交付周期",
    },
    insights: [
      "AI算力市场规模预计2025年达$500B+，增速40%+",
      "NVIDIA占据80%+数据中心GPU市场，但面临AMD、Intel、国产芯片挑战",
      "美国出口管制持续收紧，对中国市场影响深远",
      "云厂商自研芯片趋势明显(Google TPU、AWS Trainium)",
      "算力供需紧张，交付周期成为关键竞争因素",
    ],
  },
  "Cloud Services": {
    companies: [
      {
        name: "AWS",
        type: "benchmark",
        market: "Global",
        reason: "全球云市场领导者，市场份额32%",
      },
      {
        name: "Microsoft Azure",
        type: "benchmark",
        market: "Global",
        reason: "企业级云服务强者，市场份额23%",
      },
      {
        name: "Google Cloud",
        type: "challenger",
        market: "Global",
        reason: "AI/ML能力领先，追赶头部",
      },
      {
        name: "阿里云",
        type: "regional",
        market: "China",
        reason: "亚太市场领导者，国内份额第一",
      },
      {
        name: "华为云",
        type: "regional",
        market: "China",
        reason: "政企市场强势，全栈自研",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "战略方向制定" },
      { role: "CTO", team: "BLUE", reason: "技术架构决策" },
      { role: "CEO", team: "RED", reason: "竞争策略制定" },
      { role: "产品VP", team: "RED", reason: "产品差异化执行" },
      { role: "数据安全监管", team: "GREEN", reason: "数据合规审查" },
      { role: "客户代表", team: "GREEN", reason: "客户需求反馈" },
    ],
    goals: {
      targetShare: "提升市场份额2-3个百分点",
      risk: "数据安全合规，客户锁定风险",
      growth: "提升ARPU，拓展新业务线",
    },
    insights: [
      "全球云服务市场规模$600B+，增速20%+",
      "多云/混合云趋势明显，单一厂商锁定风险下降",
      "AI驱动云服务升级，GPU云成为新增长点",
      "数据主权要求推动本地化部署需求",
    ],
  },
  Semiconductor: {
    companies: [
      {
        name: "TSMC",
        type: "benchmark",
        market: "Global",
        reason: "先进制程绝对垄断，代工市场60%+份额",
      },
      {
        name: "Samsung",
        type: "challenger",
        market: "Global",
        reason: "先进制程追赶者，存储器领导者",
      },
      {
        name: "Intel",
        type: "regional",
        market: "US",
        reason: "IDM模式回归，政府补贴支持",
      },
      {
        name: "中芯国际",
        type: "regional",
        market: "China",
        reason: "国产替代主力，受设备限制",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "产能扩张决策" },
      { role: "采购VP", team: "BLUE", reason: "设备供应链管理" },
      { role: "CEO", team: "RED", reason: "竞争产能策略" },
      { role: "技术VP", team: "RED", reason: "制程追赶决策" },
      {
        role: "出口管制官员",
        team: "GREEN",
        reason: "设备出口、技术转让审查",
      },
      { role: "行业协会", team: "GREEN", reason: "产业政策协调" },
    ],
    goals: {
      targetShare: "维持先进制程领先地位",
      risk: "地缘政治风险、设备供应链安全",
      growth: "产能扩张ROI最大化",
    },
    insights: [
      "先进制程(3nm以下)竞争白热化",
      "美国CHIPS法案推动本土制造",
      "设备供应链(ASML光刻机)成为战略瓶颈",
      "Chiplet技术可能改变游戏规则",
    ],
  },
  "Electric Vehicles": {
    companies: [
      {
        name: "Tesla",
        type: "benchmark",
        market: "Global",
        reason: "纯电领导者，软件定义汽车先驱",
      },
      {
        name: "比亚迪",
        type: "benchmark",
        market: "China",
        reason: "全球销量第一，垂直整合优势",
      },
      {
        name: "蔚来",
        type: "startup",
        market: "China",
        reason: "高端电动车新势力，换电模式",
      },
      {
        name: "大众",
        type: "regional",
        market: "Europe",
        reason: "传统巨头转型，MEB平台",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "产品战略决策" },
      { role: "供应链VP", team: "BLUE", reason: "电池供应管理" },
      { role: "CEO", team: "RED", reason: "市场竞争策略" },
      { role: "营销VP", team: "RED", reason: "价格战执行" },
      { role: "环保监管", team: "GREEN", reason: "排放、回收合规" },
      { role: "消费者协会", team: "GREEN", reason: "安全、维权" },
    ],
    goals: {
      targetShare: "抢占增量市场份额",
      risk: "电池安全、产能爬坡风险",
      growth: "智能化软件收入增长",
    },
    insights: [
      "全球EV渗透率持续提升，2025年预计20%+",
      "价格战激烈，利润率承压",
      "固态电池技术可能带来变革",
      "自动驾驶成为差异化关键",
    ],
  },
  Fintech: {
    companies: [
      {
        name: "蚂蚁集团",
        type: "benchmark",
        market: "China",
        reason: "支付宝生态，数字金融领导者",
      },
      {
        name: "PayPal",
        type: "benchmark",
        market: "Global",
        reason: "全球支付网络，商户生态",
      },
      {
        name: "Stripe",
        type: "startup",
        market: "Global",
        reason: "开发者友好，B2B支付",
      },
      {
        name: "微众银行",
        type: "regional",
        market: "China",
        reason: "微信生态，小微贷款",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "业务模式创新" },
      { role: "风控VP", team: "BLUE", reason: "信贷风险管理" },
      { role: "CEO", team: "RED", reason: "市场竞争策略" },
      { role: "金融监管", team: "GREEN", reason: "牌照、合规审查" },
      { role: "消费者保护", team: "GREEN", reason: "数据隐私、费率" },
    ],
    goals: {
      targetShare: "扩大活跃用户基数",
      risk: "监管合规、信贷风险",
      growth: "ARPU提升、新场景拓展",
    },
    insights: [
      "监管趋严成为行业常态",
      "嵌入式金融机会巨大",
      "AI驱动风控和个性化",
      "跨境支付增长迅速",
    ],
  },
  "E-commerce": {
    companies: [
      {
        name: "Amazon",
        type: "benchmark",
        market: "Global",
        reason: "全球电商领导者，Prime生态",
      },
      {
        name: "阿里巴巴",
        type: "benchmark",
        market: "China",
        reason: "国内电商第一，新零售探索",
      },
      {
        name: "拼多多",
        type: "challenger",
        market: "China",
        reason: "社交电商黑马，下沉市场",
      },
      {
        name: "Shopify",
        type: "startup",
        market: "Global",
        reason: "独立站工具，赋能商家",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "平台战略" },
      { role: "运营VP", team: "BLUE", reason: "GMV增长执行" },
      { role: "CEO", team: "RED", reason: "竞争策略" },
      { role: "反垄断监管", team: "GREEN", reason: "平台治理审查" },
      { role: "商家代表", team: "GREEN", reason: "平台规则博弈" },
    ],
    goals: {
      targetShare: "提升GMV和市场份额",
      risk: "反垄断、商家流失风险",
      growth: "广告、物流增值服务",
    },
    insights: [
      "直播电商成为增长引擎",
      "平台反垄断监管持续",
      "跨境电商机会与挑战并存",
      "AI个性化推荐提升转化",
    ],
  },
  SaaS: {
    companies: [
      {
        name: "Salesforce",
        type: "benchmark",
        market: "Global",
        reason: "CRM领导者，企业级SaaS标杆",
      },
      {
        name: "Microsoft 365",
        type: "benchmark",
        market: "Global",
        reason: "办公套件霸主，企业渗透率高",
      },
      {
        name: "Zoom",
        type: "challenger",
        market: "Global",
        reason: "视频会议新贵，疫情受益",
      },
      {
        name: "钉钉",
        type: "regional",
        market: "China",
        reason: "企业协作平台，阿里生态",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "产品战略" },
      { role: "销售VP", team: "BLUE", reason: "企业客户拓展" },
      { role: "CEO", team: "RED", reason: "竞争策略" },
      { role: "企业客户", team: "GREEN", reason: "采购决策" },
      { role: "数据安全监管", team: "GREEN", reason: "数据合规" },
    ],
    goals: {
      targetShare: "提升ARR和客户留存",
      risk: "客户流失、竞争加剧",
      growth: "AI功能升级、生态扩展",
    },
    insights: [
      "AI Copilot成为标配功能",
      "PLG模式挑战传统销售",
      "垂直SaaS机会涌现",
      "安全合规要求提升",
    ],
  },
  Gaming: {
    companies: [
      {
        name: "腾讯游戏",
        type: "benchmark",
        market: "Global",
        reason: "全球游戏收入第一，投资版图庞大",
      },
      {
        name: "索尼",
        type: "benchmark",
        market: "Global",
        reason: "PlayStation生态，独占大作",
      },
      {
        name: "米哈游",
        type: "startup",
        market: "Global",
        reason: "原神现象级，二次元出海标杆",
      },
      { name: "网易游戏", type: "regional", market: "China", reason: "自研强" },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "IP战略" },
      { role: "制作人", team: "BLUE", reason: "产品创新" },
      { role: "CEO", team: "RED", reason: "竞争策略" },
      { role: "版号监管", team: "GREEN", reason: "内容审查" },
      { role: "玩家社区", team: "GREEN", reason: "舆情反馈" },
    ],
    goals: {
      targetShare: "爆款产品市场份额",
      risk: "版号政策、未成年人保护",
      growth: "海外市场拓展",
    },
    insights: [
      "版号政策影响国内发行节奏",
      "出海成为增长必选项",
      "云游戏、AI NPC新机会",
      "玩家付费意愿分化明显",
    ],
  },
  Healthcare: {
    companies: [
      {
        name: "强生",
        type: "benchmark",
        market: "Global",
        reason: "医疗器械+制药巨头",
      },
      {
        name: "辉瑞",
        type: "benchmark",
        market: "Global",
        reason: "创新药领导者",
      },
      {
        name: "药明康德",
        type: "regional",
        market: "China",
        reason: "CRO/CDMO龙头",
      },
      {
        name: "联影医疗",
        type: "startup",
        market: "China",
        reason: "高端医疗影像设备",
      },
    ],
    agents: [
      { role: "CEO", team: "BLUE", reason: "研发战略" },
      { role: "研发VP", team: "BLUE", reason: "管线决策" },
      { role: "CEO", team: "RED", reason: "竞争策略" },
      { role: "FDA/NMPA", team: "GREEN", reason: "药品审批" },
      { role: "医保局", team: "GREEN", reason: "价格谈判" },
    ],
    goals: {
      targetShare: "关键治疗领域市场份额",
      risk: "研发失败、合规风险",
      growth: "创新药管线突破",
    },
    insights: [
      "AI加速药物发现",
      "医保谈判压缩利润空间",
      "基因治疗、细胞治疗前沿突破",
      "老龄化驱动需求增长",
    ],
  },
};

// 通用默认模板
const DEFAULT_ANALYSIS: IndustryAnalysis = {
  companies: [
    {
      name: "行业领导者",
      type: "benchmark",
      market: "Global",
      reason: "市场份额最大的头部企业",
    },
    {
      name: "挑战者",
      type: "challenger",
      market: "Global",
      reason: "快速增长的第二梯队",
    },
    {
      name: "区域龙头",
      type: "regional",
      market: "Local",
      reason: "特定区域市场领先",
    },
    {
      name: "新势力",
      type: "startup",
      market: "Local",
      reason: "创新型初创企业",
    },
  ],
  agents: [
    { role: "CEO", team: "BLUE", reason: "战略决策者" },
    { role: "COO", team: "BLUE", reason: "运营执行者" },
    { role: "CEO", team: "RED", reason: "竞争对手决策者" },
    { role: "监管机构", team: "GREEN", reason: "政策合规审查" },
    { role: "媒体分析师", team: "GREEN", reason: "舆情影响" },
  ],
  goals: {
    targetShare: "提升市场份额",
    risk: "控制经营风险",
    growth: "实现可持续增长",
  },
  insights: [
    "请根据具体行业补充竞争格局分析",
    "建议配置外部数据API获取实时市场信息",
  ],
};

@Injectable()
export class AIAssistService {
  private readonly logger = new Logger(AIAssistService.name);

  constructor(private readonly externalData: ExternalDataService) {}

  /**
   * 根据行业和区域分析竞争格局，推荐公司和角色配置
   */
  async analyzeIndustry(params: {
    industry: string;
    region?: string;
    existingCompanies?: string[];
  }): Promise<IndustryAnalysis> {
    const { industry, region, existingCompanies = [] } = params;

    this.logger.log(
      `AI Assist analyzing industry: ${industry}, region: ${region}`,
    );

    // 1. 尝试从知识库获取行业分析
    let analysis = INDUSTRY_KNOWLEDGE[industry] || null;

    // 2. 如果没有精确匹配，尝试模糊匹配
    if (!analysis) {
      const lowerIndustry = industry.toLowerCase();
      for (const [key, value] of Object.entries(INDUSTRY_KNOWLEDGE)) {
        if (
          key.toLowerCase().includes(lowerIndustry) ||
          lowerIndustry.includes(key.toLowerCase())
        ) {
          analysis = value;
          break;
        }
      }
    }

    // 3. 如果仍然没有，使用默认模板
    if (!analysis) {
      analysis = { ...DEFAULT_ANALYSIS };
      analysis.insights = [
        `${industry}行业分析数据较少，建议配置外部数据API获取实时信息`,
        "可使用AI辅助功能获取更详细的竞争格局分析",
      ];
    }

    // 4. 根据区域过滤公司
    if (region && region !== "Global") {
      analysis = {
        ...analysis,
        companies: analysis.companies.filter(
          (c) => c.market === "Global" || c.market === region,
        ),
      };
    }

    // 5. 排除已存在的公司
    if (existingCompanies.length > 0) {
      const existingLower = existingCompanies.map((c) => c.toLowerCase());
      analysis = {
        ...analysis,
        companies: analysis.companies.filter(
          (c) => !existingLower.includes(c.name.toLowerCase()),
        ),
      };
    }

    // 6. 尝试从外部数据补充实时洞察
    try {
      const { snapshot } = await this.externalData.getSnapshot(["news"]);
      if (snapshot?.news && !snapshot.news.error) {
        analysis.insights = [
          ...analysis.insights,
          "已同步外部新闻数据，裁判系统将使用实时信息进行判定",
        ];
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch external data for insights: ${err}`);
    }

    return analysis;
  }

  /**
   * 根据已有配置推荐补充的角色
   */
  async suggestAgents(params: {
    industry: string;
    companies: Array<{ name: string; type: string }>;
    existingAgents?: Array<{ role: string; team: string }>;
  }): Promise<
    Array<{
      role: string;
      team: "BLUE" | "RED" | "GREEN" | "CHAOS";
      companyName?: string;
      reason: string;
    }>
  > {
    const { industry, companies, existingAgents = [] } = params;

    const analysis = await this.analyzeIndustry({ industry });
    const existingRoles = new Set(
      existingAgents.map((a) => `${a.team}-${a.role}`.toLowerCase()),
    );

    // 过滤已存在的角色
    const suggestions = analysis.agents
      .filter((a) => !existingRoles.has(`${a.team}-${a.role}`.toLowerCase()))
      .map((a) => {
        // 尝试为BLUE/RED角色分配公司
        let companyName: string | undefined;
        if (a.team === "BLUE" && companies.length > 0) {
          const blueCompany = companies.find(
            (c) => c.type === "benchmark" || c.type === "regional",
          );
          companyName = blueCompany?.name || companies[0]?.name;
        } else if (a.team === "RED" && companies.length > 1) {
          const redCompany = companies.find(
            (c) => c.type === "challenger" || c.type === "startup",
          );
          companyName = redCompany?.name || companies[1]?.name;
        }

        return {
          role: a.role,
          team: a.team,
          companyName,
          reason: a.reason,
        };
      });

    return suggestions;
  }

  /**
   * 生成推演场景的智能建议
   */
  async generateScenarioSuggestions(params: {
    industry: string;
    region?: string;
    goals?: string;
  }): Promise<{
    name: string;
    description: string;
    recommendedRounds: number;
    chaosProb: number;
    humanBreakEvery: number;
    keyRisks: string[];
  }> {
    const { industry, region = "Global" } = params;

    const analysis = await this.analyzeIndustry({ industry, region });

    // 根据行业特点推荐参数
    const isHighRisk = ["Semiconductor", "AI Compute Infrastructure"].includes(
      industry,
    );
    const isRegulationHeavy = ["Fintech", "Healthcare"].includes(industry);

    return {
      name: `${industry} 战略推演 - ${region}`,
      description: `${industry}行业${region}市场竞争格局推演，涵盖${analysis.companies.length}家主要参与者`,
      recommendedRounds: isHighRisk ? 6 : 4,
      chaosProb: isHighRisk ? 0.35 : isRegulationHeavy ? 0.25 : 0.2,
      humanBreakEvery: isRegulationHeavy ? 1 : 2,
      keyRisks: analysis.insights.slice(0, 3),
    };
  }
}
