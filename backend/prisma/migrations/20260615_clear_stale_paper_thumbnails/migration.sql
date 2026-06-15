-- Clear stale PAPER thumbnails so they re-extract with the fixed renderer.
--
-- Background: 论文缩略图此前由 node-canvas 渲染，pdfjs v5 在 node-canvas 下无法渲染
-- 文字/图片 → 生成的是近乎空白的白页（仍成功上传 R2）；渲染失败时还会回退缓存
-- arxiv logo / figure 等垃圾 URL。这些已缓存的 thumbnail_url 在前端是“有效非占位”
-- 链接，会被直接展示且不会重新生成。换用 @napi-rs/canvas 后必须清掉旧缓存，
-- 让这些论文下次浏览时重新抽取（渲染出真实首页）。
--
-- 安全性：仅清空 thumbnail_url（可重新生成的派生数据），不删任何资源；幂等。

UPDATE "resources"
SET "thumbnail_url" = NULL
WHERE "type" = 'PAPER'
  AND "thumbnail_url" IS NOT NULL
  AND (
    "thumbnail_url" LIKE '%r2.cloudflarestorage.com%'
    OR "thumbnail_url" LIKE '%backblazeb2.com%'
    OR "thumbnail_url" LIKE '%arxiv.org%'
    OR "thumbnail_url" LIKE '%alphaxiv%'
  );
