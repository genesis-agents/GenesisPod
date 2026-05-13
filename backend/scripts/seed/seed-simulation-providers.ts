/**
 * AI Simulation 外部数据源预置脚本（已弃用，留作手动 fallback）
 *
 * ⚠️ DEPRECATED 2026-05-13: 主线已迁到 backend/src/common/seed/SeedSyncService，
 *    数据源单源为 backend/src/common/seed/data/simulation-providers.json。
 *    Backend 容器启动会自动幂等同步，无需手动跑此脚本。
 *
 * 保留此脚本仅用于：
 * - 调试 / 手动重置场景：`npx tsx scripts/seed/seed-simulation-providers.ts`
 * - JSON 文件损坏时的紧急回退
 *
 * 新增/修改 provider 请改 .json 文件，不要在这里加。
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// 外部数据提供商配置
const EXTERNAL_PROVIDERS = [
  {
    id: "market",
    name: "Market / Price (Alpha Vantage)",
    description:
      "GPU/芯片/算力定价与供需数据，使用Alpha Vantage API获取市场行情",
    category: "market",
    enabled: true,
    // Alpha Vantage 免费API端点 (25次/天)
    baseUrl: "https://www.alphavantage.co/query",
    // 需要用户配置 API Key
    apiKey: "",
    // 示例请求：?function=GLOBAL_QUOTE&symbol=NVDA&apikey=YOUR_KEY
    headers: JSON.stringify({
      "Content-Type": "application/json",
    }),
  },
  {
    id: "finance",
    name: "Finance / Filings (SEC EDGAR)",
    description: "SEC财务公告、10-K/10-Q报告、融资事件，使用SEC EDGAR公开API",
    category: "finance",
    enabled: true,
    // SEC EDGAR 免费公开API
    baseUrl: "https://data.sec.gov",
    apiKey: "",
    // SEC API 需要 User-Agent header
    headers: JSON.stringify({
      "User-Agent": "DeepDive Research contact@example.com",
      Accept: "application/json",
    }),
  },
  {
    id: "news",
    name: "News / Sentiment (NewsAPI)",
    description: "新闻聚合与舆情分析，支持多语言全球新闻源",
    category: "news",
    enabled: true,
    // NewsAPI 端点 (免费100次/天)
    baseUrl: "https://newsapi.org/v2",
    // 需要用户配置 API Key
    apiKey: "",
    headers: JSON.stringify({
      "Content-Type": "application/json",
    }),
  },
  {
    id: "regulation",
    name: "Regulation / Policy (Federal Register)",
    description: "美国联邦监管政策、出口管制规定、合规公告",
    category: "regulation",
    enabled: true,
    // Federal Register 免费公开API
    baseUrl: "https://www.federalregister.gov/api/v1",
    apiKey: "",
    headers: JSON.stringify({
      Accept: "application/json",
    }),
  },
];

async function seedSimulationProviders() {
  console.log("🚀 Starting AI Simulation external providers setup...\n");

  try {
    // 1. 检查现有配置
    const existingSetting = await prisma.systemSetting.findUnique({
      where: { key: "external.providers" },
    });

    let existingProviders: any[] = [];
    if (existingSetting) {
      try {
        existingProviders = JSON.parse(existingSetting.value);
        console.log(
          `📋 Found existing config with ${existingProviders.length} providers`,
        );
      } catch {
        console.log("⚠️  Existing config is invalid, will replace");
      }
    }

    // 2. 合并配置（保留用户已配置的API Keys）
    const mergedProviders = EXTERNAL_PROVIDERS.map((newProvider) => {
      const existing = existingProviders.find((p) => p.id === newProvider.id);
      if (existing) {
        console.log(`  ✓ Updating "${newProvider.id}" (keeping existing keys)`);
        return {
          ...newProvider,
          // 保留用户已配置的值
          apiKey: existing.apiKey || newProvider.apiKey,
          enabled:
            existing.enabled !== undefined
              ? existing.enabled
              : newProvider.enabled,
          baseUrl: existing.baseUrl || newProvider.baseUrl,
          headers: existing.headers || newProvider.headers,
        };
      }
      console.log(`  + Adding new provider "${newProvider.id}"`);
      return newProvider;
    });

    // 保留用户自定义的providers
    const customProviders = existingProviders.filter(
      (p) => !EXTERNAL_PROVIDERS.find((ep) => ep.id === p.id),
    );
    if (customProviders.length > 0) {
      console.log(`  📦 Keeping ${customProviders.length} custom provider(s)`);
      mergedProviders.push(...customProviders);
    }

    // 3. 保存配置
    await prisma.systemSetting.upsert({
      where: { key: "external.providers" },
      create: {
        key: "external.providers",
        value: JSON.stringify(mergedProviders),
        description: "External data providers for AI Simulation",
        category: "external",
      },
      update: {
        value: JSON.stringify(mergedProviders),
        description: "External data providers for AI Simulation",
      },
    });

    console.log(
      `\n✅ Successfully configured ${mergedProviders.length} providers!\n`,
    );

    // 4. 显示配置状态
    console.log("📊 Provider Status:");
    console.log("─".repeat(60));
    for (const p of mergedProviders) {
      const status = p.enabled ? "✓ Enabled" : "✗ Disabled";
      const keyStatus = p.apiKey ? "🔑 Key set" : "⚠️  No key";
      console.log(`  ${p.id.padEnd(12)} ${status.padEnd(12)} ${keyStatus}`);
    }
    console.log("─".repeat(60));

    // 5. 显示下一步指引
    console.log("\n📝 Next Steps:");
    console.log("   1. Go to Admin > Settings > Strategic Simulation API");
    console.log("   2. Configure API keys for each provider:");
    console.log(
      "      - Alpha Vantage: https://www.alphavantage.co/support/#api-key",
    );
    console.log("      - NewsAPI: https://newsapi.org/register");
    console.log("      - SEC EDGAR: Free, no key needed (just User-Agent)");
    console.log("      - Federal Register: Free, no key needed");
    console.log("   3. Enable/disable providers as needed");
    console.log("   4. Test with 'Get External Snapshot' in AI Simulation\n");
  } catch (error) {
    console.error("❌ Error seeding providers:", error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// 运行
seedSimulationProviders()
  .then(() => {
    console.log("🎉 Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
