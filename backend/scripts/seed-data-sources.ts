/**
 * 数据源种子脚本 - 预置 YouTube、企业技术博客、AI政策数据源
 *
 * 使用方式：
 *   cd backend && npx ts-node scripts/seed-data-sources.ts
 *   cd backend && npx ts-node scripts/seed-data-sources.ts youtube    # 只添加YouTube
 *   cd backend && npx ts-node scripts/seed-data-sources.ts blog       # 只添加Blog
 *   cd backend && npx ts-node scripts/seed-data-sources.ts policy     # 只添加Policy
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ============== YouTube 频道配置 ==============
const YOUTUBE_CHANNELS = [
  {
    name: "Y Combinator",
    channelId: "UCcefcZRL2oaA_uBNeo5UOWg",
    handle: "@ycombinator",
    description: "Y Combinator官方频道，创业、投资、科技讲座",
    keywords: ["startup", "venture capital", "entrepreneurship", "tech"],
  },
  {
    name: "BG2Pod",
    channelId: "UC-yRDvpR99LUc5l7i7jLzew",
    handle: "@Bg2Pod",
    description: "Brad Gerstner & Bill Gurley播客，科技投资市场分析",
    keywords: ["tech", "investing", "venture capital", "markets"],
  },
  {
    name: "Valley 101",
    channelId: "UChnNjLyx_5rk_iDPQ2BQDQA",
    handle: "@valley101podcast",
    description: "Phoenix地区新闻播客",
    keywords: ["phoenix", "arizona", "news", "podcast"],
  },
  {
    name: "Bloomberg Technology",
    channelId: "UCrM7B7SL_g1edFOnmj-SDKg",
    handle: "@BloombergTechnology",
    description: "Bloomberg科技新闻与分析",
    keywords: ["tech", "business", "news", "markets", "bloomberg"],
  },
];

// ============== 企业技术博客配置 (按用户要求) ==============
const TECH_BLOGS = [
  // === 大型科技公司 (AI基础设施) ===
  {
    name: "NVIDIA Technical Blog",
    baseUrl: "https://developer.nvidia.com/blog/feed",
    description: "NVIDIA开发者博客，GPU、AI、CUDA技术",
    keywords: ["nvidia", "gpu", "cuda", "ai", "deep learning"],
    category: "BLOG",
  },
  {
    name: "Google AI Blog",
    baseUrl: "https://ai.googleblog.com/feeds/posts/default",
    description: "Google AI研究与产品博客",
    keywords: ["google", "ai", "machine learning", "research"],
    category: "BLOG",
  },
  {
    name: "Microsoft AI Blog",
    baseUrl: "https://blogs.microsoft.com/ai/feed/",
    description: "Microsoft AI博客，Azure AI、Copilot",
    keywords: ["microsoft", "azure", "ai", "copilot"],
    category: "BLOG",
  },
  {
    name: "Azure Blog",
    baseUrl: "https://azure.microsoft.com/en-us/blog/feed/",
    description: "Microsoft Azure云服务博客",
    keywords: ["microsoft", "azure", "cloud", "ai"],
    category: "BLOG",
  },
  {
    name: "Cisco Tech Blog",
    baseUrl: "https://blogs.cisco.com/feed",
    description: "Cisco技术博客，网络、安全、数据中心",
    keywords: ["cisco", "networking", "security", "infrastructure"],
    category: "BLOG",
  },
  {
    name: "VMware Blog",
    baseUrl: "https://blogs.vmware.com/feed",
    description: "VMware/Broadcom虚拟化技术博客",
    keywords: ["vmware", "broadcom", "virtualization", "cloud"],
    category: "BLOG",
  },
  // === 网络安全公司 ===
  {
    name: "Fortinet Blog",
    baseUrl: "https://www.fortinet.com/blog/feed",
    description: "Fortinet安全技术博客",
    keywords: ["fortinet", "security", "firewall", "threat"],
    category: "BLOG",
  },
  {
    name: "Unit 42 (Palo Alto)",
    baseUrl: "https://unit42.paloaltonetworks.com/feed/",
    description: "Palo Alto Networks Unit 42威胁研究",
    keywords: ["paloalto", "unit42", "threat research", "security"],
    category: "BLOG",
  },
  // === AI 初创公司/研究机构 ===
  {
    name: "OpenAI Blog",
    baseUrl: "https://openai.com/blog/rss/",
    description: "OpenAI官方博客，GPT、DALL-E等AI研究",
    keywords: ["openai", "gpt", "chatgpt", "ai", "research"],
    category: "BLOG",
  },
  {
    name: "Hugging Face Blog",
    baseUrl: "https://huggingface.co/blog/feed.xml",
    description: "Hugging Face开源AI模型与工具",
    keywords: ["huggingface", "transformers", "open source", "ai"],
    category: "BLOG",
  },
];

// ============== 研究报告数据源配置 ==============
const REPORT_SOURCES = [
  {
    name: "SemiAnalysis",
    baseUrl: "https://semianalysis.substack.com/feed",
    description: "半导体行业深度分析，AI芯片市场研究",
    keywords: ["semiconductor", "ai chips", "nvidia", "amd", "intel"],
  },
  {
    name: "Epoch AI Research",
    baseUrl: "https://epochai.substack.com/feed",
    description: "AI发展趋势研究，模型能力预测",
    keywords: ["ai research", "forecasting", "compute", "scaling"],
  },
  {
    name: "McKinsey Insights",
    baseUrl: "https://www.mckinsey.com/insights/rss",
    description: "McKinsey商业与技术洞察",
    keywords: ["mckinsey", "consulting", "business", "ai strategy"],
  },
  {
    name: "Gartner ThinkCast",
    baseUrl: "https://thinkcast.libsyn.com/rss",
    description: "Gartner研究洞察播客",
    keywords: ["gartner", "research", "enterprise", "technology"],
  },
];

// ============== 学术论文数据源配置 (已验证有效) ==============
const PAPER_SOURCES = [
  {
    name: "arXiv cs.AI",
    baseUrl: "https://rss.arxiv.org/rss/cs.AI",
    description: "arXiv人工智能论文",
    keywords: ["arxiv", "ai", "research", "papers"],
  },
  {
    name: "arXiv cs.LG",
    baseUrl: "https://rss.arxiv.org/rss/cs.LG",
    description: "arXiv机器学习论文",
    keywords: ["arxiv", "machine learning", "deep learning", "papers"],
  },
  {
    name: "arXiv cs.CL",
    baseUrl: "https://rss.arxiv.org/rss/cs.CL",
    description: "arXiv计算语言学论文 (NLP/LLM)",
    keywords: ["arxiv", "nlp", "llm", "language models"],
  },
  {
    name: "arXiv cs.CV",
    baseUrl: "https://rss.arxiv.org/rss/cs.CV",
    description: "arXiv计算机视觉论文",
    keywords: ["arxiv", "computer vision", "image", "video"],
  },
];

// ============== 科技新闻数据源配置 (已验证有效) ==============
const NEWS_SOURCES = [
  {
    name: "Ars Technica",
    baseUrl: "https://feeds.arstechnica.com/arstechnica/index",
    description: "Ars Technica深度科技报道",
    keywords: ["ars technica", "tech", "science", "analysis"],
  },
  {
    name: "Hacker News",
    baseUrl: "https://news.ycombinator.com/rss",
    description: "Y Combinator Hacker News",
    keywords: ["hackernews", "ycombinator", "startup", "tech"],
  },
  {
    name: "404 Media",
    baseUrl: "https://www.404media.co/rss",
    description: "独立科技新闻媒体",
    keywords: ["tech", "journalism", "ai", "privacy"],
  },
];

// ============== AI 政策数据源配置 ==============
const POLICY_SOURCES = [
  // === 美国政策 ===
  {
    name: "NIST AI",
    baseUrl: "https://www.nist.gov/topics/artificial-intelligence/rss.xml",
    description: "NIST人工智能标准与框架",
    keywords: ["nist", "ai standards", "risk framework", "us policy"],
    region: "US",
  },
  {
    name: "AI Now Institute",
    baseUrl: "https://ainowinstitute.org/category/news/feed",
    description: "AI Now研究所 - AI政策研究",
    keywords: ["ai policy", "research", "governance", "ethics"],
    region: "US",
  },
  {
    name: "Brookings Tech",
    baseUrl: "https://www.brookings.edu/topic/technology-innovation/feed/",
    description: "Brookings科技政策研究",
    keywords: ["brookings", "tech policy", "ai governance"],
    region: "US",
  },
  // === 欧盟政策 ===
  {
    name: "EU AI Act Newsletter",
    baseUrl: "https://artificialintelligenceact.substack.com/feed",
    description: "欧盟AI法案最新动态",
    keywords: ["eu", "ai act", "regulation", "europe"],
    region: "EU",
  },
  // === 中国政策 (注：中国官方网站通常无RSS，使用第三方) ===
  {
    name: "CSET Georgetown (中美AI)",
    baseUrl: "https://cset.georgetown.edu/feed/",
    description: "乔治城大学 - 中美AI政策研究",
    keywords: ["cset", "china", "us", "ai policy", "research"],
    region: "GLOBAL",
  },
];

// ============== 种子函数 ==============

async function seedYouTubeSources() {
  console.log("\n========== Seeding YouTube Data Sources ==========\n");

  for (const channel of YOUTUBE_CHANNELS) {
    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`;

    try {
      const existing = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: channel.name }, { baseUrl: rssUrl }],
        },
      });

      if (existing) {
        console.log(`✓ ${channel.name} 已存在 (ID: ${existing.id})`);
        continue;
      }

      const dataSource = await prisma.dataSource.create({
        data: {
          name: channel.name,
          description: channel.description,
          type: "YOUTUBE",
          category: "YOUTUBE_VIDEO",
          baseUrl: rssUrl,
          apiEndpoint: `https://www.youtube.com/${channel.handle}`,
          authType: "NONE",
          crawlerType: "RSS",
          crawlerConfig: {
            channelId: channel.channelId,
            handle: channel.handle,
            fetchTranscript: true,
            maxItems: 10,
            schedule: { frequency: "daily", time: "06:00", enabled: true },
          },
          rateLimit: 1,
          keywords: channel.keywords,
          categories: ["Technology", "Business"],
          languages: ["en"],
          minQualityScore: 0,
          deduplicationConfig: {
            checkFields: ["externalId", "title"],
            strategy: "SKIP_DUPLICATE",
          },
          status: "ACTIVE",
          isVerified: false,
        },
      });

      console.log(`✅ ${channel.name} 已添加 (ID: ${dataSource.id})`);
    } catch (error: any) {
      console.error(`❌ 添加 ${channel.name} 失败:`, error.message);
    }
  }
}

async function seedTechBlogs() {
  console.log("\n========== Seeding Tech Blog Data Sources ==========\n");

  for (const blog of TECH_BLOGS) {
    try {
      const existing = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: blog.name }, { baseUrl: blog.baseUrl }],
        },
      });

      if (existing) {
        console.log(`✓ ${blog.name} 已存在 (ID: ${existing.id})`);
        continue;
      }

      const dataSource = await prisma.dataSource.create({
        data: {
          name: blog.name,
          description: blog.description,
          type: "RSS",
          category: blog.category as any,
          baseUrl: blog.baseUrl,
          authType: "NONE",
          crawlerType: "RSS",
          crawlerConfig: {
            maxItems: 20,
            schedule: { frequency: "daily", time: "07:00", enabled: true },
          },
          rateLimit: 1,
          keywords: blog.keywords,
          categories: ["Technology"],
          languages: ["en"],
          minQualityScore: 0,
          deduplicationConfig: {
            checkFields: ["title", "sourceUrl"],
            strategy: "SKIP_DUPLICATE",
          },
          status: "ACTIVE",
          isVerified: false,
        },
      });

      console.log(`✅ ${blog.name} 已添加 (ID: ${dataSource.id})`);
    } catch (error: any) {
      console.error(`❌ 添加 ${blog.name} 失败:`, error.message);
    }
  }
}

async function seedPolicySources() {
  console.log("\n========== Seeding Policy Data Sources ==========\n");

  for (const source of POLICY_SOURCES) {
    try {
      const existing = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: source.name }, { baseUrl: source.baseUrl }],
        },
      });

      if (existing) {
        console.log(`✓ ${source.name} 已存在 (ID: ${existing.id})`);
        continue;
      }

      const dataSource = await prisma.dataSource.create({
        data: {
          name: source.name,
          description: source.description,
          type: "RSS",
          category: "POLICY",
          baseUrl: source.baseUrl,
          authType: "NONE",
          crawlerType: "RSS",
          crawlerConfig: {
            region: source.region,
            maxItems: 20,
            schedule: { frequency: "daily", time: "08:00", enabled: true },
          },
          rateLimit: 1,
          keywords: source.keywords,
          categories: ["Policy", "AI Governance"],
          languages: source.region === "CN" ? ["zh"] : ["en"],
          minQualityScore: 0,
          deduplicationConfig: {
            checkFields: ["title", "sourceUrl"],
            strategy: "SKIP_DUPLICATE",
          },
          status: "ACTIVE",
          isVerified: false,
        },
      });

      console.log(
        `✅ ${source.name} [${source.region}] 已添加 (ID: ${dataSource.id})`,
      );
    } catch (error: any) {
      console.error(`❌ 添加 ${source.name} 失败:`, error.message);
    }
  }
}

async function seedReportSources() {
  console.log("\n========== Seeding Report Data Sources ==========\n");

  for (const source of REPORT_SOURCES) {
    try {
      const existing = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: source.name }, { baseUrl: source.baseUrl }],
        },
      });

      if (existing) {
        console.log(`✓ ${source.name} 已存在 (ID: ${existing.id})`);
        continue;
      }

      const dataSource = await prisma.dataSource.create({
        data: {
          name: source.name,
          description: source.description,
          type: "RSS",
          category: "REPORT",
          baseUrl: source.baseUrl,
          authType: "NONE",
          crawlerType: "RSS",
          crawlerConfig: {
            maxItems: 20,
            schedule: { frequency: "daily", time: "09:00", enabled: true },
          },
          rateLimit: 1,
          keywords: source.keywords,
          categories: ["Research", "Analysis"],
          languages: ["en"],
          minQualityScore: 0,
          deduplicationConfig: {
            checkFields: ["title", "sourceUrl"],
            strategy: "SKIP_DUPLICATE",
          },
          status: "ACTIVE",
          isVerified: false,
        },
      });

      console.log(`✅ ${source.name} 已添加 (ID: ${dataSource.id})`);
    } catch (error: any) {
      console.error(`❌ 添加 ${source.name} 失败:`, error.message);
    }
  }
}

async function seedPaperSources() {
  console.log("\n========== Seeding Paper Data Sources ==========\n");

  for (const source of PAPER_SOURCES) {
    try {
      const existing = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: source.name }, { baseUrl: source.baseUrl }],
        },
      });

      if (existing) {
        console.log(`✓ ${source.name} 已存在 (ID: ${existing.id})`);
        continue;
      }

      const dataSource = await prisma.dataSource.create({
        data: {
          name: source.name,
          description: source.description,
          type: "ARXIV",
          category: "PAPER",
          baseUrl: source.baseUrl,
          authType: "NONE",
          crawlerType: "RSS",
          crawlerConfig: {
            maxItems: 50,
            schedule: { frequency: "daily", time: "05:00", enabled: true },
          },
          rateLimit: 1,
          keywords: source.keywords,
          categories: ["Academic", "Research"],
          languages: ["en"],
          minQualityScore: 0,
          deduplicationConfig: {
            checkFields: ["title", "sourceUrl"],
            strategy: "SKIP_DUPLICATE",
          },
          status: "ACTIVE",
          isVerified: false,
        },
      });

      console.log(`✅ ${source.name} 已添加 (ID: ${dataSource.id})`);
    } catch (error: any) {
      console.error(`❌ 添加 ${source.name} 失败:`, error.message);
    }
  }
}

async function seedNewsSources() {
  console.log("\n========== Seeding News Data Sources ==========\n");

  for (const source of NEWS_SOURCES) {
    try {
      const existing = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: source.name }, { baseUrl: source.baseUrl }],
        },
      });

      if (existing) {
        console.log(`✓ ${source.name} 已存在 (ID: ${existing.id})`);
        continue;
      }

      const dataSource = await prisma.dataSource.create({
        data: {
          name: source.name,
          description: source.description,
          type: "RSS",
          category: "NEWS",
          baseUrl: source.baseUrl,
          authType: "NONE",
          crawlerType: "RSS",
          crawlerConfig: {
            maxItems: 30,
            schedule: { frequency: "hourly", time: "", enabled: true },
          },
          rateLimit: 1,
          keywords: source.keywords,
          categories: ["News", "Technology"],
          languages: ["en"],
          minQualityScore: 0,
          deduplicationConfig: {
            checkFields: ["title", "sourceUrl"],
            strategy: "SKIP_DUPLICATE",
          },
          status: "ACTIVE",
          isVerified: false,
        },
      });

      console.log(`✅ ${source.name} 已添加 (ID: ${dataSource.id})`);
    } catch (error: any) {
      console.error(`❌ 添加 ${source.name} 失败:`, error.message);
    }
  }
}

async function main() {
  const mode = process.argv[2] || "all"; // all | youtube | blog | policy | report | paper | news

  console.log(`========== 数据源种子脚本 (模式: ${mode}) ==========`);

  try {
    if (mode === "all" || mode === "youtube") {
      await seedYouTubeSources();
    }
    if (mode === "all" || mode === "blog") {
      await seedTechBlogs();
    }
    if (mode === "all" || mode === "report") {
      await seedReportSources();
    }
    if (mode === "all" || mode === "paper") {
      await seedPaperSources();
    }
    if (mode === "all" || mode === "news") {
      await seedNewsSources();
    }
    if (mode === "all" || mode === "policy") {
      await seedPolicySources();
    }

    console.log("\n========== 完成 ==========");
    console.log("\n💡 提示:");
    console.log("1. 访问 /data-collection/config 查看和管理数据源");
    console.log("2. 可以在界面上手动添加更多数据源");
    console.log("3. 调度配置已预设为每日自动采集");
    console.log("4. 可以通过编辑修改采集频率 (manual/hourly/daily/weekly)\n");
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
