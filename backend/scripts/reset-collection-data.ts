/**
 * 重置采集数据脚本
 *
 * 完全清空采集相关数据，以便重新开始采集：
 * 1. raw_data - 原始采集数据（去重的依据）
 * 2. resources - 资源表
 * 3. deduplication_records - 去重记录
 *
 * ⚠️ 警告：此操作不可逆！
 *
 * 运行方式：
 * cd backend && npx ts-node scripts/reset-collection-data.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("========== 重置采集数据 ==========\n");
  console.log("⚠️  警告：此操作将删除所有采集数据，不可逆！\n");

  // 1. 统计当前数据量
  console.log("📊 当前数据量...\n");

  const counts = await Promise.all([
    prisma.rawData.count().then((c) => ({ table: "raw_data", count: c })),
    prisma.resource.count().then((c) => ({ table: "resources", count: c })),
    prisma.deduplicationRecord
      .count()
      .then((c) => ({ table: "deduplication_records", count: c })),
  ]);

  for (const { table, count } of counts) {
    console.log(`  ${table}: ${count} 条记录`);
  }

  console.log("\n🗑️  开始删除数据...\n");

  // 2. 按顺序删除（考虑外键约束）

  // 先删除去重记录
  const deletedDedup = await prisma.deduplicationRecord.deleteMany({});
  console.log(
    `  ✅ 删除了 ${deletedDedup.count} 条 deduplication_records 记录`,
  );

  // 删除资源相关的笔记、评论、点赞等
  const deletedNotes = await prisma.note.deleteMany({});
  console.log(`  ✅ 删除了 ${deletedNotes.count} 条 notes 记录`);

  const deletedComments = await prisma.comment.deleteMany({});
  console.log(`  ✅ 删除了 ${deletedComments.count} 条 comments 记录`);

  const deletedLikes = await prisma.resourceLike.deleteMany({});
  console.log(`  ✅ 删除了 ${deletedLikes.count} 条 resource_likes 记录`);

  // 删除资源（会级联删除相关数据）
  const deletedResources = await prisma.resource.deleteMany({});
  console.log(`  ✅ 删除了 ${deletedResources.count} 条 resources 记录`);

  // 最后删除原始数据
  const deletedRawData = await prisma.rawData.deleteMany({});
  console.log(`  ✅ 删除了 ${deletedRawData.count} 条 raw_data 记录`);

  // 重置采集任务统计
  await prisma.collectionTask.updateMany({
    data: {
      totalItems: 0,
      processedItems: 0,
      successItems: 0,
      failedItems: 0,
      duplicateItems: 0,
      skippedItems: 0,
    },
  });
  console.log("  ✅ 重置了所有采集任务的统计数据");

  // 重置数据源统计
  await prisma.dataSource.updateMany({
    data: {
      totalCollected: 0,
    },
  });
  console.log("  ✅ 重置了所有数据源的统计数据");

  console.log("\n📊 删除后确认...\n");

  const countsAfter = await Promise.all([
    prisma.rawData.count().then((c) => ({ table: "raw_data", count: c })),
    prisma.resource.count().then((c) => ({ table: "resources", count: c })),
    prisma.deduplicationRecord
      .count()
      .then((c) => ({ table: "deduplication_records", count: c })),
  ]);

  for (const { table, count } of countsAfter) {
    console.log(`  ${table}: ${count} 条记录`);
  }

  console.log("\n========== 重置完成 ==========");
  console.log("现在可以重新运行采集任务了！");
}

main()
  .catch((e) => {
    console.error("重置失败:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
