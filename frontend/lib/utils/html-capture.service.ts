/**
 * HTML Capture Service
 * 从 DOM 中提取渲染后的 HTML + CSS，用于 WYSIWYG 导出
 */

export interface CaptureOptions {
  /** 内联关键 CSS 以确保 Puppeteer 渲染一致 */
  inlineStyles?: boolean;
  /** 冻结交互式图表为静态 SVG */
  freezeCharts?: boolean;
  /** 等待并冻结 Mermaid 图 */
  freezeMermaid?: boolean;
  /** 最大等待时间 (ms) */
  timeout?: number;
}

export interface CaptureResult {
  html: string;
  css: string;
}

export class HtmlCaptureService {
  /**
   * 主入口：捕获容器的 HTML + 所有相关 CSS
   */
  static async capture(
    containerSelector: string,
    options: CaptureOptions = {}
  ): Promise<CaptureResult> {
    const {
      inlineStyles = true,
      freezeCharts = true,
      freezeMermaid = true,
      timeout = 5000,
    } = options;

    const container = document.querySelector(containerSelector);
    if (!container) {
      throw new Error(`Container not found: ${containerSelector}`);
    }

    // 克隆以避免修改 live DOM
    const clone = container.cloneNode(true) as HTMLElement;

    // 处理交互式图表
    if (freezeCharts) {
      HtmlCaptureService.freezeRechartsElements(
        container as HTMLElement,
        clone
      );
    }

    // 处理 Mermaid 图
    if (freezeMermaid) {
      await HtmlCaptureService.captureMermaid(
        container as HTMLElement,
        clone,
        timeout
      );
    }

    // 内联关键样式
    if (inlineStyles) {
      HtmlCaptureService.inlineCriticalStyles(container as HTMLElement, clone);
    }

    // 移除交互元素的事件处理
    HtmlCaptureService.removeInteractivity(clone);

    // 提取 CSS (filtered by selectors used in container)
    const css = HtmlCaptureService.extractStyles(container as HTMLElement);

    return {
      html: clone.outerHTML,
      css,
    };
  }

  /**
   * 提取页面上影响容器内容的样式表（基于选择器过滤）
   */
  private static extractStyles(container: HTMLElement): string {
    const styles: string[] = [];

    // 收集容器中使用的选择器信息
    const elements = container.querySelectorAll('*');
    const usedClasses = new Set<string>();
    const usedTags = new Set<string>();
    const usedIds = new Set<string>();

    for (const el of Array.from(elements)) {
      usedTags.add(el.tagName.toLowerCase());
      el.classList.forEach((cls) => usedClasses.add(cls));
      if (el.id) usedIds.add(el.id);
    }
    // Also add the container itself
    usedTags.add(container.tagName.toLowerCase());
    container.classList.forEach((cls) => usedClasses.add(cls));
    if (container.id) usedIds.add(container.id);

    try {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          // 跳过跨域样式表
          if (sheet.href && !sheet.href.startsWith(window.location.origin)) {
            continue;
          }

          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;

          for (const rule of Array.from(rules)) {
            if (rule instanceof CSSStyleRule) {
              // 快速启发式：检查选择器是否可能匹配容器中的元素
              if (
                this.selectorMightMatch(
                  rule.selectorText,
                  usedClasses,
                  usedTags,
                  usedIds
                )
              ) {
                styles.push(rule.cssText);
              }
            } else if (rule instanceof CSSMediaRule) {
              // @media: 只保留内部有匹配规则的 media query
              const matchedInner: string[] = [];
              for (const inner of Array.from(rule.cssRules)) {
                if (
                  inner instanceof CSSStyleRule &&
                  this.selectorMightMatch(
                    inner.selectorText,
                    usedClasses,
                    usedTags,
                    usedIds
                  )
                ) {
                  matchedInner.push(inner.cssText);
                }
              }
              if (matchedInner.length > 0) {
                styles.push(
                  `@media ${rule.conditionText} { ${matchedInner.join(' ')} }`
                );
              }
            } else if (rule instanceof CSSKeyframesRule) {
              // @keyframes: 只保留容器中实际使用的动画
              const animName = rule.name;
              const isUsed = Array.from(elements).some((el) => {
                const computed = window.getComputedStyle(el);
                return computed.animationName.includes(animName);
              });
              if (isUsed) {
                styles.push(rule.cssText);
              }
            } else if (rule instanceof CSSFontFaceRule) {
              // @font-face: 只保留容器中实际使用的字体
              const fontFamily = rule.style
                .getPropertyValue('font-family')
                .replace(/['"]/g, '')
                .trim();
              if (fontFamily) {
                const isUsed = Array.from(elements).some((el) => {
                  const computed = window.getComputedStyle(el);
                  return computed.fontFamily.includes(fontFamily);
                });
                if (isUsed) {
                  styles.push(rule.cssText);
                }
              }
            }
            // 其他 at-rules（@layer, @supports 等）跳过以减少体积
          }
        } catch {
          // 跨域样式表无法访问 cssRules，跳过
        }
      }
    } catch {
      // 降级：收集 <style> 标签内容
      const styleTags = document.querySelectorAll('style');
      for (const tag of Array.from(styleTags)) {
        styles.push(tag.textContent || '');
      }
    }

    return styles.join('\n');
  }

  /**
   * 启发式判断 CSS 选择器是否可能匹配容器中的元素
   */
  private static selectorMightMatch(
    selector: string,
    usedClasses: Set<string>,
    usedTags: Set<string>,
    usedIds: Set<string>
  ): boolean {
    // 通配符和全局选择器总是包含
    if (
      selector === '*' ||
      selector.startsWith(':root') ||
      selector.startsWith('html') ||
      selector.startsWith('body')
    ) {
      return true;
    }

    // 检查类名匹配
    const classMatches = selector.match(/\.([a-zA-Z0-9_-]+)/g);
    if (classMatches) {
      return classMatches.some((cls) => usedClasses.has(cls.slice(1)));
    }

    // 检查 ID 匹配
    const idMatches = selector.match(/#([a-zA-Z0-9_-]+)/g);
    if (idMatches) {
      return idMatches.some((id) => usedIds.has(id.slice(1)));
    }

    // 检查标签名匹配
    const tagMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9]*)/);
    if (tagMatch) {
      return usedTags.has(tagMatch[1].toLowerCase());
    }

    // 无法确定的情况下保留
    return true;
  }

  /**
   * 冻结 Recharts 交互式图表为静态 SVG
   * Recharts 使用 SVG 渲染，但包含事件监听器和动画元素
   */
  private static freezeRechartsElements(
    original: HTMLElement,
    clone: HTMLElement
  ): void {
    // 查找原始 DOM 中的 recharts 容器
    const originalCharts = original.querySelectorAll('.recharts-wrapper');
    const cloneCharts = clone.querySelectorAll('.recharts-wrapper');

    for (let i = 0; i < originalCharts.length; i++) {
      const origChart = originalCharts[i];
      const cloneChart = cloneCharts[i];
      if (!origChart || !cloneChart) continue;

      // 从原始获取渲染后的 SVG（包含正确的尺寸和位置）
      const origSvg = origChart.querySelector('svg');
      if (!origSvg) continue;

      // 克隆 SVG
      const svgClone = origSvg.cloneNode(true) as SVGElement;

      // 移除 Recharts 特有的交互层
      const interactiveElements = svgClone.querySelectorAll(
        '.recharts-tooltip-wrapper, .recharts-active-dot, [class*="cursor"]'
      );
      for (const el of Array.from(interactiveElements)) {
        el.remove();
      }

      // 移除事件监听属性
      const allElements = svgClone.querySelectorAll('*');
      for (const el of Array.from(allElements)) {
        for (const attr of Array.from(el.attributes)) {
          if (attr.name.startsWith('on')) {
            el.removeAttribute(attr.name);
          }
        }
      }

      // 替换克隆中的 chart
      cloneChart.innerHTML = '';
      cloneChart.appendChild(svgClone);
    }
  }

  /**
   * 捕获 Mermaid 图表（它们可能是异步渲染的）
   */
  private static async captureMermaid(
    original: HTMLElement,
    clone: HTMLElement,
    timeout: number
  ): Promise<void> {
    const mermaidContainers = original.querySelectorAll(
      '[data-mermaid], .mermaid, pre code.language-mermaid'
    );
    if (mermaidContainers.length === 0) return;

    // 等待 Mermaid SVG 渲染完成
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      const svgs = original.querySelectorAll(
        '.mermaid svg, [data-mermaid] svg'
      );
      if (svgs.length >= mermaidContainers.length) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    // 将渲染后的 SVG 复制到克隆中
    const originalMermaids = original.querySelectorAll(
      '.mermaid, [data-mermaid]'
    );
    const cloneMermaids = clone.querySelectorAll('.mermaid, [data-mermaid]');

    for (let i = 0; i < originalMermaids.length; i++) {
      const origEl = originalMermaids[i];
      const cloneEl = cloneMermaids[i];
      if (!origEl || !cloneEl) continue;

      const svg = origEl.querySelector('svg');
      if (svg) {
        const svgClone = svg.cloneNode(true) as SVGElement;
        // 确保 SVG 有明确的尺寸
        if (!svgClone.getAttribute('width')) {
          const rect = svg.getBoundingClientRect();
          svgClone.setAttribute('width', `${rect.width}`);
          svgClone.setAttribute('height', `${rect.height}`);
        }
        cloneEl.innerHTML = '';
        cloneEl.appendChild(svgClone);
      }
    }
  }

  /**
   * 内联关键计算样式
   * 确保即使没有原始样式表，渲染也能匹配
   */
  private static inlineCriticalStyles(
    original: HTMLElement,
    clone: HTMLElement
  ): void {
    // 需要保留计算样式的关键属性
    const criticalProps = [
      'color',
      'background-color',
      'font-size',
      'font-weight',
      'font-family',
      'line-height',
      'text-align',
      'padding',
      'margin',
      'border',
      'border-radius',
      'display',
      'flex-direction',
      'gap',
      'grid-template-columns',
      'width',
      'max-width',
      'min-height',
    ];

    // 只对直接子元素和标题/关键元素进行内联
    const criticalSelectors =
      'h1, h2, h3, h4, h5, h6, table, th, td, blockquote, .callout, pre, code';
    const originalElements = original.querySelectorAll(criticalSelectors);
    const cloneElements = clone.querySelectorAll(criticalSelectors);

    for (let i = 0; i < originalElements.length; i++) {
      const origEl = originalElements[i] as HTMLElement;
      const cloneEl = cloneElements[i] as HTMLElement;
      if (!origEl || !cloneEl) continue;

      const computed = window.getComputedStyle(origEl);
      const inlineStyles: string[] = [];

      for (const prop of criticalProps) {
        const value = computed.getPropertyValue(prop);
        if (value && value !== 'initial' && value !== 'inherit') {
          inlineStyles.push(`${prop}: ${value}`);
        }
      }

      if (inlineStyles.length > 0) {
        const existing = cloneEl.getAttribute('style') || '';
        cloneEl.setAttribute(
          'style',
          existing
            ? `${existing}; ${inlineStyles.join('; ')}`
            : inlineStyles.join('; ')
        );
      }
    }
  }

  /**
   * 移除克隆中的交互性元素
   */
  private static removeInteractivity(clone: HTMLElement): void {
    // 移除所有 on* 事件属性
    const allElements = clone.querySelectorAll('*');
    for (const el of Array.from(allElements)) {
      for (const attr of Array.from(el.attributes)) {
        if (attr.name.startsWith('on') || attr.name.startsWith('data-radix')) {
          el.removeAttribute(attr.name);
        }
      }
    }

    // 移除 script 标签
    const scripts = clone.querySelectorAll('script');
    for (const script of Array.from(scripts)) {
      script.remove();
    }

    // 移除可能干扰布局的 hidden 元素
    const hiddenElements = clone.querySelectorAll('[aria-hidden="true"]');
    for (const el of Array.from(hiddenElements)) {
      // 保留 decorative hidden 元素（如图标），只移除真正隐藏的
      const style = (el as HTMLElement).style;
      if (style.display === 'none' || style.visibility === 'hidden') {
        el.remove();
      }
    }
  }
}
