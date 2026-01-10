/**
 * SensoryImmersionService - 五感沉浸式描写服务
 *
 * 核心职责：
 * - 提供场景类型对应的五感描写模板
 * - 生成沉浸式开篇指导
 * - 检查描写的感官丰富度
 *
 * 设计理念：
 * - 好的小说让读者"体验"而非"阅读"
 * - 五感协同才能创造真正的沉浸感
 * - 开篇决定读者是否继续阅读
 *
 * 对标案例：
 * ❌ "一阵剧烈的晕眩袭来，仿佛无数道电流在她的脑海中交错"
 * ✅ "那种冷，不是空调房里恒温的凉意，而是一种湿冷，像无数条冰冷的小蛇顺着骨缝往里钻"
 */

import { Injectable, Logger } from "@nestjs/common";

// ==================== 类型定义 ====================

export interface SensoryTemplate {
  /** 场景类型 */
  sceneType: string;
  /** 情绪基调 */
  emotionalTone: string;
  /** 触觉描写参考 */
  touch: string[];
  /** 嗅觉描写参考 */
  smell: string[];
  /** 听觉描写参考 */
  sound: string[];
  /** 视觉描写参考 */
  sight: string[];
  /** 味觉描写参考 */
  taste: string[];
  /** 示例段落 */
  exampleParagraph?: string;
}

export interface OpeningGuideline {
  /** 开篇类型 */
  type: "sensory" | "action" | "dialogue" | "mystery";
  /** 指导原则 */
  principles: string[];
  /** 禁止事项 */
  forbidden: string[];
  /** 示例 */
  examples: Array<{
    bad: string;
    good: string;
    explanation: string;
  }>;
}

// ==================== 五感模板库 ====================

const SENSORY_TEMPLATES: Record<string, SensoryTemplate> = {
  // 阴冷场景（监狱、地牢、冷宫）
  cold_dark: {
    sceneType: "阴冷幽暗",
    emotionalTone: "压抑、绝望、恐惧",
    touch: [
      "湿冷像无数条冰冷的小蛇顺着骨缝往里钻",
      "粗麻衣裳的纤维粗大得磨皮肤",
      "赤脚踩在冰冷的泥地上",
      "布满冻疮和裂口的双手",
      "硬邦邦、散发着陈腐霉味的絮状物",
      "指尖触到冰凉的墙壁，指甲缝里渗进细小的沙砾",
    ],
    smell: [
      "陈腐霉味",
      "土腥气",
      "燃烧木柴的烟火气",
      "混合了汗酸和染料酸腐的陈旧味道",
      "空气里没有工业排放的微粒味，只有纯粹的土腥",
      "角落飘来一股尿骚味混着发酵的酸臭",
    ],
    sound: [
      "铜漏滴水的声音",
      "窃窃私语",
      "低声啜泣",
      "远处隐约的脚步声",
      "老鼠窸窸窣窣穿过墙根的声音",
      "风从门缝呜呜地钻进来",
    ],
    sight: [
      "昏暗、狭窄的土房",
      "夯土墙壁，能看到里面夹杂的枯草茎",
      "年久失修而剥落，露出里面黑褐色的内芯",
      "破败的窗棂漏进惨白的月光",
      "角落里那个缺了口的漆碗，红黑相间的云气纹",
    ],
    taste: ["干渴得喉咙像砂纸", "嘴里泛着铁锈般的苦涩", "咬牙时牙根发酸"],
    exampleParagraph: `那种冷，不是空调房里恒温的凉意，而是一种湿冷，像无数条冰冷的小蛇顺着骨缝往里钻。她下意识地想抓被子，指尖触到的却是一团硬邦邦、散发着陈腐霉味的絮状物。空气里只有纯粹的土腥气、燃烧木柴的烟火气，以及一股淡淡的、混合了汗酸和染料酸腐的陈旧味道。`,
  },

  // 危机场景（对峙、威胁）
  confrontation: {
    sceneType: "危机对峙",
    emotionalTone: "紧张、恐惧、危险",
    touch: [
      "掐住脖子，指甲几乎嵌入肉里",
      "被掐得喘不过气",
      "冷汗顺着脊背滑下",
      "心脏在胸腔里剧烈撞击",
      "双腿发软，膝盖触到冰冷的地砖",
    ],
    smell: [
      "浓烈的异香扑鼻而来",
      "血腥味",
      "对方身上的香粉味",
      "恐惧让嗅觉变得敏锐",
    ],
    sound: [
      "环佩叮当的脆响",
      "尖厉的喝斥",
      "瓷器碎裂的巨响",
      "自己的心跳声震耳欲聋",
      "死一般的沉默",
      "衣裙摩擦地面的窸窣声",
    ],
    sight: [
      "目光像毒蛇的信子，冰冷、黏腻，带着杀意",
      "瞳孔骤然收缩",
      "面色骤变",
      "逆光中只能看到轮廓",
      "眼神阴鸷",
    ],
    taste: ["恐惧让唾液干涸", "嘴里泛着血腥味", "苦涩涌上喉头"],
    exampleParagraph: `赵飞燕的手忽然掐住苏曼的脖子，指甲几乎嵌入肉里。那目光像毒蛇的信子，冰冷、黏腻，带着杀意。苏曼被掐得喘不过气，心脏在胸腔里剧烈撞击，冷汗顺着脊背滑下。空气中弥漫着浓烈的异香，那香气甜腻得令人窒息。`,
  },

  // 华贵场景（宫殿、宴会）
  luxurious: {
    sceneType: "华贵富丽",
    emotionalTone: "奢靡、压抑、危机四伏",
    touch: [
      "温润的青砖",
      "厚厚羊毛地毯的柔软",
      "金丝楠木地板的光滑",
      "丝绸滑过皮肤的凉意",
      "铜镜的冰凉",
    ],
    smell: [
      "甜腻、浓郁到令人窒息的异香",
      "龙涎香的幽香",
      "花香混着脂粉气",
      "精致菜肴的香气",
    ],
    sound: ["环佩叮当", "丝竹之声", "轻柔的脚步声", "低声细语", "笑声如银铃"],
    sight: ["雕梁画栋", "流光溢彩的帷幔", "烛火摇曳", "金碧辉煌", "珠光宝气"],
    taste: ["琼浆玉液", "山珍海味", "果香在舌尖绽放"],
    exampleParagraph: `从未央宫的西北角到正中的昭阳殿，脚下的路从碎石变成了温润的青砖，最后变成了铺着厚厚羊毛地毯的金丝楠木地板。空气中那种挥之不去的酸腐味消失了，取而代之的是一种甜腻、浓郁到令人窒息的异香。`,
  },

  // 病痛场景（中毒、受伤）
  illness: {
    sceneType: "病痛折磨",
    emotionalTone: "痛苦、虚弱、绝望",
    touch: [
      "浑身无力如同被抽空",
      "皮肤像被火烧",
      "骨头缝里酸痛",
      "不住颤抖的手",
      "额头滚烫",
    ],
    smell: ["药味", "病人身上特有的腐败气息", "汗臭", "铅粉的金属气味"],
    sound: ["虚弱的呻吟", "沉重的喘息", "牙齿打战的咯咯声"],
    sight: [
      "面如死灰",
      "眼眶和嘴唇周围泛着骇人的青紫",
      "牙龈边缘有一条清晰的深蓝色线条",
      "浑浊的眼珠",
      "皮肤上的斑驳",
    ],
    taste: ["嘴里发苦", "金属味", "恶心想吐"],
    exampleParagraph: `那是一张怎样的脸啊——原本精致的五官上，覆盖着一层死灰色的阴翳，尤其是眼眶和嘴唇周围，泛着骇人的青紫。更可怕的是，女子的牙龈边缘，有一条清晰的深蓝色线条。"铅线？"苏曼脱口而出，"你是重金属中毒？"`,
  },

  // 实验/制作场景
  crafting: {
    sceneType: "制作实验",
    emotionalTone: "专注、期待、成就感",
    touch: [
      "研磨的震动感",
      "油脂在掌心温热化开",
      "细腻的粉末从指缝滑落",
      "搅拌时的阻力变化",
    ],
    smell: ["草木灰的碱味", "猪油的腥臊", "花粉的甜香", "提纯后清淡的油脂香"],
    sound: ["杵棒轻轻碰撞的声音", "液体沸腾的咕嘟声", "过滤时的滴答声"],
    sight: [
      "白色粉末细如面粉",
      "油脂洁白如雪",
      "红色汁液鲜艳欲滴",
      "色泽从浑浊变得清澈",
    ],
    taste: ["试验时舌尖的微麻", "苦涩中带着草木的清香"],
    exampleParagraph: `她将猪胰脏捣烂，混入细筛过的豆粉和一点点石蜜，制成了最原始的"氨基酸洁面泥"。接着是"水炼法"——将猪板油切块，加水熬煮，撇去浮沫和杂质，只取上层清油。这种油脂洁白如雪，去除了腥臊味，结构接近人体皮脂，是极佳的封闭剂。`,
  },
};

// ==================== 开篇指导 ====================

const OPENING_GUIDELINES: OpeningGuideline = {
  type: "sensory",
  principles: [
    "第一句必须是具体的感官体验，优先使用触觉、嗅觉、听觉（非视觉）",
    '禁止使用抽象描述开头，如"突然"、"忽然"、"一阵"',
    "必须包含至少一个具体细节（温度数值、质地形容、声音特征）",
    "通过角色的感知引入场景，而非旁白说明",
    '开篇前三句必须让读者"进入"场景，而非"了解"场景',
    '使用对比增强感受（"不是XX，而是XX"）',
  ],
  forbidden: [
    "一阵XX袭来",
    "突然/忽然/顿时",
    "仿佛/好像/似乎（开头禁用）",
    "她感到/她觉得/她意识到",
    "这是一个XX的地方",
    "故事要从XX说起",
  ],
  examples: [
    {
      bad: "一阵剧烈的晕眩袭来，仿佛无数道电流在她的脑海中交错",
      good: "那种冷，不是空调房里恒温的凉意，而是一种湿冷，像无数条冰冷的小蛇顺着骨缝往里钻",
      explanation:
        "用具体的触觉体验（湿冷、骨缝）替代抽象的描述（晕眩、电流），用对比加深印象",
    },
    {
      bad: "她睁开眼睛，发现自己身处一个陌生的房间",
      good: "指尖触到的是一团硬邦邦、散发着陈腐霉味的絮状物。她下意识地想抓被子——不对，这不是被子。",
      explanation: "先触觉后视觉，用动作揭示发现，而非直接陈述",
    },
    {
      bad: "这里很安静，她能感受到一种压抑的氛围",
      good: "铜漏滴水的声音在空旷的厅堂里格外清晰，每一声都像敲在心尖上",
      explanation:
        '用具体的声音（铜漏滴水）替代抽象的"安静"，用听觉细节传达氛围',
    },
  ],
};

// ==================== 服务实现 ====================

@Injectable()
export class SensoryImmersionService {
  private readonly logger = new Logger(SensoryImmersionService.name);

  constructor() {
    // Logger is used for potential debugging in production
    void this.logger;
  }

  /**
   * 根据场景类型获取五感描写模板
   */
  getSensoryTemplate(
    sceneType:
      | "cold_dark"
      | "confrontation"
      | "luxurious"
      | "illness"
      | "crafting",
  ): SensoryTemplate {
    return SENSORY_TEMPLATES[sceneType];
  }

  /**
   * 根据关键词自动匹配场景类型
   */
  matchSceneType(sceneDescription: string): string[] {
    const matchedTypes: string[] = [];

    const keywords: Record<string, string[]> = {
      cold_dark: ["冷宫", "地牢", "监狱", "暴室", "阴暗", "幽暗", "囚禁"],
      confrontation: ["对峙", "威胁", "危险", "冲突", "审问", "质问"],
      luxurious: ["宫殿", "宴会", "华贵", "奢华", "昭阳殿", "未央宫"],
      illness: ["中毒", "受伤", "生病", "昏迷", "虚弱", "濒死"],
      crafting: ["制作", "实验", "调配", "炼制", "配方"],
    };

    for (const [type, words] of Object.entries(keywords)) {
      if (words.some((word) => sceneDescription.includes(word))) {
        matchedTypes.push(type);
      }
    }

    return matchedTypes.length > 0 ? matchedTypes : ["cold_dark"]; // 默认
  }

  /**
   * 生成开篇指导提示词
   */
  generateOpeningGuideline(): string {
    const parts: string[] = [];

    parts.push(`## 开篇黄金法则（第一段必须遵守）\n`);

    parts.push(`### 核心原则`);
    OPENING_GUIDELINES.principles.forEach((p, i) => {
      parts.push(`${i + 1}. ${p}`);
    });

    parts.push(`\n### 绝对禁止（开头三句）`);
    OPENING_GUIDELINES.forbidden.forEach((f) => {
      parts.push(`- ❌ "${f}"`);
    });

    parts.push(`\n### 对照示例`);
    OPENING_GUIDELINES.examples.forEach((ex, i) => {
      parts.push(`\n**示例${i + 1}**`);
      parts.push(`❌ 错误：${ex.bad}`);
      parts.push(`✅ 正确：${ex.good}`);
      parts.push(`💡 解析：${ex.explanation}`);
    });

    return parts.join("\n");
  }

  /**
   * 生成场景五感描写指导
   */
  generateSceneSensoryGuide(sceneTypes: string[]): string {
    const parts: string[] = [];

    parts.push(`## 本章五感描写指导\n`);
    parts.push(`以下是本章场景可用的五感描写参考，请至少使用三种感官：\n`);

    for (const type of sceneTypes) {
      const template = SENSORY_TEMPLATES[type];
      if (!template) continue;

      parts.push(
        `### ${template.sceneType}场景（${template.emotionalTone}）\n`,
      );

      parts.push(`**触觉**：`);
      parts.push(
        template.touch
          .slice(0, 3)
          .map((t) => `"${t}"`)
          .join("、"),
      );

      parts.push(`\n**嗅觉**：`);
      parts.push(
        template.smell
          .slice(0, 3)
          .map((s) => `"${s}"`)
          .join("、"),
      );

      parts.push(`\n**听觉**：`);
      parts.push(
        template.sound
          .slice(0, 3)
          .map((s) => `"${s}"`)
          .join("、"),
      );

      parts.push(`\n**视觉**：`);
      parts.push(
        template.sight
          .slice(0, 3)
          .map((s) => `"${s}"`)
          .join("、"),
      );

      if (template.exampleParagraph) {
        parts.push(`\n**参考段落**：`);
        parts.push(`「${template.exampleParagraph}」`);
      }

      parts.push(``);
    }

    return parts.join("\n");
  }

  /**
   * 生成完整的沉浸式写作约束
   */
  generateImmersionConstraints(
    chapterNumber: number,
    sceneDescription?: string,
  ): string {
    const parts: string[] = [];

    // 开篇指导（仅第一章强调）
    if (chapterNumber === 1) {
      parts.push(this.generateOpeningGuideline());
      parts.push(``);
    }

    // 场景五感指导
    if (sceneDescription) {
      const sceneTypes = this.matchSceneType(sceneDescription);
      parts.push(this.generateSceneSensoryGuide(sceneTypes));
    }

    // 通用五感要求
    parts.push(`## 五感描写通用要求\n`);
    parts.push(`1. 每个重要场景必须包含至少三种感官描写`);
    parts.push(`2. 优先使用非视觉感官（触觉、嗅觉、听觉）引入场景`);
    parts.push(`3. 感官描写要服务于情绪基调，不能脱节`);
    parts.push(`4. 用具体细节替代抽象形容词`);
    parts.push(`5. 通过对比增强感受（"不是XX，而是XX"）`);

    return parts.join("\n");
  }

  /**
   * 分析文本的感官丰富度
   */
  analyzeSensoryRichness(content: string): {
    score: number;
    details: Record<string, number>;
    suggestions: string[];
  } {
    const sensoryKeywords = {
      touch: [
        "冷",
        "热",
        "温",
        "凉",
        "湿",
        "干",
        "粗糙",
        "光滑",
        "柔软",
        "坚硬",
        "触",
        "摸",
        "握",
        "抓",
        "抚",
        "刺痛",
        "麻木",
        "颤抖",
      ],
      smell: [
        "香",
        "臭",
        "腥",
        "霉",
        "焦",
        "闻",
        "嗅",
        "气味",
        "味道",
        "芬芳",
        "恶臭",
      ],
      sound: [
        "声",
        "响",
        "鸣",
        "叫",
        "喊",
        "说",
        "笑",
        "哭",
        "听",
        "静",
        "噪",
        "嗡嗡",
        "沙沙",
        "叮当",
      ],
      sight: [
        "看",
        "见",
        "望",
        "瞧",
        "瞥",
        "光",
        "暗",
        "亮",
        "色",
        "影",
        "形",
        "红",
        "白",
        "黑",
        "青",
        "紫",
      ],
      taste: [
        "甜",
        "苦",
        "酸",
        "辣",
        "咸",
        "味",
        "尝",
        "吃",
        "喝",
        "咀嚼",
        "吞咽",
      ],
    };

    const details: Record<string, number> = {
      touch: 0,
      smell: 0,
      sound: 0,
      sight: 0,
      taste: 0,
    };

    for (const [sense, keywords] of Object.entries(sensoryKeywords)) {
      for (const keyword of keywords) {
        const regex = new RegExp(keyword, "g");
        const matches = content.match(regex);
        if (matches) {
          details[sense] += matches.length;
        }
      }
    }

    // 计算总分（归一化到 0-100）
    const total = Object.values(details).reduce((a, b) => a + b, 0);
    const contentLength = content.length;
    const score = Math.min(100, Math.round((total / contentLength) * 5000));

    // 生成建议
    const suggestions: string[] = [];
    const minThreshold = 3;

    if (details.touch < minThreshold) {
      suggestions.push("建议增加触觉描写（温度、质地、触感）");
    }
    if (details.smell < minThreshold) {
      suggestions.push("建议增加嗅觉描写（气味、香气、臭味）");
    }
    if (details.sound < minThreshold) {
      suggestions.push("建议增加听觉描写（声音、语气、环境音）");
    }

    return { score, details, suggestions };
  }
}
