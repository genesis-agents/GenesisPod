/**
 * Strip bullet markers from ordinal/transition prose incorrectly formatted as list items.
 *
 * Strategy: find consecutive bullet blocks where at least one bullet starts with
 * an ordinal marker (其一/第一/一方面 etc.). Convert the ENTIRE block to paragraphs,
 * because the non-ordinal bullets in the same block are continuations (这意味着...)
 * or conclusions (对于...) that should also be plain text.
 *
 * Shared by chapter view and continuous view.
 */
export function stripProseBullets(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];

  // Ordinal / transition patterns that identify a bullet block as "prose, not a real list"
  const ordinalPattern =
    /^[-*]\s+\*{0,2}(?:其[一二三四五六七八九十]|第[一二三四五六七八九十百]|[一二三四五六七八九十][，,、是]|一方面|另一方面|首先|其次|再次|最后|此外|然而|因此|总之|综上|总体而言|整体来看)/;

  // Prose-start patterns: single/double long bullets that are clearly prose, not list items
  const proseStartPattern =
    /^[-*]\s+\*{0,2}(?:对[^，,]{1,8}[来而](?:说|言)|这[一些种项]|从[^，,]{1,8}(?:角度|层面|来看|来说|而言)|综[上合]|整体|总[的之体]|值得[注关]|需要[注指强])/;

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Check if this is the start of a bullet block
    if (/^[-*]\s+/.test(line)) {
      // Collect the entire consecutive bullet block
      const block: string[] = [];
      while (i < lines.length) {
        const current = lines[i];
        if (/^[-*]\s+/.test(current)) {
          block.push(current);
          i++;
        } else if (current.trim() === '') {
          // Blank line — include only if next non-blank line is also a bullet
          const nextNonBlank = lines.slice(i + 1).find((l) => l.trim() !== '');
          if (nextNonBlank && /^[-*]\s+/.test(nextNonBlank)) {
            block.push(current);
            i++;
          } else {
            break;
          }
        } else {
          break;
        }
      }

      // Check if ANY bullet in this block has an ordinal/transition marker
      const hasOrdinal = block.some((b) => ordinalPattern.test(b));
      // Check if ANY bullet starts with a prose indicator
      const hasProse = block.some((b) => proseStartPattern.test(b));
      // Heuristic: a block of 1-2 long bullets (>80 chars each) is prose, not a list
      const bulletLines = block.filter((b) => /^[-*]\s+/.test(b));
      const isLongProse =
        bulletLines.length <= 2 &&
        bulletLines.length > 0 &&
        bulletLines.every((b) => b.replace(/^[-*]\s+/, '').length > 80);

      if (hasOrdinal || hasProse || isLongProse) {
        // Strip bullet markers from ALL bullets in this block
        for (const b of block) {
          result.push(/^[-*]\s+/.test(b) ? b.replace(/^[-*]\s+/, '') : b);
        }
      } else {
        // Regular list — keep as-is
        result.push(...block);
      }
    } else {
      result.push(line);
      i++;
    }
  }

  return result.join('\n');
}
