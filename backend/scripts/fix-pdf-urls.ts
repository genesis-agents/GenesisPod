/**
 * 修复数据库中现有论文的 PDF URLs
 *
 * 问题：旧的 PDF URL 提取逻辑不准确，导致 pdfUrl 字段为 null 或指向 HTML 页面
 * 解决：根据 sourceUrl 重新生成正确的 PDF URLs
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * 从 URL 中提取 PDF URL
 */
function extractPdfUrl(sourceUrl: string): string | null {
  try {
    const urlObj = new URL(sourceUrl);

    // arXiv: https://arxiv.org/abs/2311.12345v1 -> https://arxiv.org/pdf/2311.12345v1.pdf
    if (
      urlObj.hostname === "arxiv.org" ||
      urlObj.hostname === "www.arxiv.org"
    ) {
      const arxivIdMatch = sourceUrl.match(/arxiv\.org\/abs\/(.+)/);
      if (arxivIdMatch) {
        return `https://arxiv.org/pdf/${arxivIdMatch[1]}.pdf`;
      }
    }

    // OpenReview: https://openreview.net/forum?id=xxx -> https://openreview.net/pdf?id=xxx
    if (
      urlObj.hostname === "openreview.net" ||
      urlObj.hostname === "www.openreview.net"
    ) {
      return sourceUrl.replace("/forum?", "/pdf?");
    }

    // 如果URL本身就是PDF链接
    if (sourceUrl.toLowerCase().endsWith(".pdf")) {
      return sourceUrl;
    }

    return null;
  } catch (error) {
    console.error(`Failed to extract PDF URL from: ${sourceUrl}`, error);
    return null;
  }
}

async function main() {
  console.log("开始修复 PDF URLs...\n");

  // 查找所有 type=PAPER 的资源
  const papers = await prisma.resource.findMany({
    where: {
      type: "PAPER",
    },
    select: {
      id: true,
      title: true,
      sourceUrl: true,
      pdfUrl: true,
    },
  });

  console.log(`找到 ${papers.length} 篇论文\n`);

  let fixedCount = 0;
  let skippedCount = 0;
  let failedCount = 0;

  for (const paper of papers) {
    const currentPdfUrl = paper.pdfUrl;
    const newPdfUrl = extractPdfUrl(paper.sourceUrl);

    // 如果当前 pdfUrl 为空或与新的不同，则更新
    if (!currentPdfUrl || (newPdfUrl && currentPdfUrl !== newPdfUrl)) {
      try {
        await prisma.resource.update({
          where: { id: paper.id },
          data: { pdfUrl: newPdfUrl },
        });

        console.log(`✅ 修复: ${paper.title.substring(0, 60)}...`);
        console.log(`   旧URL: ${currentPdfUrl || "(null)"}`);
        console.log(`   新URL: ${newPdfUrl || "(null)"}\n`);
        fixedCount++;
      } catch (error) {
        console.error(`❌ 失败: ${paper.id} - ${error}`);
        failedCount++;
      }
    } else {
      skippedCount++;
    }
  }

  console.log("\n=== 修复完成 ===");
  console.log(`总计: ${papers.length} 篇论文`);
  console.log(`修复: ${fixedCount} 篇`);
  console.log(`跳过: ${skippedCount} 篇 (已有正确URL)`);
  console.log(`失败: ${failedCount} 篇`);
}

main()
  .catch((error) => {
    console.error("迁移脚本错误:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
