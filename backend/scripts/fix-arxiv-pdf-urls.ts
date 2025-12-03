/**
 * 修复脚本：为现有的 arXiv 论文添加 PDF URL
 *
 * 用法：npx ts-node scripts/fix-arxiv-pdf-urls.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function fixArxivPdfUrls() {
  console.log("🔧 Starting arXiv PDF URL fix...\n");

  // 查找所有没有 pdfUrl 但 sourceUrl 包含 arxiv.org/abs/ 的资源
  const arxivResources = await prisma.resource.findMany({
    where: {
      sourceUrl: {
        contains: "arxiv.org/abs/",
      },
      pdfUrl: null,
    },
  });

  console.log(
    `Found ${arxivResources.length} arXiv resources without PDF URL\n`,
  );

  let updatedCount = 0;
  let errorCount = 0;

  for (const resource of arxivResources) {
    try {
      // 从 sourceUrl 生成 pdfUrl
      // https://arxiv.org/abs/2512.02080 -> https://arxiv.org/pdf/2512.02080
      const pdfUrl = resource.sourceUrl!.replace("/abs/", "/pdf/");

      // 提取 arXiv ID
      const arxivIdMatch = resource.sourceUrl!.match(
        /arxiv\.org\/abs\/(\d+\.\d+)/,
      );
      const arxivId = arxivIdMatch ? arxivIdMatch[1] : null;

      // 更新资源
      await prisma.resource.update({
        where: { id: resource.id },
        data: {
          pdfUrl: pdfUrl,
          metadata: {
            ...((resource.metadata as object) || {}),
            isArxiv: true,
            arxivId: arxivId,
          },
        },
      });

      console.log(`✅ Updated: ${resource.title?.substring(0, 50)}...`);
      console.log(`   PDF URL: ${pdfUrl}`);
      console.log(`   arXiv ID: ${arxivId}\n`);

      updatedCount++;
    } catch (error) {
      console.error(`❌ Failed to update resource ${resource.id}:`, error);
      errorCount++;
    }
  }

  console.log("\n" + "=".repeat(50));
  console.log(`📊 Summary:`);
  console.log(`   Total arXiv resources found: ${arxivResources.length}`);
  console.log(`   Successfully updated: ${updatedCount}`);
  console.log(`   Errors: ${errorCount}`);
  console.log("=".repeat(50));
}

fixArxivPdfUrls()
  .catch((e) => {
    console.error("Script failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
