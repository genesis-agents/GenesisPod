/**
 * NarrativeCraftService - 叙事工艺服务
 *
 * 核心职责：
 * - 禁止"说教式写法"（Tell not Show）
 * - 禁止总结式结尾
 * - 确保对话自然（非NPC式）
 * - 确保动机逻辑链条完整
 *
 * 设计理念：
 * 网文常见的"AI味"问题：
 * 1. "她知道，XXX是XXX的象征" - 直接告诉读者主题
 * 2. "她意识到，这意味着..." - 用意识代替行动
 * 3. "只要能掌控这份力量，就能..." - 总结式结尾
 * 4. "奴婢名唤XX，小姐您是XX的女儿" - NPC读设定集
 *
 * 解决方案：
 * - 用动作/反应代替心理解读
 * - 用具体场景代替抽象议论
 * - 用对话冲突代替信息灌输
 * - 用悬念代替总结
 */

import { Injectable, Logger } from "@nestjs/common";
import { AiChatService } from "../../../../ai-engine/llm/services/ai-chat.service";
import { TaskProfile } from "../../../../ai-engine/llm/types";

// ==================== 禁止模式库 ====================

/**
 * 说教式写法禁止模式
 * 这些句式会让读者感觉被"教导"，破坏沉浸感
 */
const PREACH_PATTERNS = {
  // "她知道"类 - 直接告诉读者角色的认知
  awareness: {
    patterns: [
      "她知道，",
      "他知道，",
      "她明白，",
      "他明白，",
      "她意识到，",
      "他意识到，",
      "她清楚，",
      "他清楚，",
      "她深知，",
      "他深知，",
    ],
    problem: "直接告诉读者角色知道什么，而非通过行动展示",
    fix: "用角色的具体行动或生理反应来暗示其认知",
    examples: [
      {
        bad: "她知道，作为后宫女子，美丽是生存的基础。",
        good: "她的手指不自觉地摸上了脸颊——这张脸，是她在这深宫中唯一的筹码。",
      },
      {
        bad: "他知道，这场战斗将决定他的命运。",
        good: "他握紧刀柄，指节发白。",
      },
    ],
  },

  // "是...的象征"类 - 直接点明主题
  symbolism: {
    patterns: [
      "是权力的象征",
      "是生存的基础",
      "是地位的体现",
      "意味着死亡",
      "意味着失败",
      "代表着希望",
      "象征着自由",
    ],
    problem: "直接解释象征意义，剥夺读者的解读空间",
    fix: "让象征物通过情节自然展现其意义",
    examples: [
      {
        bad: "在这个时代，妆容是权力的象征。",
        good: "太后扫了一眼她素净的面容，嘴角微微下撇。殿内的宫女们立刻低下了头。",
      },
    ],
  },

  // "她/他+情绪形容词"类 - 直接描述情绪
  emotion_telling: {
    patterns: [
      "她很紧张",
      "他很愤怒",
      "她感到恐惧",
      "他感到兴奋",
      "她内心充满",
      "他心中涌起",
      "她的心情",
      "他的情绪",
    ],
    problem: "直接告诉读者角色的情绪，而非通过表现展示",
    fix: "用生理反应、微表情、下意识动作来展示情绪",
    examples: [
      {
        bad: "她很紧张，心跳加速。",
        good: "她的手指不自觉地揪紧了袖口，指甲陷进掌心。",
      },
      {
        bad: "他很愤怒。",
        good: "他的太阳穴突突直跳，握着酒杯的手青筋暴起。",
      },
    ],
  },

  // 总结式句式 - 在叙事中间插入总结
  mid_summary: {
    patterns: [
      "总之，",
      "总而言之，",
      "换句话说，",
      "也就是说，",
      "这说明，",
      "由此可见，",
      "不难看出，",
    ],
    problem: "在叙事中插入议论式总结，打断故事流",
    fix: "删除这些总结，让情节自己说话",
    examples: [
      {
        bad: "总之，她必须尽快适应这个环境。",
        good: "（直接删除，或转为具体行动）她推开窗，深吸一口陌生的空气。",
      },
    ],
  },
};

/**
 * 结尾禁止模式
 * 这些句式会让结尾显得"总结式"，缺乏余韵
 */
const ENDING_PATTERNS = {
  // 预告式结尾
  foreshadowing_cliche: {
    patterns: [
      "而这一切，只是开始",
      "风暴即将来临",
      "命运的齿轮开始转动",
      "历史的洪流",
      "新的篇章",
      "故事才刚刚开始",
      "序幕就此拉开",
      "未来的方向也在逐渐明朗",
      "前路艰难",
      "前方的道路",
      "未知的挑战",
    ],
    problem: "空洞的预告，没有具体内容",
    fix: "用具体的悬念或未解决的冲突结尾",
  },

  // 感悟式结尾
  epiphany_cliche: {
    patterns: [
      "她终于明白",
      "他终于懂得",
      "此刻她才意识到",
      "这一刻他才知道",
      "她第一次感受到",
      "从此以后",
      "她明白了",
      "她懂得了",
      "或许这正是",
    ],
    problem: "把领悟直接告诉读者，而非让读者自己体会",
    fix: "用角色的沉默、动作或未完成的对话结尾",
  },

  // 决心式结尾 - 大幅扩展
  resolution_cliche: {
    patterns: [
      // 直接决心
      "她暗暗发誓",
      "他在心中立下誓言",
      "她决定",
      "他下定决心",
      "无论如何，她都要",
      "不管怎样，他都会",
      "她不会放弃",
      "他绝不认输",
      // 最新评估发现的问题模式
      "牢牢握住自己的命运",
      "绝不随波逐流",
      "找到掌控这一切的力量",
      "找到自己的一席之地",
      "改变这里的一切",
      "书写属于自己的篇章",
      "她要在这",
      "她必须在这",
      // 使命宣言式
      "只要她能",
      "只要他能",
      "既然命运已将她",
      "既然命运已将他",
      "她就不打算放弃",
      "她绝不会就此",
      "他绝不会就此",
      // 心中燃起式
      "心中燃起",
      "心中升起",
      "心底涌起",
      "胸中涌起",
      "一股力量",
      "一丝希望",
      "一丝斗志",
    ],
    problem: "用空洞的决心代替具体的行动计划",
    fix: "让角色做出一个具体的小行动，暗示其决心",
  },

  // 抒情式结尾
  lyrical_cliche: {
    patterns: [
      "夜色渐深，",
      "月光如水，",
      "繁星点点，",
      "长夜漫漫，",
      "岁月静好，",
      "闪烁着希望的光芒",
      "充满了温暖的气息",
      "逐渐拉近",
      "渐行渐近",
    ],
    problem: "用空洞的景色描写收尾，没有情节张力",
    fix: "景色描写要服务于情绪，且要有具体细节",
  },

  // 新增：总结陈词式结尾
  summary_statement: {
    patterns: [
      "至此，",
      "就这样，",
      "于是，",
      "如此一来，",
      "这便是",
      "这就是",
    ],
    problem: "用陈述句总结情节，缺乏戏剧张力",
    fix: "用动作或感官细节结尾，让读者自己感受",
  },
};

/**
 * NPC式对话禁止模式
 * 这些对话模式让角色像在读"设定集"
 */
const NPC_DIALOGUE_PATTERNS = {
  // 自我介绍式
  self_intro: {
    patterns: ["奴婢名唤", "在下姓", "我是XXX的", "小人乃是"],
    problem: "现实中人不会这样自我介绍背景设定",
    fix: "通过他人称呼、回忆、或自然流露来展示身份",
    examples: [
      {
        bad: '"奴婢名唤阿梅，小姐您是织染署染人的女儿，因得卫大人照拂才入宫供职。"',
        good: '"小姐！您可算醒了！"丫鬟扑到床边，"卫大人的人昨晚又来问过，奴婢都不知道怎么回了..."',
      },
    ],
  },

  // 背景灌输式
  info_dump: {
    patterns: ["您可知道", "您要知道", "我得告诉您", "有件事您必须知道"],
    problem: "为了灌输设定而强行安排对话",
    fix: "设定信息通过冲突、问题、误解来自然引出",
  },

  // 解释太多
  over_explain: {
    patterns: ["也就是说，", "换言之，", "简单来说，", "具体而言，"],
    problem: "角色在对话中像在做讲解",
    fix: "对话应该有潜台词、有省略、有误解",
  },
};

// ==================== Few-shot 优秀结尾示例 ====================

/**
 * 优秀章节结尾示例
 * 来源：顶级网文（诡秘之主、庆余年、琅琊榜等）的技法分析
 */
const EXCELLENT_ENDING_EXAMPLES = {
  // 悬念式结尾 - 抛出问题，不给答案
  suspense: [
    {
      type: "对话悬念",
      example: `"那个人，"老者放下茶盏，浑浊的眼珠突然锐利起来，"三十年前死在长安的那个人，其实是..."
门外突然传来一阵急促的脚步声。老者闭上了嘴。`,
      technique: "对话在关键信息前被打断，制造悬念",
    },
    {
      type: "行为悬念",
      example: `她将那封信折好，塞入袖中。然后，她推开了那扇从未有人敢推开的门。`,
      technique: "以一个大胆的行动收尾，读者想知道后果",
    },
    {
      type: "发现悬念",
      example: `她翻开盒盖，里面只有一张纸条，上面只写了两个字——
她的手开始发抖。`,
      technique: "隐藏关键信息，只展示角色反应",
    },
  ],

  // 动作定格 - 在一个具体动作中结束
  action_freeze: [
    {
      type: "离开",
      example: `他站起身，走到门口，却在推门的刹那停住了。
"有件事我忘了告诉你，"他没有回头，"你父亲，其实还活着。"
门被轻轻带上，脚步声渐行渐远。`,
      technique: "在门口/转身/离开时抛出炸弹",
    },
    {
      type: "沉默",
      example: `问完这句话，她就安静地看着他，不再说话。
火盆中的炭偶尔发出细微的噼啪声。
他始终没有回答。`,
      technique: "用沉默和环境音制造压迫感",
    },
    {
      type: "微小动作",
      example: `苏培盛躬身退出养心殿，临出门前，他看到皇上的手指轻轻敲了敲御案。
三下。
他的后背一下子被冷汗浸透了。`,
      technique: "一个细微动作暗示重大信息",
    },
  ],

  // 感官冲击 - 用感官细节结尾
  sensory: [
    {
      type: "嗅觉",
      example: `她推开门，一股浓烈的血腥气扑面而来。
屋内很安静。`,
      technique: "用气味暗示发生了什么，不直接描述",
    },
    {
      type: "听觉",
      example: `她躺在床上，听着窗外的雨声。
远处传来三更的梆子声，一下，两下，三下。
然后是一声极轻的脚步声——在她的门外停住了。`,
      technique: "声音渐近，制造紧张感",
    },
    {
      type: "触觉",
      example: `她将手伸入水中，指尖触到一个冰冷的、坚硬的东西。
圆形的，有棱角。
是一枚印章。`,
      technique: "通过触觉发现关键物品",
    },
  ],

  // 反转提示 - 暗示接下来有变化
  twist_hint: [
    {
      type: "发现异常",
      example: `她正要离开，目光无意中扫过桌案。
那封信——她明明放在左边的——现在却在桌案的正中央。
有人来过。`,
      technique: "发现不对劲的细节，暗示危机",
    },
    {
      type: "计划外变量",
      example: `一切都在按计划进行。
直到她在人群中看到了一张不该出现的脸。`,
      technique: "计划被意外打破",
    },
  ],
};

/**
 * 错误结尾示例对比
 * 每个示例包含原文（差）和改写（好）的对比
 */
const ENDING_REWRITE_EXAMPLES = [
  {
    bad: `苏薇的心中燃起一丝怒火与决心，不仅要活下去，更要找到掌控这一切的力量。`,
    good: `她走到窗前，指尖轻轻触上冰冷的窗棂。外面的夜色浓得像墨。
"阿翠，"她头也不回地问，"明天，是谁当值验粉？"`,
    analysis: "用具体的动作和问题代替抽象的决心宣言",
  },
  {
    bad: `即使未来迷雾重重，她也要牢牢握住自己的命运，绝不随波逐流。`,
    good: `她将那瓶粉末藏入袖中。
明天验粉时，该让谁来试这第一口呢？
她的嘴角微微上扬。`,
    analysis: "用具体的行动和心机代替空洞的使命宣言",
  },
  {
    bad: `她与韩延之间的距离却因这一份共同的追求而逐渐拉近。`,
    good: `"你真的相信，"韩延收起最后一个药瓶，"这世上的毒，都能被解？"
她没有回答。
炉火噼啪作响，映得两人的影子忽明忽暗。`,
    analysis: "用对话和环境收尾，留下开放性思考",
  },
  {
    bad: `在即将到来的考验面前，她的心中燃起一丝斗志。即使前路艰险，她也要用自己的智慧与能力，去挑战那些陈旧的规则。`,
    good: `她拿起那支细毫笔，在空白的竹简上落下第一个字。
"配方..."
门外传来脚步声，她迅速将竹简塞入袖中。
"苏姑娘，尚宫有请。"`,
    analysis: "动作被打断，制造紧张感和悬念",
  },
];

// ==================== 服务实现 ====================

export interface NarrativeCraftReport {
  /** 检测到的问题 */
  issues: Array<{
    type: "preach" | "ending" | "npc_dialogue";
    category: string;
    match: string;
    line: number;
    problem: string;
    suggestion: string;
  }>;
  /** 总体评分 0-100 */
  score: number;
  /** 是否通过 */
  passed: boolean;
}

@Injectable()
export class NarrativeCraftService {
  private readonly logger = new Logger(NarrativeCraftService.name);

  constructor(private readonly aiChatService: AiChatService) {}

  /**
   * 生成叙事工艺约束提示词
   * 用于在写作前注入，防止产生问题
   */
  generateNarrativeCraftConstraints(): string {
    const parts: string[] = [];

    parts.push(
      `## 【最高优先级】叙事工艺禁忌（必须严格遵守，违反将导致重写）\n`,
    );

    // 说教禁止
    parts.push(`### 1. 禁止"说教式写法"（Tell not Show）`);
    parts.push(`以下句式会破坏沉浸感，严禁使用：\n`);

    parts.push(`**禁止"她/他知道"类：**`);
    parts.push(`- ❌ "她知道，作为后宫女子，美丽是生存的基础。"`);
    parts.push(
      `- ✅ 改为动作：她的手指不自觉地摸上脸颊——这张脸，是她唯一的筹码。\n`,
    );

    parts.push(`**禁止"是...的象征"类：**`);
    parts.push(`- ❌ "在这个时代，妆容是权力的象征。"`);
    parts.push(`- ✅ 改为场景：太后扫了一眼她素净的面容，嘴角微微下撇。\n`);

    parts.push(`**禁止直接描述情绪：**`);
    parts.push(`- ❌ "她很紧张" / "他感到愤怒"`);
    parts.push(`- ✅ 用生理反应：她的手指揪紧袖口，指甲陷进掌心。\n`);

    // 结尾禁止 - 加强
    parts.push(`### 2. 【核心】章节结尾禁忌（这是最常见的问题！）`);
    parts.push(`章节必须在【具体场景/动作/对话】中结束，严禁以下结尾：\n`);
    parts.push(`**绝对禁止的结尾模式（出现任何一个都必须重写）：**`);
    parts.push(`- ❌ "只要她能掌控这份力量，就能..." （决心总结）`);
    parts.push(`- ❌ "既然命运已将她抛入...她就不打算放弃..." （使命宣言）`);
    parts.push(`- ❌ "而这一切，只是开始" / "风暴即将来临" （空洞预告）`);
    parts.push(`- ❌ "她终于明白..." / "此刻她才意识到..." （顿悟总结）`);
    parts.push(`- ❌ "心中燃起一丝斗志/希望/决心" （心理总结）`);
    parts.push(`- ❌ "牢牢握住自己的命运" / "绝不随波逐流" （鸡汤宣言）`);
    parts.push(
      `- ❌ "找到掌控这一切的力量" / "找到自己的一席之地" （空洞目标）`,
    );
    parts.push(`- ❌ "她与XX之间的距离逐渐拉近" （旁白总结）\n`);

    // Few-shot 示例
    parts.push(`**【重要】正确的结尾方式（请严格模仿以下示例）：**\n`);

    // 从 EXCELLENT_ENDING_EXAMPLES 中提取示例
    parts.push(`**示例1 - 悬念式：**`);
    parts.push(`\`\`\``);
    parts.push(EXCELLENT_ENDING_EXAMPLES.suspense[0].example);
    parts.push(`\`\`\``);
    parts.push(`技巧：${EXCELLENT_ENDING_EXAMPLES.suspense[0].technique}\n`);

    parts.push(`**示例2 - 动作定格：**`);
    parts.push(`\`\`\``);
    parts.push(EXCELLENT_ENDING_EXAMPLES.action_freeze[2].example);
    parts.push(`\`\`\``);
    parts.push(
      `技巧：${EXCELLENT_ENDING_EXAMPLES.action_freeze[2].technique}\n`,
    );

    parts.push(`**示例3 - 感官冲击：**`);
    parts.push(`\`\`\``);
    parts.push(EXCELLENT_ENDING_EXAMPLES.sensory[1].example);
    parts.push(`\`\`\``);
    parts.push(`技巧：${EXCELLENT_ENDING_EXAMPLES.sensory[1].technique}\n`);

    // 对比示例
    parts.push(`**【对比】错误结尾 vs 正确结尾：**\n`);
    for (const example of ENDING_REWRITE_EXAMPLES.slice(0, 2)) {
      parts.push(`❌ 错误：${example.bad}`);
      parts.push(`✅ 正确：`);
      parts.push(`\`\`\``);
      parts.push(example.good);
      parts.push(`\`\`\``);
      parts.push(`分析：${example.analysis}\n`);
    }

    // 对话禁止
    parts.push(`### 3. 对话自然度要求`);
    parts.push(`对话不能像NPC在"读设定集"：\n`);
    parts.push(`**禁止设定灌输式对话：**`);
    parts.push(
      `- ❌ "奴婢名唤阿梅，小姐您是织染署染人的女儿，因得卫大人照拂才入宫供职。"`,
    );
    parts.push(
      `- ✅ "小姐！您可算醒了！卫大人的人昨晚又来问过，奴婢都不知道怎么回了..."\n`,
    );
    parts.push(`**对话要有：**`);
    parts.push(`- 潜台词（说的和想的不一样）`);
    parts.push(`- 省略（熟人间不会解释已知信息）`);
    parts.push(`- 情绪（紧张、害怕、讨好、试探）`);
    parts.push(`- 冲突（意见不合、误解、隐瞒）\n`);

    // 动机逻辑
    parts.push(`### 4. 动机逻辑链条`);
    parts.push(`角色行动必须有合理的动机触发：\n`);
    parts.push(`**错误示例：**`);
    parts.push(`- 主角刚穿越醒来 → 立刻开始做胭脂`);
    parts.push(`- 问题：缺乏紧迫性触发，为什么非要现在做？\n`);
    parts.push(`**正确示例：**`);
    parts.push(
      `- 主角刚穿越醒来 → 丫鬟说"半个时辰后尚宫要来验人" → 照镜发现面色惨白 → 必须立刻补妆`,
    );
    parts.push(`- 动机链完整：外部压力 + 发现问题 + 必须行动\n`);

    return parts.join("\n");
  }

  /**
   * 分析内容中的叙事问题
   * 用于后置检查
   */
  analyzeContent(content: string): NarrativeCraftReport {
    const lines = content.split("\n");
    const issues: NarrativeCraftReport["issues"] = [];

    // 检查说教模式
    for (const [category, config] of Object.entries(PREACH_PATTERNS)) {
      for (const pattern of config.patterns) {
        lines.forEach((line, index) => {
          if (line.includes(pattern)) {
            issues.push({
              type: "preach",
              category,
              match: pattern,
              line: index + 1,
              problem: config.problem,
              suggestion: config.fix,
            });
          }
        });
      }
    }

    // 检查结尾模式（只检查最后5行）
    const lastLines = lines.slice(-5);
    for (const [category, config] of Object.entries(ENDING_PATTERNS)) {
      for (const pattern of config.patterns) {
        lastLines.forEach((line, index) => {
          if (line.includes(pattern)) {
            issues.push({
              type: "ending",
              category,
              match: pattern,
              line: lines.length - 5 + index + 1,
              problem: config.problem,
              suggestion: config.fix,
            });
          }
        });
      }
    }

    // 检查NPC对话模式
    for (const [category, config] of Object.entries(NPC_DIALOGUE_PATTERNS)) {
      for (const pattern of config.patterns) {
        lines.forEach((line, index) => {
          if (line.includes(pattern)) {
            issues.push({
              type: "npc_dialogue",
              category,
              match: pattern,
              line: index + 1,
              problem: config.problem,
              suggestion: config.fix,
            });
          }
        });
      }
    }

    // 计算分数
    const preachCount = issues.filter((i) => i.type === "preach").length;
    const endingCount = issues.filter((i) => i.type === "ending").length;
    const dialogueCount = issues.filter(
      (i) => i.type === "npc_dialogue",
    ).length;

    // 每个问题扣分
    const score = Math.max(
      0,
      100 - preachCount * 10 - endingCount * 20 - dialogueCount * 15,
    );

    if (issues.length > 0) {
      this.logger.warn(
        `[NarrativeCraft] Found ${issues.length} issues: ${preachCount} preach, ${endingCount} ending, ${dialogueCount} dialogue`,
      );
    }

    return {
      issues,
      score,
      passed: score >= 60,
    };
  }

  /**
   * 生成修复建议
   */
  generateFixSuggestions(report: NarrativeCraftReport): string {
    if (report.issues.length === 0) {
      return "叙事工艺检查通过，无需修改。";
    }

    const parts: string[] = [];
    parts.push(`## 叙事工艺问题修复建议\n`);
    parts.push(`检测到 ${report.issues.length} 个问题，需要修改：\n`);

    // 按类型分组
    const preachIssues = report.issues.filter((i) => i.type === "preach");
    const endingIssues = report.issues.filter((i) => i.type === "ending");
    const dialogueIssues = report.issues.filter(
      (i) => i.type === "npc_dialogue",
    );

    if (preachIssues.length > 0) {
      parts.push(`### 说教式写法问题（${preachIssues.length}处）`);
      for (const issue of preachIssues.slice(0, 3)) {
        parts.push(`- 第${issue.line}行: "${issue.match}"`);
        parts.push(`  问题: ${issue.problem}`);
        parts.push(`  建议: ${issue.suggestion}\n`);
      }
    }

    if (endingIssues.length > 0) {
      parts.push(`### 结尾问题（${endingIssues.length}处）`);
      for (const issue of endingIssues) {
        parts.push(`- 第${issue.line}行: "${issue.match}"`);
        parts.push(`  问题: ${issue.problem}`);
        parts.push(`  建议: ${issue.suggestion}\n`);
      }
    }

    if (dialogueIssues.length > 0) {
      parts.push(`### 对话问题（${dialogueIssues.length}处）`);
      for (const issue of dialogueIssues.slice(0, 3)) {
        parts.push(`- 第${issue.line}行: "${issue.match}"`);
        parts.push(`  问题: ${issue.problem}`);
        parts.push(`  建议: ${issue.suggestion}\n`);
      }
    }

    return parts.join("\n");
  }

  /**
   * ★★★ 自动重写章节结尾
   * 当检测到结尾问题时，自动调用 LLM 重写最后几段
   *
   * @param content 完整章节内容
   * @param issues 检测到的结尾问题
   * @returns 重写后的完整章节内容
   */
  async rewriteEnding(
    content: string,
    issues: NarrativeCraftReport["issues"],
  ): Promise<string> {
    // 只处理结尾问题
    const endingIssues = issues.filter((i) => i.type === "ending");
    if (endingIssues.length === 0) {
      return content;
    }

    this.logger.log(
      `[NarrativeCraft] Rewriting ending due to ${endingIssues.length} issues`,
    );

    // 提取最后 3 段作为需要重写的部分
    const paragraphs = content.split(/\n\s*\n/).filter((p) => p.trim());
    if (paragraphs.length < 2) {
      return content; // 内容太短，不处理
    }

    const lastParagraphsCount = Math.min(3, paragraphs.length);
    const beforePart = paragraphs.slice(0, -lastParagraphsCount).join("\n\n");
    const endingPart = paragraphs.slice(-lastParagraphsCount).join("\n\n");

    // 构建重写提示词
    const systemPrompt = `你是一位专业的小说编辑，负责修复章节结尾问题。

## 核心任务
重写以下章节结尾，将抽象的总结/感悟改为具体的场景/动作/对话。

## 禁止的结尾模式
- ❌ "她知道，这只是开始" 类预告
- ❌ "命运的齿轮开始转动" 类抒情
- ❌ "她终于明白了..." 类顿悟
- ❌ "心中燃起斗志/决心" 类心理描写
- ❌ "未来的路还很长" 类空洞总结

## 正确的结尾方式
章节应在以下任一方式中自然结束：
- ✅ 一个具体的动作（门被关上、脚步声远去）
- ✅ 一句意味深长的对话
- ✅ 一个感官细节（烛火熄灭、风声呼啸）
- ✅ 一个悬念（留下未解决的问题）

## Few-shot 示例

### 示例1
❌ 原文：
苏薇的心中燃起一丝怒火与决心，不仅要活下去，更要找到掌控这一切的力量。

✅ 改为：
她走到窗前，指尖轻轻触上冰冷的窗棂。外面的夜色浓得像墨。
"阿翠，"她头也不回地问，"明天，是谁当值验粉？"

### 示例2
❌ 原文：
她知道，这一切才刚刚开始，未来的挑战还有很多，但她已经做好了准备。

✅ 改为：
铜盆里的水已经凉透，她却仍盯着水面出神。
远处传来更鼓声，一下，两下，三下。
她终于动了，将袖口挽起，露出腕上那道已经结痂的伤痕。

## 输出要求
- 只输出重写后的结尾段落
- 保持与前文风格一致
- 不要添加任何解释或说明`;

    const userPrompt = `## 问题诊断
${endingIssues.map((i) => `- 第${i.line}行: ${i.problem}`).join("\n")}

## 前文内容（保持一致性）
${beforePart.slice(-500)}

## 需要重写的结尾
${endingPart}

请重写以上结尾，使其在具体的动作/对话/场景中自然结束：`;

    const taskProfile: TaskProfile = {
      creativity: "high", // 创意写作需要高创造性
      outputLength: "short", // 只重写结尾，不需要太长
    };

    // 重试机制：最多尝试3次
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.aiChatService.chat({
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          taskProfile,
          temperature: 0.8 + (attempt - 1) * 0.05, // 每次重试稍微提高温度
          maxTokens: 1000,
        });

        const newEnding = response.content?.trim();
        if (!newEnding) {
          this.logger.warn(
            `[NarrativeCraft] Rewrite attempt ${attempt}/${maxRetries} failed: empty response`,
          );
          if (attempt < maxRetries) {
            // 等待一小段时间后重试
            await new Promise((resolve) => setTimeout(resolve, 500));
            continue;
          }
          this.logger.error(
            "[NarrativeCraft] All rewrite attempts failed with empty response",
          );
          return content;
        }

        // 验证重写后的结尾是否仍有问题
        const rewriteReport = this.analyzeContent(newEnding);
        const stillHasEndingIssues = rewriteReport.issues.some(
          (i) => i.type === "ending",
        );

        if (stillHasEndingIssues) {
          this.logger.warn(
            "[NarrativeCraft] Rewritten ending still has issues, keeping original",
          );
          return content;
        }

        // 拼接新内容
        const newContent = beforePart
          ? `${beforePart}\n\n${newEnding}`
          : newEnding;

        this.logger.log("[NarrativeCraft] Ending rewritten successfully");
        return newContent;
      } catch (error) {
        this.logger.warn(
          `[NarrativeCraft] Rewrite attempt ${attempt}/${maxRetries} failed: ${error}`,
        );
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, 500));
          continue;
        }
        this.logger.error(`[NarrativeCraft] All rewrite attempts failed`);
        return content;
      }
    }

    // 不应该到达这里，但作为安全返回
    return content;
  }
}
