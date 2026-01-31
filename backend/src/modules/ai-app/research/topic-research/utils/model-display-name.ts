import type { PrismaService } from "@/common/prisma/prisma.service";

/**
 * 批量查询 modelId → displayName 映射
 * 用于将内部 modelId（如 ep-xxx 接入点 ID）转换为用户可读的展示名称
 */
export async function getModelDisplayNameMap(
  prisma: PrismaService,
  modelIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (modelIds.length === 0) return map;

  const uniqueIds = [...new Set(modelIds)];
  const models = await prisma.aIModel.findMany({
    where: { modelId: { in: uniqueIds } },
    select: { modelId: true, displayName: true },
  });

  for (const m of models) {
    map.set(m.modelId, m.displayName);
  }
  return map;
}
