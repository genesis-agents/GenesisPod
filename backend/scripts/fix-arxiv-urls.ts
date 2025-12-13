import { PrismaClient } from "@prisma/client";
import { getErrorMessage } from "../common/utils/error.utils";

/**
 * 脚本：将现有arXiv论文的HTTP URL改为HTTPS
 */
async function fixArxivUrls() {
  const prisma = new PrismaClient();

  try {
    console.log("🔧 开始修复 arXiv URL...\n");

    // 查找所有 HTTP arxiv URL 的 PAPER
    const papers = await prisma.resource.findMany({
      where: {
        type: "PAPER",
        OR: [
          { sourceUrl: { contains: "http://arxiv.org" } },
          { pdfUrl: { contains: "http://arxiv.org" } },
        ],
      },
    });

    console.log(`📊 找到 ${papers.length} 篇需要修复的论文\n`);

    let successCount = 0;

    for (const paper of papers) {
      try {
        const updatedSourceUrl = paper.sourceUrl?.replace(
          "http://arxiv.org",
          "https://arxiv.org",
        );
        const updatedPdfUrl = paper.pdfUrl?.replace(
          "http://arxiv.org",
          "https://arxiv.org",
        );

        await prisma.resource.update({
          where: { id: paper.id },
          data: {
            sourceUrl: updatedSourceUrl,
            pdfUrl: updatedPdfUrl,
          },
        });

        console.log(`✅ ${paper.title.substring(0, 60)}...`);
        successCount++;
      } catch (error) {
        console.error(`❌ 修复失败 ${paper.id}:`, getErrorMessage(error));
      }
    }

    console.log(
      `\n✅ 修复完成！共修复 ${successCount}/${papers.length} 篇论文`,
    );
  } catch (error) {
    console.error("❌ 脚本执行失败:", error);
  } finally {
    await prisma.$disconnect();
  }
}

void fixArxivUrls();
