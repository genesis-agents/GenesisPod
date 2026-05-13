/**
 * YouTube 频道数据源种子脚本（已弃用，留作手动 fallback）
 *
 * ⚠️ DEPRECATED 2026-05-13: 主线已迁到 backend/src/common/seed/SeedSyncService，
 *    数据源单源为 backend/src/common/seed/data/youtube-sources.json。
 *    Backend 容器启动会自动幂等同步，无需手动跑此脚本。
 *
 * 保留此脚本仅用于：
 * - 调试 / 手动重置场景：`npx tsx scripts/seed/seed-youtube-sources.ts`
 *
 * YouTube 频道 RSS Feed 格式：
 *   https://www.youtube.com/feeds/videos.xml?channel_id=CHANNEL_ID
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// YouTube频道配置
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
  {
    name: "Lenny's Podcast",
    channelId: "UC6t1O76G0jYXOAoYCm153dA",
    handle: "@LennysPodcast",
    description:
      "Lenny Rachitsky 的产品/增长/职业播客，深度访谈头部公司 PM、CEO、增长专家",
    keywords: [
      "product management",
      "growth",
      "startup",
      "career",
      "saas",
      "pm",
    ],
  },
];

async function seedYouTubeSources() {
  console.log("========== Seeding YouTube Data Sources ==========\n");

  for (const channel of YOUTUBE_CHANNELS) {
    // 跳过placeholder
    if (channel.channelId.includes("PLACEHOLDER")) {
      console.log(`⚠️  Skipping ${channel.name}: Channel ID not configured`);
      console.log(
        `   请访问 https://www.youtube.com/${channel.handle} 获取 Channel ID\n`,
      );
      continue;
    }

    const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channel.channelId}`;

    try {
      // 检查是否已存在
      const existing = await prisma.dataSource.findFirst({
        where: {
          OR: [{ name: channel.name }, { baseUrl: rssUrl }],
        },
      });

      if (existing) {
        console.log(`✓ ${channel.name} 已存在 (ID: ${existing.id})`);
        continue;
      }

      // 创建数据源
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
            // 调度配置：每日自动采集
            schedule: {
              frequency: "daily",
              time: "06:00",
              enabled: true,
            },
          },
          rateLimit: 1, // 1 request per second
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

      console.log(`✅ ${channel.name} 已添加`);
      console.log(`   ID: ${dataSource.id}`);
      console.log(`   RSS: ${rssUrl}\n`);
    } catch (error: any) {
      console.error(`❌ 添加 ${channel.name} 失败:`, error.message);
    }
  }

  console.log("\n========== 完成 ==========");
  console.log("\n💡 提示:");
  console.log("1. 对于缺少Channel ID的频道，请手动获取并更新此脚本");
  console.log(
    "2. 运行 npm run dev 后，访问 /data-collection/config 查看数据源",
  );
  console.log("3. 自动采集需要配置定时任务（见下方说明）\n");
}

async function main() {
  try {
    await seedYouTubeSources();
  } catch (error) {
    console.error("Error:", error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
