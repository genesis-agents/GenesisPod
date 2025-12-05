-- 清理重复的资源记录
-- 该脚本会保留每组重复记录中最早创建的一条，删除其余的重复记录

-- 首先清理 YOUTUBE_VIDEO 类型的重复记录（基于 sourceUrl）
WITH duplicates AS (
  SELECT id, "sourceUrl", "createdAt",
         ROW_NUMBER() OVER (PARTITION BY "sourceUrl" ORDER BY "createdAt" ASC) as rn
  FROM resources
  WHERE type = 'YOUTUBE_VIDEO'
    AND "sourceUrl" IS NOT NULL
    AND "sourceUrl" != ''
)
DELETE FROM resources
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- 清理其他类型的重复资源（基于 sourceUrl）
WITH duplicates AS (
  SELECT id, "sourceUrl", "createdAt",
         ROW_NUMBER() OVER (PARTITION BY "sourceUrl" ORDER BY "createdAt" ASC) as rn
  FROM resources
  WHERE "sourceUrl" IS NOT NULL
    AND "sourceUrl" != ''
)
DELETE FROM resources
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- 清理基于 normalizedUrl 的重复记录
WITH duplicates AS (
  SELECT id, "normalizedUrl", "createdAt",
         ROW_NUMBER() OVER (PARTITION BY "normalizedUrl" ORDER BY "createdAt" ASC) as rn
  FROM resources
  WHERE "normalizedUrl" IS NOT NULL
    AND "normalizedUrl" != ''
)
DELETE FROM resources
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- 添加唯一索引以防止未来出现重复（可选，如果业务需要）
-- CREATE UNIQUE INDEX IF NOT EXISTS idx_resources_source_url_unique
--   ON resources("sourceUrl")
--   WHERE "sourceUrl" IS NOT NULL AND "sourceUrl" != '';
