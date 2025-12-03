/**
 * 数据库清理脚本
 *
 * 用于清理占用大量空间的数据，特别是：
 * 1. generated_images - AI生成的图片记录
 * 2. office_documents - PPT等Office文档
 * 3. raw_data - 原始采集数据
 *
 * 运行方式：
 * cd backend && npx ts-node scripts/cleanup-database.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("========== 数据库清理脚本 ==========\n");

  // 1. 统计各表数据量
  console.log("📊 统计各表数据量...\n");

  const counts = await Promise.all([
    prisma.generatedImage
      .count()
      .then((c) => ({ table: "generated_images", count: c })),
    prisma.officeDocument
      .count()
      .then((c) => ({ table: "office_documents", count: c })),
    prisma.officeDocumentVersion
      .count()
      .then((c) => ({ table: "office_document_versions", count: c })),
    prisma.rawData.count().then((c) => ({ table: "raw_data", count: c })),
    prisma.topicMessage
      .count()
      .then((c) => ({ table: "topic_messages", count: c })),
    prisma.resource.count().then((c) => ({ table: "resources", count: c })),
    prisma.deduplicationRecord
      .count()
      .then((c) => ({ table: "deduplication_records", count: c })),
  ]);

  for (const { table, count } of counts) {
    console.log(`  ${table}: ${count} 条记录`);
  }

  console.log("\n🗑️  开始清理数据...\n");

  // 2. 清理 generated_images (保留最近7天)
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const deletedImages = await prisma.generatedImage.deleteMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
    },
  });
  console.log(
    `  ✅ 删除了 ${deletedImages.count} 条旧的 generated_images 记录`,
  );

  // 3. 清理 office_documents (保留最近7天)
  // 先删除版本记录
  const deletedVersions = await prisma.officeDocumentVersion.deleteMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
    },
  });
  console.log(
    `  ✅ 删除了 ${deletedVersions.count} 条旧的 office_document_versions 记录`,
  );

  // 删除资源引用
  const oldDocs = await prisma.officeDocument.findMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
    },
    select: { id: true },
  });

  if (oldDocs.length > 0) {
    const deletedRefs = await prisma.officeDocumentResourceRef.deleteMany({
      where: {
        documentId: {
          in: oldDocs.map((d) => d.id),
        },
      },
    });
    console.log(
      `  ✅ 删除了 ${deletedRefs.count} 条旧的 office_document_resource_refs 记录`,
    );
  }

  const deletedDocs = await prisma.officeDocument.deleteMany({
    where: {
      createdAt: {
        lt: sevenDaysAgo,
      },
    },
  });
  console.log(`  ✅ 删除了 ${deletedDocs.count} 条旧的 office_documents 记录`);

  // 4. 清理 raw_data (保留最近3天)
  const threeDaysAgo = new Date();
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  const deletedRawData = await prisma.rawData.deleteMany({
    where: {
      createdAt: {
        lt: threeDaysAgo,
      },
    },
  });
  console.log(`  ✅ 删除了 ${deletedRawData.count} 条旧的 raw_data 记录`);

  // 5. 清理 deduplication_records (保留最近3天)
  const deletedDedup = await prisma.deduplicationRecord.deleteMany({
    where: {
      createdAt: {
        lt: threeDaysAgo,
      },
    },
  });
  console.log(
    `  ✅ 删除了 ${deletedDedup.count} 条旧的 deduplication_records 记录`,
  );

  console.log("\n📊 清理后统计...\n");

  const countsAfter = await Promise.all([
    prisma.generatedImage
      .count()
      .then((c) => ({ table: "generated_images", count: c })),
    prisma.officeDocument
      .count()
      .then((c) => ({ table: "office_documents", count: c })),
    prisma.officeDocumentVersion
      .count()
      .then((c) => ({ table: "office_document_versions", count: c })),
    prisma.rawData.count().then((c) => ({ table: "raw_data", count: c })),
    prisma.deduplicationRecord
      .count()
      .then((c) => ({ table: "deduplication_records", count: c })),
  ]);

  for (const { table, count } of countsAfter) {
    console.log(`  ${table}: ${count} 条记录`);
  }

  console.log("\n========== 清理完成 ==========");
}

main()
  .catch((e) => {
    console.error("清理失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
