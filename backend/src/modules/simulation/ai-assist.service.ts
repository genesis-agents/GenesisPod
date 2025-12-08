import { Injectable, Logger } from "@nestjs/common";
import { ExternalDataService } from "./external-data.service";
import { AiChatService } from "../ai/ai-chat.service";

interface IndustryAnalysis {
  companies: Array<{
    name: string;
    type: string;
    market: string;
    reason: string;
  }>;
  agents: Array<{
    role: string;
    team: "BLUE" | "RED" | "GREEN" | "WHITE" | "CHAOS";
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
      { role: "监管官员", team: "WHITE", reason: "出口管制、反垄断审查" },
      { role: "行业分析师", team: "WHITE", reason: "市场舆情、评级影响" },
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
      { role: "数据安全监管", team: "WHITE", reason: "数据合规审查" },
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
        team: "WHITE",
        reason: "设备出口、技术转让审查",
      },
      { role: "行业协会", team: "WHITE", reason: "产业政策协调" },
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
      { role: "环保监管", team: "WHITE", reason: "排放、回收合规" },
      { role: "消费者协会", team: "GREEN", reason: "消费者权益、安全" },
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
      { role: "金融监管", team: "WHITE", reason: "牌照、合规审查" },
      { role: "消费者保护", team: "WHITE", reason: "数据隐私、费率监管" },
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
      { role: "反垄断监管", team: "WHITE", reason: "平台治理审查" },
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
      { role: "数据安全监管", team: "WHITE", reason: "数据合规" },
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
      { role: "版号监管", team: "WHITE", reason: "内容审查" },
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
      { role: "FDA/NMPA", team: "WHITE", reason: "药品审批" },
      { role: "医保局", team: "WHITE", reason: "价格谈判" },
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

// 公司指标生成模板 - 基于公司类型和行业
interface CompanyMetricsTemplate {
  cash: { min: number; max: number }; // 万美元
  share: { min: number; max: number }; // %
  margin: { min: number; max: number }; // %
  debt: { min: number; max: number }; // 万美元
  capacity: { min: number; max: number };
  inventory: { min: number; max: number };
  priceBand: string;
  delivery: string;
  patents: { min: number; max: number };
  channels: string;
  brand: string;
}

const COMPANY_METRICS_BY_TYPE: Record<string, CompanyMetricsTemplate> = {
  benchmark: {
    cash: { min: 50000, max: 200000 },
    share: { min: 25, max: 60 },
    margin: { min: 35, max: 55 },
    debt: { min: 10000, max: 50000 },
    capacity: { min: 5000, max: 20000 },
    inventory: { min: 500, max: 2000 },
    priceBand: "高端",
    delivery: "2-4周",
    patents: { min: 500, max: 5000 },
    channels: "直销+代理",
    brand: "global_leader",
  },
  challenger: {
    cash: { min: 20000, max: 80000 },
    share: { min: 10, max: 25 },
    margin: { min: 25, max: 40 },
    debt: { min: 5000, max: 30000 },
    capacity: { min: 2000, max: 8000 },
    inventory: { min: 300, max: 1000 },
    priceBand: "中高端",
    delivery: "3-6周",
    patents: { min: 100, max: 1000 },
    channels: "直销+电商",
    brand: "strong",
  },
  regional: {
    cash: { min: 10000, max: 50000 },
    share: { min: 5, max: 20 },
    margin: { min: 20, max: 35 },
    debt: { min: 3000, max: 20000 },
    capacity: { min: 1000, max: 5000 },
    inventory: { min: 200, max: 800 },
    priceBand: "中端",
    delivery: "2-4周",
    patents: { min: 50, max: 500 },
    channels: "区域代理",
    brand: "growing",
  },
  startup: {
    cash: { min: 1000, max: 20000 },
    share: { min: 1, max: 10 },
    margin: { min: 15, max: 30 },
    debt: { min: 500, max: 10000 },
    capacity: { min: 100, max: 1000 },
    inventory: { min: 50, max: 300 },
    priceBand: "中低端",
    delivery: "4-8周",
    patents: { min: 10, max: 100 },
    channels: "电商+直销",
    brand: "emerging",
  },
};

// 行业特定调整系数
const INDUSTRY_MODIFIERS: Record<
  string,
  Partial<{
    cashMultiplier: number;
    marginBonus: number;
    patentMultiplier: number;
    deliveryFast: boolean;
  }>
> = {
  "AI Compute Infrastructure": {
    cashMultiplier: 2,
    marginBonus: 10,
    patentMultiplier: 3,
  },
  Semiconductor: { cashMultiplier: 3, marginBonus: 15, patentMultiplier: 5 },
  "Cloud Services": { cashMultiplier: 2, marginBonus: 5, deliveryFast: true },
  Fintech: { cashMultiplier: 1.5, marginBonus: -5 },
  "E-commerce": { cashMultiplier: 1.2, deliveryFast: true },
  SaaS: { marginBonus: 20, deliveryFast: true },
  Gaming: { marginBonus: 10, patentMultiplier: 0.5 },
  Healthcare: { cashMultiplier: 2.5, patentMultiplier: 4 },
  "Electric Vehicles": { cashMultiplier: 3, patentMultiplier: 2 },
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
      market: "Global", // 改为Global以确保在任何区域筛选下都能显示
      reason: "特定区域市场领先",
    },
    {
      name: "新势力",
      type: "startup",
      market: "Global", // 改为Global以确保在任何区域筛选下都能显示
      reason: "创新型初创企业",
    },
  ],
  agents: [
    { role: "CEO", team: "BLUE", reason: "战略决策者" },
    { role: "COO", team: "BLUE", reason: "运营执行者" },
    { role: "CEO", team: "RED", reason: "竞争对手决策者" },
    { role: "监管机构", team: "WHITE", reason: "政策合规审查" },
    { role: "行业分析师", team: "WHITE", reason: "中立评估、舆情影响" },
    { role: "客户代表", team: "GREEN", reason: "市场需求、采购决策" },
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

  constructor(
    private readonly externalData: ExternalDataService,
    private readonly aiChat: AiChatService,
  ) {}

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
   * 关键逻辑：基于用户已选择的蓝军公司，智能分配其他公司给红军/绿军/白军
   */
  async suggestAgents(params: {
    industry: string;
    companies: Array<{ name: string; type: string }>;
    existingAgents?: Array<{
      role: string;
      team: string;
      companyName?: string;
    }>;
  }): Promise<
    Array<{
      role: string;
      team: "BLUE" | "RED" | "GREEN" | "WHITE" | "CHAOS";
      companyName?: string;
      reason: string;
    }>
  > {
    const { industry, companies, existingAgents = [] } = params;

    const analysis = await this.analyzeIndustry({ industry });
    const existingRoles = new Set(
      existingAgents.map((a) => `${a.team}-${a.role}`.toLowerCase()),
    );

    // 识别已被蓝军占用的公司
    const blueCompanyNames = new Set(
      existingAgents
        .filter((a) => a.team === "BLUE" && a.companyName)
        .map((a) => a.companyName!.toLowerCase()),
    );

    // 识别已被其他阵营占用的公司
    const usedCompanyNames = new Set(
      existingAgents
        .filter((a) => a.companyName)
        .map((a) => a.companyName!.toLowerCase()),
    );

    // 获取可用于红军的公司（非蓝军公司）
    const availableForRed = companies.filter(
      (c) => !blueCompanyNames.has(c.name.toLowerCase()),
    );

    // 获取完全未使用的公司
    const unusedCompanies = companies.filter(
      (c) => !usedCompanyNames.has(c.name.toLowerCase()),
    );

    this.logger.log(
      `AI Suggest Agents: Blue companies: ${[...blueCompanyNames].join(", ")}; Available for RED: ${availableForRed.map((c) => c.name).join(", ")}`,
    );

    // 过滤已存在的角色，并智能分配公司
    const suggestions = analysis.agents
      .filter((a) => !existingRoles.has(`${a.team}-${a.role}`.toLowerCase()))
      .filter((a) => a.team !== "BLUE") // 不推荐蓝军角色，因为用户已有蓝军
      .map((a) => {
        let companyName: string | undefined;

        if (a.team === "RED") {
          // 红军优先使用：challenger > startup > 其他非蓝军公司
          const redCompany =
            availableForRed.find((c) => c.type === "challenger") ||
            availableForRed.find((c) => c.type === "startup") ||
            availableForRed.find((c) => c.type === "benchmark") ||
            availableForRed[0];
          companyName = redCompany?.name;
        } else if (a.team === "GREEN") {
          // 绿军（市场/客户/供应商）可以使用 regional 类型公司或不分配
          const greenCompany = unusedCompanies.find(
            (c) => c.type === "regional" || c.type === "startup",
          );
          companyName = greenCompany?.name;
        }
        // WHITE（监管）和 CHAOS（黑天鹅）通常不需要绑定公司

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

  /**
   * 生成公司量化指标建议
   * 策略: 1. 先尝试从外部API获取真实数据 2. 用LLM结合外部数据生成 3. 回退到本地模板
   */
  async generateCompanyMetrics(params: {
    companyName: string;
    companyType: string;
    industry: string;
    market?: string;
  }): Promise<{
    metrics: {
      cash: number;
      share: number;
      margin: number;
      debt: number;
      capacity: number;
      inventory: number;
      priceBand: string;
      delivery: string;
      patents: number;
      channels: string;
      brand: string;
    };
    reasoning: string;
    dataSource?: string; // 数据来源标识
  }> {
    const { companyName, companyType, industry } = params;

    this.logger.log(
      `AI Assist generating metrics for: ${companyName} (${companyType}) in ${industry}`,
    );

    // Step 1: 尝试从外部API获取公司真实数据
    let externalData: any = null;
    try {
      const financeResult = await this.externalData.fetchFromProvider(
        "finance",
        undefined,
        { query: companyName },
      );

      if (financeResult.ok && financeResult.data) {
        this.logger.log(
          `[AI Assist] Found external data for ${companyName} from provider: ${financeResult.providerId}`,
        );
        externalData = financeResult.data;
      }
    } catch (err) {
      this.logger.warn(`[AI Assist] External data fetch failed: ${err}`);
    }

    // Step 2: 使用LLM结合外部数据生成指标
    try {
      const llmResult = await this.generateMetricsWithLLM({
        ...params,
        externalData,
      });
      if (llmResult) {
        return {
          ...llmResult,
          dataSource: externalData
            ? "LLM + External API"
            : "LLM (AI Generated)",
        };
      }
    } catch (err) {
      this.logger.warn(
        `LLM metrics generation failed, falling back to template: ${err}`,
      );
    }

    // Step 3: 回退到本地模板生成
    const templateResult = this.generateMetricsFromTemplate(params);
    return {
      ...templateResult,
      dataSource: "Local Template (Fallback)",
    };
  }

  /**
   * 使用 LLM 动态生成公司指标
   * 支持结合外部API数据进行更准确的生成
   */
  private async generateMetricsWithLLM(params: {
    companyName: string;
    companyType: string;
    industry: string;
    market?: string;
    externalData?: any; // 外部API获取的真实数据
  }): Promise<{
    metrics: {
      cash: number;
      share: number;
      margin: number;
      debt: number;
      capacity: number;
      inventory: number;
      priceBand: string;
      delivery: string;
      patents: number;
      channels: string;
      brand: string;
    };
    reasoning: string;
  } | null> {
    const {
      companyName,
      companyType,
      industry,
      market = "Global",
      externalData,
    } = params;

    const typeLabels: Record<string, string> = {
      benchmark: "行业标杆/龙头企业",
      challenger: "挑战者/第二梯队",
      regional: "区域龙头",
      startup: "初创公司/新兴企业",
    };

    // 构建系统提示，根据是否有外部数据调整
    let systemPrompt = `你是一位资深的行业分析师和商业情报专家。请根据公司名称、类型、所属行业和市场，生成合理的公司量化指标。

注意事项：
1. 数据应该基于该行业的实际情况和公司类型进行合理估算
2. 如果是知名公司，尽量贴近其公开财务数据的量级
3. 如果是虚构或不知名公司，根据行业和类型给出合理假设
4. 所有数值应该保持内部一致性（如初创公司不应有过高的现金储备）`;

    if (externalData) {
      systemPrompt += `
5. 重要：用户提供了外部API获取的真实数据，请优先参考这些数据，并据此调整生成的指标
6. 如果外部数据中包含财务数据、市场数据，请直接使用或合理换算`;
    }

    systemPrompt += `

请以 JSON 格式返回，不要包含任何其他文字：
{
  "metrics": {
    "cash": <现金储备，万美元>,
    "share": <市场份额，百分比数值如15表示15%>,
    "margin": <毛利率，百分比数值>,
    "debt": <负债，万美元>,
    "capacity": <产能单位数>,
    "inventory": <库存单位数>,
    "priceBand": "<定位：高端/中高端/中端/中低端/低端>",
    "delivery": "<交付周期如：2-4周>",
    "patents": <专利数量>,
    "channels": "<渠道：如直销+代理>",
    "brand": "<品牌力：global_leader/strong/growing/niche/emerging>"
  },
  "reasoning": "<简要说明生成依据，如果使用了外部数据请注明>"
}`;

    // 构建用户提示
    let userPrompt = `公司名称：${companyName}
公司类型：${typeLabels[companyType] || companyType}
所属行业：${industry}
目标市场：${market}`;

    // 如果有外部数据，将其格式化后添加到提示中
    if (externalData) {
      const externalDataStr =
        typeof externalData === "string"
          ? externalData
          : JSON.stringify(externalData, null, 2);

      userPrompt += `

=== 外部API获取的真实数据 ===
${externalDataStr.slice(0, 3000)}${externalDataStr.length > 3000 ? "\n...(数据已截断)" : ""}
===========================`;
    }

    userPrompt += `

请生成该公司的量化指标。`;

    try {
      const result = await this.aiChat.generateChatCompletion({
        model: "gpt-4",
        systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
        maxTokens: 1024,
        temperature: 0.7,
      });

      if (!result.content) {
        return null;
      }

      // 解析 JSON 响应
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        this.logger.warn("LLM response is not valid JSON");
        return null;
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // 验证必要字段
      if (!parsed.metrics || typeof parsed.metrics.cash !== "number") {
        this.logger.warn("LLM response missing required metrics fields");
        return null;
      }

      return {
        metrics: {
          cash: parsed.metrics.cash || 0,
          share: parsed.metrics.share || 0,
          margin: parsed.metrics.margin || 0,
          debt: parsed.metrics.debt || 0,
          capacity: parsed.metrics.capacity || 0,
          inventory: parsed.metrics.inventory || 0,
          priceBand: parsed.metrics.priceBand || "中端",
          delivery: parsed.metrics.delivery || "2-4周",
          patents: parsed.metrics.patents || 0,
          channels: parsed.metrics.channels || "直销",
          brand: parsed.metrics.brand || "growing",
        },
        reasoning:
          parsed.reasoning || `基于${industry}行业${companyType}类型生成`,
      };
    } catch (err) {
      this.logger.error(`Failed to parse LLM response: ${err}`);
      return null;
    }
  }

  /**
   * 使用本地模板生成公司指标（回退方案）
   */
  private generateMetricsFromTemplate(params: {
    companyName: string;
    companyType: string;
    industry: string;
    market?: string;
  }): {
    metrics: {
      cash: number;
      share: number;
      margin: number;
      debt: number;
      capacity: number;
      inventory: number;
      priceBand: string;
      delivery: string;
      patents: number;
      channels: string;
      brand: string;
    };
    reasoning: string;
  } {
    const { companyName, companyType, industry, market = "Global" } = params;

    // 1. 获取公司类型基础模板
    const template =
      COMPANY_METRICS_BY_TYPE[companyType] ||
      COMPANY_METRICS_BY_TYPE["startup"];

    // 2. 获取行业调整系数
    let modifier = INDUSTRY_MODIFIERS[industry] || {};

    // 尝试模糊匹配行业
    if (!INDUSTRY_MODIFIERS[industry]) {
      const lowerIndustry = industry.toLowerCase();
      for (const [key, value] of Object.entries(INDUSTRY_MODIFIERS)) {
        if (
          key.toLowerCase().includes(lowerIndustry) ||
          lowerIndustry.includes(key.toLowerCase())
        ) {
          modifier = value;
          break;
        }
      }
    }

    // 3. 生成随机值的辅助函数
    const randomBetween = (min: number, max: number) =>
      Math.round(min + Math.random() * (max - min));

    // 4. 应用模板和行业调整
    const cashMultiplier = modifier.cashMultiplier || 1;
    const marginBonus = modifier.marginBonus || 0;
    const patentMultiplier = modifier.patentMultiplier || 1;

    const metrics = {
      cash: randomBetween(
        template.cash.min * cashMultiplier,
        template.cash.max * cashMultiplier,
      ),
      share: randomBetween(template.share.min, template.share.max),
      margin: Math.min(
        70,
        randomBetween(template.margin.min, template.margin.max) + marginBonus,
      ),
      debt: randomBetween(template.debt.min, template.debt.max),
      capacity: randomBetween(template.capacity.min, template.capacity.max),
      inventory: randomBetween(template.inventory.min, template.inventory.max),
      priceBand: template.priceBand,
      delivery: modifier.deliveryFast
        ? this.shortenDelivery(template.delivery)
        : template.delivery,
      patents: Math.round(
        randomBetween(template.patents.min, template.patents.max) *
          patentMultiplier,
      ),
      channels: template.channels,
      brand: template.brand,
    };

    // 5. 区域调整
    if (market === "China" || market === "Asia") {
      metrics.share = Math.min(metrics.share * 1.2, 80); // 区域市场份额可能更高
    }

    // 6. 生成推理说明
    const typeLabels: Record<string, string> = {
      benchmark: "行业标杆",
      challenger: "挑战者",
      regional: "区域龙头",
      startup: "初创公司",
    };

    const reasoning = `基于${companyName}作为${industry}行业的${typeLabels[companyType] || companyType}，结合${market}市场特点生成（本地模板）。`;

    return { metrics, reasoning };
  }

  /**
   * 缩短交付周期
   */
  private shortenDelivery(delivery: string): string {
    const match = delivery.match(/(\d+)-(\d+)/);
    if (match) {
      const min = Math.max(1, parseInt(match[1]) - 1);
      const max = Math.max(2, parseInt(match[2]) - 1);
      return `${min}-${max}周`;
    }
    return delivery;
  }

  /**
   * 根据行业和场景配置，AI推荐最优推演参数
   */
  async suggestParams(params: {
    industry: string;
    region?: string;
    companyCount?: number;
    agentCount?: number;
    goals?: {
      targetShare?: string;
      risk?: string;
      growth?: string;
    };
  }): Promise<{
    blindMove: boolean;
    cot: boolean;
    chaosProb: number;
    irrationalProb: number;
    humanBreakEvery: number;
    rounds: number;
    enabledEvents: string[];
    reasoning: string;
  }> {
    const {
      industry,
      region = "Global",
      companyCount = 2,
      agentCount = 3,
      goals,
    } = params;

    this.logger.log(
      `AI Assist suggesting params for: ${industry}, region: ${region}, companies: ${companyCount}, agents: ${agentCount}`,
    );

    // 行业特征判断
    const isHighVolatility = [
      "AI Compute Infrastructure",
      "Semiconductor",
      "Electric Vehicles",
    ].includes(industry);

    const isHighRegulation = [
      "Fintech",
      "Healthcare",
      "Semiconductor",
    ].includes(industry);

    const isFastPaced = [
      "E-commerce",
      "SaaS",
      "Cloud Services",
      "Gaming",
    ].includes(industry);

    const isGeopolitical = [
      "AI Compute Infrastructure",
      "Semiconductor",
    ].includes(industry);

    // 根据行业特征推荐参数
    let blindMove = true; // 默认开启盲注，更真实
    let cot = true; // 默认开启CoT，提高透明度
    let chaosProb = 0.2; // 基础黑天鹅概率
    let irrationalProb = 0.15; // 基础非理性概率
    let humanBreakEvery = 2; // 默认每2轮人工介入
    let rounds = 4; // 默认4轮

    // 高波动性行业
    if (isHighVolatility) {
      chaosProb = 0.35;
      irrationalProb = 0.25;
      rounds = 6;
    }

    // 高监管行业
    if (isHighRegulation) {
      humanBreakEvery = 1; // 每轮都需要人工审核
      irrationalProb = 0.1; // 监管压力下更理性
    }

    // 快节奏行业
    if (isFastPaced) {
      blindMove = true;
      chaosProb = 0.25;
    }

    // 地缘政治敏感行业
    if (isGeopolitical) {
      chaosProb = Math.min(0.5, chaosProb + 0.15);
    }

    // 根据参与者数量调整
    if (companyCount > 3) {
      rounds = Math.min(8, rounds + 2); // 更多公司需要更多轮次
      humanBreakEvery = Math.min(3, humanBreakEvery + 1);
    }

    if (agentCount > 6) {
      humanBreakEvery = Math.max(1, humanBreakEvery - 1); // 更多角色需要更频繁审核
    }

    // 根据区域调整
    if (region === "China") {
      chaosProb = Math.min(0.5, chaosProb + 0.1); // 政策不确定性
    }

    // 根据目标调整
    if (goals?.risk?.includes("高") || goals?.risk?.includes("控制")) {
      humanBreakEvery = Math.max(1, humanBreakEvery - 1);
    }

    // 推荐启用的事件类型
    const enabledEvents: string[] = [
      "supply_chain",
      "regulation",
      "competitor",
    ];

    if (isHighVolatility) {
      enabledEvents.push("tech", "finance");
    }

    if (isHighRegulation) {
      enabledEvents.push("media", "customer");
    }

    if (isGeopolitical) {
      enabledEvents.push("disaster", "talent");
    }

    // 生成推理说明
    const reasoningParts: string[] = [];

    if (isHighVolatility) {
      reasoningParts.push("高波动性行业，建议较高的黑天鹅概率和更多轮次");
    }
    if (isHighRegulation) {
      reasoningParts.push("高监管行业，建议每轮人工审核，降低非理性决策");
    }
    if (isFastPaced) {
      reasoningParts.push("快节奏行业，适合盲注模式模拟同时决策");
    }
    if (isGeopolitical) {
      reasoningParts.push("地缘政治敏感，增加不确定性参数");
    }
    if (companyCount > 3) {
      reasoningParts.push(`${companyCount}家公司参与，建议增加推演轮数`);
    }

    const reasoning =
      reasoningParts.length > 0
        ? `基于${industry}行业特征：${reasoningParts.join("；")}`
        : `基于${industry}行业的通用配置，建议适度的不确定性和人工介入`;

    return {
      blindMove,
      cot,
      chaosProb: Math.round(chaosProb * 100) / 100,
      irrationalProb: Math.round(irrationalProb * 100) / 100,
      humanBreakEvery,
      rounds,
      enabledEvents,
      reasoning,
    };
  }
}
