/**
 * Strip bullet markers from lines that are continuous prose
 * incorrectly formatted as list items by the LLM.
 *
 * Shared by chapter view and continuous view.
 */
export function stripProseBullets(content: string): string {
  // Handle both plain and bold-wrapped markers: - 其一， / - **其一**
  return content.replace(
    /^[-*]\s+(\*{0,2}(?:其[一二三四五六七八九十]|第[一二三四五六七八九十]|一方面|另一方面|这意味着|这使得|这说明|这表明|这也意味|值得[^\s，]{0,4}的是|换言之|因此|对于|从[^\s]{0,4}角度|综合[^\s]{0,4}[，,]|结合[^\s]{0,4}[，,])\*{0,2})/gm,
    '$1'
  );
}
