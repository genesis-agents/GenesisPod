/**
 * ModelBadges
 *
 * 模型来源徽章组件 — 在自定义下拉/卡片场景里渲染 chip 标识：
 *   - 绿色 "My Key": 用户配了 BYOK
 *   - 紫色 "Multi": 多模型混合
 *
 * `<select>` 原生 <option> 不能放 React 组件，那种场景请用 modelLabelSuffix(model)
 * 拿到纯文本（`· 我的 Key` / `· 系统 Key`）。
 *
 * 来源：从 app/ai-ask/page.tsx 提到 components/common/，作为唯一来源给所有
 * 页面复用，避免每个页面再各搞一套。
 */
'use client';

import type { AIModel } from '@/hooks';

interface BadgeShape {
  isUserKey?: boolean;
  isMixture?: boolean;
}

export function ModelBadges({ model }: { model: BadgeShape | AIModel }) {
  return (
    <>
      {(model as BadgeShape).isMixture && (
        <span className="shrink-0 rounded bg-gradient-to-r from-violet-500 to-fuchsia-500 px-1 py-0.5 text-[10px] text-white">
          Multi
        </span>
      )}
      {(model as BadgeShape).isUserKey && (
        <span className="shrink-0 rounded bg-gradient-to-r from-emerald-500 to-teal-500 px-1 py-0.5 text-[10px] text-white">
          My Key
        </span>
      )}
    </>
  );
}

/**
 * `<select>` 场景下的纯文本后缀（option 内不能放 component）。
 * 用于：app/page.tsx, app/explore/youtube/page.tsx, app/admin/workspace/page.tsx
 *      及 ai-teams 等所有用原生 select 的地方。
 *
 * 例：`{model.name} ({model.provider}){modelLabelSuffix(model)}`
 *     渲染："ChatGPT (OpenAI) · 我的 Key"
 */
export function modelLabelSuffix(model: BadgeShape): string {
  if (model.isUserKey) return ' · 我的 Key';
  return ' · 系统 Key';
}
