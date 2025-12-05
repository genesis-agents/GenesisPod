-- 清理重复的资源记录
-- 该脚本会保留每组重复记录中最早创建的一条，删除其余的重复记录
-- 使用级联删除或先删除引用记录
-- 注意：数据库列名使用下划线命名法（source_url 而不是 sourceUrl）

-- 首先删除关联的notes记录（引用了要删除的resources）
DELETE FROM notes
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY source_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE source_url IS NOT NULL
      AND source_url != ''
  ) sub WHERE rn > 1
);

-- 删除关联的comments记录
DELETE FROM comments
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY source_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE source_url IS NOT NULL
      AND source_url != ''
  ) sub WHERE rn > 1
);

-- 删除关联的resource_topics记录
DELETE FROM resource_topics
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY source_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE source_url IS NOT NULL
      AND source_url != ''
  ) sub WHERE rn > 1
);

-- 删除关联的resource_tags记录
DELETE FROM resource_tags
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY source_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE source_url IS NOT NULL
      AND source_url != ''
  ) sub WHERE rn > 1
);

-- 现在安全删除重复的resources记录（基于 source_url）
DELETE FROM resources
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY source_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE source_url IS NOT NULL
      AND source_url != ''
  ) sub WHERE rn > 1
);

-- 同样处理 normalized_url 的重复 - 先删除关联记录
DELETE FROM notes
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY normalized_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE normalized_url IS NOT NULL
      AND normalized_url != ''
  ) sub WHERE rn > 1
);

DELETE FROM comments
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY normalized_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE normalized_url IS NOT NULL
      AND normalized_url != ''
  ) sub WHERE rn > 1
);

DELETE FROM resource_topics
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY normalized_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE normalized_url IS NOT NULL
      AND normalized_url != ''
  ) sub WHERE rn > 1
);

DELETE FROM resource_tags
WHERE resource_id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY normalized_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE normalized_url IS NOT NULL
      AND normalized_url != ''
  ) sub WHERE rn > 1
);

-- 删除基于 normalized_url 的重复记录
DELETE FROM resources
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY normalized_url ORDER BY created_at ASC) as rn
    FROM resources
    WHERE normalized_url IS NOT NULL
      AND normalized_url != ''
  ) sub WHERE rn > 1
);
