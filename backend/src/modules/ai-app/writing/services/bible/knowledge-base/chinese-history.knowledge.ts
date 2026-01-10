/**
 * 中国历史知识库 - Chinese History Knowledge Base
 *
 * 涵盖主要朝代的：
 * - 时间范围、都城、疆域
 * - 政治制度、官职体系
 * - 社会结构、等级制度
 * - 经济、文化、科技
 * - 重要人物、重大事件
 * - 日常生活细节
 *
 * 数据来源：综合史籍资料
 * 用途：为AI写作提供历史准确性参考
 */

// ==================== 类型定义 ====================

export interface Dynasty {
  /** 朝代名称 */
  name: string;
  /** 别称 */
  aliases: string[];
  /** 时间范围 */
  period: {
    start: number; // 公元年（负数为公元前）
    end: number;
    description: string;
  };
  /** 都城 */
  capitals: Array<{
    name: string;
    modernLocation: string;
    period?: string;
    description?: string;
  }>;
  /** 政治制度 */
  politics: {
    system: string;
    centralGov: OfficialSystem;
    localGov: string;
    military: string;
    selection: string; // 选官制度
  };
  /** 社会结构 */
  society: {
    classes: SocialClass[];
    genderRoles: string;
    family: string;
    customs: string[];
  };
  /** 后宫制度（如适用） */
  harem?: HaremSystem;
  /** 经济 */
  economy: {
    agriculture: string;
    commerce: string;
    currency: string[];
    taxation: string;
  };
  /** 文化 */
  culture: {
    literature: string[];
    art: string[];
    philosophy: string[];
    religion: string[];
  };
  /** 科技 */
  technology: string[];
  /** 日常生活 */
  dailyLife: DailyLife;
  /** 称谓系统 */
  honorifics: HonorificSystem;
  /** 禁忌 */
  taboos: Taboo[];
  /** 重要人物 */
  notableFigures: NotableFigure[];
  /** 重大事件 */
  majorEvents: HistoricalEvent[];
  /** 重要术语 */
  terminology: Record<string, string>;
  /** 写作注意事项 */
  writingNotes: string[];
}

export interface OfficialSystem {
  name: string;
  description: string;
  ranks: Array<{
    rank: number;
    title: string;
    duties: string;
    salary?: string;
  }>;
}

export interface SocialClass {
  name: string;
  description: string;
  privileges: string[];
  restrictions: string[];
  percentage?: string; // 人口占比
}

export interface HaremSystem {
  ranks: Array<{
    rank: number;
    title: string;
    count?: number; // 定额人数
    privileges: string;
  }>;
  management: string;
  rules: string[];
}

export interface DailyLife {
  clothing: ClothingSystem;
  food: FoodSystem;
  housing: string;
  transportation: string[];
  entertainment: string[];
  etiquette: string[];
}

export interface ClothingSystem {
  male: string[];
  female: string[];
  colors: {
    royal: string[];
    official: string[];
    common: string[];
    forbidden: string[];
  };
  accessories: string[];
  notes: string[];
}

export interface FoodSystem {
  staples: string[];
  meats: string[];
  vegetables: string[];
  seasonings: string[];
  drinks: string[];
  tableware: string[];
  notes: string[];
}

export interface HonorificSystem {
  emperor: Record<string, string>;
  empress: Record<string, string>;
  officials: Record<string, string>;
  common: Record<string, string>;
  selfReferences: Record<string, string>;
}

export interface Taboo {
  type: "naming" | "behavior" | "speech" | "dress" | "other";
  description: string;
  consequence: string;
  examples?: string[];
}

export interface NotableFigure {
  name: string;
  title?: string;
  period: string;
  role: string;
  significance: string;
  relatedEvents?: string[];
}

export interface HistoricalEvent {
  name: string;
  year: string;
  description: string;
  significance: string;
  relatedFigures?: string[];
}

// ==================== 西汉 (前202-8) ====================

export const WESTERN_HAN: Dynasty = {
  name: "西汉",
  aliases: ["前汉", "汉朝"],
  period: {
    start: -202,
    end: 8,
    description: "刘邦建立，王莽篡位结束，共210年",
  },
  capitals: [
    {
      name: "长安",
      modernLocation: "陕西西安",
      description: "西汉都城，当时世界最大城市之一，人口约50万",
    },
  ],
  politics: {
    system: "中央集权的郡国并行制",
    centralGov: {
      name: "三公九卿制",
      description: "三公为最高行政长官，九卿分管具体事务",
      ranks: [
        { rank: 1, title: "丞相", duties: "总理朝政，百官之长" },
        { rank: 1, title: "太尉", duties: "掌管军事" },
        { rank: 1, title: "御史大夫", duties: "监察百官，副丞相" },
        { rank: 2, title: "太常", duties: "掌管宗庙祭祀" },
        { rank: 2, title: "光禄勋", duties: "掌管宫殿门户、皇帝侍卫" },
        { rank: 2, title: "卫尉", duties: "掌管宫门卫屯兵" },
        { rank: 2, title: "太仆", duties: "掌管皇帝车马" },
        { rank: 2, title: "廷尉", duties: "掌管刑狱" },
        { rank: 2, title: "大鸿胪", duties: "掌管外交、朝会礼仪" },
        { rank: 2, title: "宗正", duties: "掌管皇族事务" },
        { rank: 2, title: "大司农", duties: "掌管财政税收" },
        { rank: 2, title: "少府", duties: "掌管皇室财物、宫廷手工业" },
      ],
    },
    localGov: "郡县制为主，封国并存。郡设太守，县设县令/长",
    military: "中央军（南军、北军）+ 地方军（郡国兵）+ 边防军",
    selection: "察举制（举孝廉、茂才）+ 征辟制",
  },
  society: {
    classes: [
      {
        name: "皇族",
        description: "刘姓皇室及外戚",
        privileges: ["封王封侯", "食邑", "免赋役"],
        restrictions: ["受监控", "不可干预朝政（理论上）"],
      },
      {
        name: "列侯",
        description: "功臣及其后代",
        privileges: ["食邑", "世袭", "见官不跪"],
        restrictions: ["不可擅离封地"],
      },
      {
        name: "官僚",
        description: "各级官员",
        privileges: ["俸禄", "免赋役", "子弟入仕便利"],
        restrictions: ["受考课", "丁忧守制"],
      },
      {
        name: "士人",
        description: "读书人、候选官员",
        privileges: ["免体罚", "科举入仕"],
        restrictions: ["需遵守礼教"],
      },
      {
        name: "庶民",
        description: "农工商",
        privileges: ["可买卖土地", "可从军晋升"],
        restrictions: ["赋税、徭役", "服色限制"],
        percentage: "约90%",
      },
      {
        name: "奴婢",
        description: "官私奴婢",
        privileges: ["无"],
        restrictions: ["依附主人", "可买卖"],
      },
    ],
    genderRoles:
      "儒家礼教约束，但尚不严苛。女性可再嫁，太后可临朝称制。普通女性主内，但可参与家庭经济。",
    family: "宗法制，嫡长子继承。三从四德开始形成但尚未固化。",
    customs: [
      "席地而坐（无椅子）",
      "分餐制",
      "冠礼（男子成年）",
      "笄礼（女子成年）",
      "婚礼六礼",
      "丧服制度（斩衰、齐衰等）",
    ],
  },
  harem: {
    ranks: [
      {
        rank: 1,
        title: "皇后",
        count: 1,
        privileges: "正妻，母仪天下，居椒房殿",
      },
      { rank: 2, title: "夫人", privileges: "仅次于皇后" },
      { rank: 3, title: "美人", privileges: "可侍寝" },
      { rank: 4, title: "良人", privileges: "可侍寝" },
      { rank: 5, title: "八子", privileges: "可侍寝" },
      { rank: 6, title: "七子", privileges: "可侍寝" },
      { rank: 7, title: "长使", privileges: "可侍寝" },
      { rank: 8, title: "少使", privileges: "可侍寝" },
    ],
    management: "掖庭令、掖庭丞管理后宫事务",
    rules: [
      "皇后由皇帝册封，需太后同意",
      "妃嫔晋升由皇帝决定",
      "生育皇子可晋升",
      "妃嫔不可干预朝政（理论上）",
      "后宫有专门的服饰、器用规格",
    ],
  },
  economy: {
    agriculture: "铁犁牛耕推广，精耕细作，以粟（小米）为主粮",
    commerce: "盐铁官营，商人地位低但有富商大贾",
    currency: ["五铢钱（主要货币）", "黄金（大额交易）", "布帛（实物货币）"],
    taxation: "田租（三十税一）、人头税（口赋、算赋）、徭役",
  },
  culture: {
    literature: ["《史记》", "《楚辞》", "赋体文学", "乐府诗"],
    art: ["画像石", "漆器", "丝织", "玉器"],
    philosophy: ["儒学独尊", "黄老之学", "阴阳五行"],
    religion: ["祖先崇拜", "天地祭祀", "神仙方术"],
  },
  technology: [
    "造纸术萌芽",
    "铁器普及",
    "水利工程（都江堰扩建）",
    "丝绸之路开通",
    "天文历法（太初历）",
  ],
  dailyLife: {
    clothing: {
      male: ["深衣（直裾、曲裾）", "袍服", "襦", "裤（胫衣）", "履/舄"],
      female: ["深衣（曲裾为主）", "襦裙", "帔（披肩）"],
      colors: {
        royal: ["黄色（皇帝专用）", "紫色（尊贵）"],
        official: ["黑色（正式）", "红色（喜庆）"],
        common: ["白色", "青色", "褐色"],
        forbidden: ["黄色（庶民禁用）"],
      },
      accessories: [
        "冠（男，20种以上）",
        "笄（女，束发）",
        "佩玉",
        "印绶（官员）",
      ],
      notes: [
        "上衣下裳为正式礼服",
        "深衣为日常服饰",
        "交领右衽（左衽为夷狄或死者）",
      ],
    },
    food: {
      staples: ["粟（小米）", "麦", "稻（南方）", "豆"],
      meats: ["羊肉（最贵重）", "猪肉", "牛肉（少，牛用于耕作）", "鸡、鱼"],
      vegetables: ["葵（百菜之主）", "韭", "葱", "蒜", "萝卜"],
      seasonings: ["盐", "酱", "醋", "蜜", "花椒"],
      drinks: ["酒（米酒、黍酒）", "浆（发酵饮料）", "水"],
      tableware: ["漆器（贵）", "陶器", "铜器", "竹木器"],
      notes: [
        "无辣椒、番茄、玉米、花生（美洲作物）",
        "无炒菜（缺少植物油）",
        "以煮、蒸、烤为主",
        "无白砂糖（用蜜、饴糖）",
      ],
    },
    housing: "院落式建筑，坐北朝南。贵族多进院落。室内铺席坐卧，无椅凳。",
    transportation: ["牛车（尊贵）", "马车", "骑马", "驴车", "步行"],
    entertainment: ["六博（棋戏）", "投壶", "蹴鞠", "歌舞", "百戏", "狩猎"],
    etiquette: [
      "跪坐为正式坐姿",
      "作揖为常礼",
      "叩首为大礼",
      "见尊者需避席而立",
      "食不语",
    ],
  },
  honorifics: {
    emperor: {
      他称: "陛下、天子、圣上、皇上",
      自称: "朕、寡人",
    },
    empress: {
      太后: "太后、母后",
      皇后: "皇后、中宫",
      妃嫔: "娘娘、夫人",
    },
    officials: {
      尊称: "大人、明府、君",
      同辈: "君、足下",
      下属: "尔、汝",
    },
    common: {
      尊称: "君、公、先生、郎君、娘子",
      谦称: "鄙人、愚、仆、妾",
    },
    selfReferences: {
      皇帝: "朕",
      臣子: "臣",
      女性: "妾、奴婢",
      百姓: "小人、草民",
    },
  },
  taboos: [
    {
      type: "naming",
      description: "避讳皇帝名字",
      consequence: "可能被治罪",
      examples: ["汉武帝刘彻，需避'彻'字，改用'通'"],
    },
    {
      type: "dress",
      description: "不可僭越服色",
      consequence: "大不敬之罪",
      examples: ["庶民不可穿黄色", "非官员不可用绶带"],
    },
    {
      type: "behavior",
      description: "不可直视天子",
      consequence: "失仪之罪",
    },
    {
      type: "speech",
      description: "不可妄议朝政",
      consequence: "可能被治罪",
    },
  ],
  notableFigures: [
    {
      name: "刘邦",
      title: "汉高祖",
      period: "前256-前195",
      role: "开国皇帝",
      significance: "建立汉朝，奠定四百年基业",
    },
    {
      name: "刘彻",
      title: "汉武帝",
      period: "前156-前87",
      role: "第七位皇帝",
      significance: "独尊儒术，开拓疆土，开通丝绸之路",
      relatedEvents: ["罢黜百家独尊儒术", "征伐匈奴", "张骞出使西域"],
    },
    {
      name: "卫青",
      period: "?-前106",
      role: "将军、大司马",
      significance: "抗击匈奴名将，皇后卫子夫之弟",
    },
    {
      name: "霍去病",
      period: "前140-前117",
      role: "骠骑将军",
      significance: "少年名将，封狼居胥",
    },
    {
      name: "司马迁",
      period: "约前145-?",
      role: "史学家、文学家",
      significance: "著《史记》，被誉为'史家之绝唱'",
    },
  ],
  majorEvents: [
    {
      name: "楚汉之争",
      year: "前206-前202",
      description: "刘邦与项羽争夺天下",
      significance: "汉朝建立的过程",
    },
    {
      name: "白登之围",
      year: "前200",
      description: "刘邦被匈奴围困",
      significance: "此后采取和亲政策",
    },
    {
      name: "七国之乱",
      year: "前154",
      description: "七个诸侯王叛乱",
      significance: "加强中央集权",
    },
    {
      name: "罢黜百家独尊儒术",
      year: "前134",
      description: "汉武帝采纳董仲舒建议",
      significance: "儒学成为官方意识形态",
    },
    {
      name: "张骞出使西域",
      year: "前138/前119",
      description: "两次出使西域",
      significance: "开通丝绸之路",
    },
  ],
  terminology: {
    长安: "西汉都城，今陕西西安，当时世界最大城市之一",
    未央宫: "皇帝主要居住和办公的宫殿",
    长乐宫: "太后居所，也是重要政治场所",
    少府: "掌管皇室财物和宫廷手工业的机构",
    织染署: "少府下属，负责宫廷织染事务",
    尚方: "少府下属，制作御用器物",
    掖庭: "后宫管理机构，掖庭令为长官",
    暴室: "宫中惩罚宫人的场所，条件恶劣",
    椒房: "皇后居所（以椒和泥涂墙，取温暖多子之意）",
    东宫: "太子居所",
    诏书: "皇帝的命令文书",
    策书: "任命官员的文书",
    虎符: "调兵凭证，分为两半",
  },
  writingNotes: [
    "注意避讳：如写汉武帝时期，人物对话中不可直接说'彻'字",
    "称谓要准确：不同身份用不同称呼，不可混用",
    "无椅子：所有坐姿都是跪坐或盘腿坐",
    "无炒菜：烹饪方式以煮、蒸、烤为主",
    "无棉花：保暖主要靠丝绸、麻布夹层、皮毛",
    "货币单位：钱（铜钱）、金（黄金，以斤计）",
    "时间称呼：辰时、巳时等十二时辰",
    "女性地位：相对后世较高，但仍受礼教约束",
  ],
};

// ==================== 唐代 (618-907) ====================

export const TANG: Dynasty = {
  name: "唐代",
  aliases: ["唐朝", "李唐"],
  period: {
    start: 618,
    end: 907,
    description: "李渊建立，朱温篡位结束，共289年",
  },
  capitals: [
    {
      name: "长安",
      modernLocation: "陕西西安",
      period: "主都",
      description: "世界最大城市，人口约百万",
    },
    {
      name: "洛阳",
      modernLocation: "河南洛阳",
      period: "东都",
      description: "武则天时期为主都",
    },
  ],
  politics: {
    system: "中央集权的三省六部制",
    centralGov: {
      name: "三省六部制",
      description: "中书省草拟、门下省审核、尚书省执行",
      ranks: [
        {
          rank: 1,
          title: "同中书门下平章事",
          duties: "宰相，实际最高行政长官",
        },
        { rank: 2, title: "中书令", duties: "中书省长官，草拟诏令" },
        { rank: 2, title: "门下侍中", duties: "门下省长官，审核诏令" },
        { rank: 2, title: "尚书令", duties: "尚书省长官（后虚设）" },
        { rank: 3, title: "六部尚书", duties: "吏户礼兵刑工六部长官" },
      ],
    },
    localGov: "道-州-县三级制，道设节度使/观察使",
    military: "府兵制（前期）→募兵制（中后期），节度使掌地方军政",
    selection: "科举制为主（进士、明经等）+ 门荫制",
  },
  society: {
    classes: [
      {
        name: "皇族",
        description: "李姓皇室",
        privileges: ["封王", "食邑"],
        restrictions: ["受监控"],
      },
      {
        name: "士族",
        description: "五姓七望等门阀大族",
        privileges: ["婚姻网络", "文化资源"],
        restrictions: ["科举改变格局"],
      },
      {
        name: "官僚",
        description: "科举出身及门荫官员",
        privileges: ["俸禄", "免役"],
        restrictions: ["考课"],
      },
      {
        name: "庶民",
        description: "良人",
        privileges: ["可科举入仕", "可买卖土地"],
        restrictions: ["赋役"],
        percentage: "约85%",
      },
      {
        name: "贱民",
        description: "奴婢、部曲、杂户",
        privileges: ["无"],
        restrictions: ["依附主人"],
      },
    ],
    genderRoles:
      "唐代女性地位较高，可骑马、着胡服、参与社交。武则天称帝。但礼教约束仍在。",
    family: "宗法制，但个人自由度较高，女性可主动和离（离婚）。",
    customs: [
      "渐用椅凳（高坐）",
      "饮茶风尚",
      "胡风盛行（胡服、胡乐、胡食）",
      "节日众多（上元、寒食、重阳等）",
    ],
  },
  harem: {
    ranks: [
      { rank: 1, title: "皇后", count: 1, privileges: "正妻" },
      {
        rank: 2,
        title: "四妃（贵妃、淑妃、德妃、贤妃）",
        count: 4,
        privileges: "一品",
      },
      { rank: 3, title: "九嫔", count: 9, privileges: "二品" },
      { rank: 4, title: "婕妤", count: 9, privileges: "三品" },
      { rank: 5, title: "美人", count: 9, privileges: "四品" },
      { rank: 6, title: "才人", count: 9, privileges: "五品" },
      { rank: 7, title: "宝林等", privileges: "六品以下" },
    ],
    management: "内侍省、宫闱局管理",
    rules: [
      "后宫等级森严",
      "贵妃地位可超皇后（如杨贵妃）",
      "宫人出路：晋升、放出、出家",
    ],
  },
  economy: {
    agriculture: "均田制（前期）→土地兼并，水稻种植扩大",
    commerce: "商业繁荣，长安有东西两市，夜市出现（后期）",
    currency: ["开元通宝", "飞钱（汇票雏形）"],
    taxation: "租庸调制（前期）→两税法（780年后）",
  },
  culture: {
    literature: ["唐诗黄金时代", "传奇小说", "变文"],
    art: ["书法（颜真卿、柳公权）", "绘画（吴道子）", "乐舞", "雕塑"],
    philosophy: ["儒学复兴", "佛学鼎盛", "道教发展"],
    religion: ["佛教（禅宗、密宗）", "道教", "景教、祆教、摩尼教传入"],
  },
  technology: [
    "雕版印刷",
    "火药（军事应用）",
    "瓷器（越窑、邢窑）",
    "造船航海",
    "天文（僧一行）",
  ],
  dailyLife: {
    clothing: {
      male: ["圆领袍", "幞头", "靴"],
      female: ["襦裙", "半臂", "帔帛", "胡服", "高髻"],
      colors: {
        royal: ["黄色", "紫色"],
        official: [
          "紫（三品以上）",
          "绯（四五品）",
          "绿（六七品）",
          "青（八九品）",
        ],
        common: ["白", "皂"],
        forbidden: ["黄色（庶民禁用）"],
      },
      accessories: ["幞头", "玉带", "钗钿", "步摇"],
      notes: ["女性服饰开放", "胡服流行", "袒胸装一度盛行"],
    },
    food: {
      staples: ["面食（饼、面条）", "米", "粟"],
      meats: ["羊肉", "猪肉", "鱼", "鸡鸭"],
      vegetables: ["蔬菜品种丰富", "菠菜（菠薐）传入"],
      seasonings: ["盐", "酱", "醋", "糖（蔗糖普及）", "胡椒"],
      drinks: ["茶（陆羽《茶经》）", "酒", "乳酪"],
      tableware: ["瓷器普及", "金银器（贵族）"],
      notes: [
        "饼（各种面食总称）",
        "胡食流行（胡饼等）",
        "饮茶风尚形成",
        "无辣椒、番茄",
      ],
    },
    housing: "坊市制，贵族府邸有园林，渐用桌椅",
    transportation: ["马车", "牛车", "骑马（女性也可）", "骆驼（丝路）"],
    entertainment: ["诗酒唱和", "歌舞", "马球", "斗鸡", "博戏"],
    etiquette: ["渐用椅坐", "作揖叉手", "叩首"],
  },
  honorifics: {
    emperor: {
      他称: "陛下、圣人、大家、至尊",
      自称: "朕",
    },
    empress: {
      太后: "太后",
      皇后: "皇后、梓童",
      妃嫔: "娘娘、娘子",
    },
    officials: {
      宰相: "相公",
      上级: "大人、明公",
      同辈: "郎君、足下",
    },
    common: {
      男性: "郎君、郎",
      女性: "娘子、娘",
      长辈: "阿郎、阿娘",
    },
    selfReferences: {
      皇帝: "朕",
      臣子: "臣",
      女性: "妾、奴奴",
      百姓: "小的、某",
    },
  },
  taboos: [
    {
      type: "naming",
      description: "避讳皇帝名字及祖先名",
      consequence: "可能被治罪",
      examples: ["避'世'字（李世民）", "避'虎'字（李渊祖父李虎）"],
    },
    {
      type: "dress",
      description: "服色有等级规定",
      consequence: "僭越罪",
    },
  ],
  notableFigures: [
    {
      name: "李世民",
      title: "唐太宗",
      period: "598-649",
      role: "第二位皇帝",
      significance: "贞观之治，被尊为明君典范",
    },
    {
      name: "武则天",
      period: "624-705",
      role: "女皇帝",
      significance: "中国历史上唯一的女皇帝",
    },
    {
      name: "李白",
      period: "701-762",
      role: "诗人",
      significance: "诗仙，浪漫主义诗歌顶峰",
    },
    {
      name: "杜甫",
      period: "712-770",
      role: "诗人",
      significance: "诗圣，现实主义诗歌顶峰",
    },
    {
      name: "杨玉环",
      title: "杨贵妃",
      period: "719-756",
      role: "贵妃",
      significance: "四大美人之一，与玄宗故事流传",
    },
  ],
  majorEvents: [
    {
      name: "玄武门之变",
      year: "626",
      description: "李世民杀兄弟夺位",
      significance: "唐太宗即位",
    },
    {
      name: "贞观之治",
      year: "627-649",
      description: "唐太宗统治时期",
      significance: "盛世典范",
    },
    {
      name: "武周革命",
      year: "690-705",
      description: "武则天称帝",
      significance: "唯一女皇帝",
    },
    {
      name: "开元盛世",
      year: "713-741",
      description: "唐玄宗前期",
      significance: "唐朝鼎盛时期",
    },
    {
      name: "安史之乱",
      year: "755-763",
      description: "安禄山、史思明叛乱",
      significance: "唐朝由盛转衰的转折点",
    },
  ],
  terminology: {
    长安: "唐都，世界最大城市",
    大明宫: "唐代主要皇宫，含元殿、麟德殿等",
    坊市: "城市区划，坊为居住区，市为商业区",
    进士: "科举最高功名，最受尊崇",
    节度使: "地方军政长官，安史之乱后势力膨胀",
    翰林学士: "皇帝近臣，参与机要",
  },
  writingNotes: [
    "唐代开放包容，女性地位较高",
    "胡风盛行，可写胡人、胡商、胡乐",
    "饮茶习惯形成，可以此为背景",
    "诗歌是重要社交工具",
    "渐用桌椅，但跪坐仍存在",
    "长安是国际大都市，有各国商人、使节",
  ],
};

// ==================== 导出 ====================

export const DYNASTIES: Record<string, Dynasty> = {
  西汉: WESTERN_HAN,
  唐代: TANG,
  // 可继续添加其他朝代...
};

/**
 * 根据年份获取朝代
 */
export function getDynastyByYear(year: number): Dynasty | null {
  for (const dynasty of Object.values(DYNASTIES)) {
    if (year >= dynasty.period.start && year <= dynasty.period.end) {
      return dynasty;
    }
  }
  return null;
}

/**
 * 根据关键词检测朝代
 */
export function detectDynastyByKeywords(text: string): Dynasty | null {
  for (const [name, dynasty] of Object.entries(DYNASTIES)) {
    // 检查朝代名称
    if (text.includes(name)) return dynasty;
    // 检查别称
    for (const alias of dynasty.aliases) {
      if (text.includes(alias)) return dynasty;
    }
    // 检查都城
    for (const capital of dynasty.capitals) {
      if (text.includes(capital.name)) return dynasty;
    }
    // 检查重要人物
    for (const figure of dynasty.notableFigures) {
      if (text.includes(figure.name)) return dynasty;
    }
  }
  return null;
}
