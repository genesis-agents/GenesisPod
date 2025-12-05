-- 清理重复的资源记录
-- 该脚本会保留每组重复记录中最早创建的一条，删除其余的重复记录
-- 使用级联删除或先删除引用记录

-- 首先删除关联的notes记录（引用了要删除的resources）
DELETE FROM notes
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "sourceUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "sourceUrl" IS NOT NULL
      AND "sourceUrl" != ''
  ) sub WHERE rn > 1
);

-- 删除关联的comments记录
DELETE FROM comments
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "sourceUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "sourceUrl" IS NOT NULL
      AND "sourceUrl" != ''
  ) sub WHERE rn > 1
);

-- 删除关联的resource_topics记录
DELETE FROM resource_topics
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "sourceUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "sourceUrl" IS NOT NULL
      AND "sourceUrl" != ''
  ) sub WHERE rn > 1
);

-- 删除关联的resource_tags记录
DELETE FROM resource_tags
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "sourceUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "sourceUrl" IS NOT NULL
      AND "sourceUrl" != ''
  ) sub WHERE rn > 1
);

-- 现在安全删除重复的resources记录（基于 sourceUrl）
DELETE FROM resources
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "sourceUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "sourceUrl" IS NOT NULL
      AND "sourceUrl" != ''
  ) sub WHERE rn > 1
);

-- 同样处理 normalizedUrl 的重复 - 先删除关联记录
DELETE FROM notes
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "normalizedUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "normalizedUrl" IS NOT NULL
      AND "normalizedUrl" != ''
  ) sub WHERE rn > 1
);

DELETE FROM comments
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "normalizedUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "normalizedUrl" IS NOT NULL
      AND "normalizedUrl" != ''
  ) sub WHERE rn > 1
);

DELETE FROM resource_topics
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "normalizedUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "normalizedUrl" IS NOT NULL
      AND "normalizedUrl" != ''
  ) sub WHERE rn > 1
);

DELETE FROM resource_tags
WHERE "resourceId" IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "normalizedUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "normalizedUrl" IS NOT NULL
      AND "normalizedUrl" != ''
  ) sub WHERE rn > 1
);

-- 删除基于 normalizedUrl 的重复记录
DELETE FROM resources
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY "normalizedUrl" ORDER BY "createdAt" ASC) as rn
    FROM resources
    WHERE "normalizedUrl" IS NOT NULL
      AND "normalizedUrl" != ''
  ) sub WHERE rn > 1
);
