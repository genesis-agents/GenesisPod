// PR-8 v1.6 D7 mobile redirect banner
//
// 用法（agent-playground 入口页 / DemoLauncher 顶部）：
//   <MobileRedirectBanner />
//
// 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 14.4 P-A18

'use client';

import * as React from 'react';

const MOBILE_BREAKPOINT_PX = 768;

export function MobileRedirectBanner(): React.ReactElement | null {
  const [isMobile, setIsMobile] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(false);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`);
    setIsMobile(mq.matches);

    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);

    try {
      const stored = window.sessionStorage.getItem(
        'playground_mobile_banner_dismissed'
      );
      if (stored === '1') setDismissed(true);
    } catch {
      // sessionStorage may be blocked in private mode — treat as not dismissed
    }

    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!isMobile || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem('playground_mobile_banner_dismissed', '1');
    } catch {
      // ignore
    }
  };

  return (
    <div
      role="alert"
      className="sticky top-0 z-40 border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <div className="text-xl leading-none">📱</div>
        <div className="flex-1 space-y-1">
          <div className="font-semibold">建议在桌面端使用 agent-playground</div>
          <div className="text-xs text-amber-800">
            该工具涉及长报告浏览、章节重跑、图文标注等场景，桌面端体验更完整。
            手机端仅支持查看已完成 mission 的报告内容，不支持创建 / 重跑 /
            取消。
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="关闭提示"
          className="shrink-0 rounded p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
