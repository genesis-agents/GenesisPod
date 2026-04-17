require('ts-node/register/transpile-only');
const { PrismaClient } = require('@prisma/client');
const {
  validateLatexDelimiters,
} = require('./src/common/utils/latex-delimiter-validator.ts');

const prisma = new PrismaClient();

async function main() {
  // Deep survey: 60 latest reports
  const reports = await prisma.topicReport.findMany({
    orderBy: { generatedAt: 'desc' },
    take: 60,
    select: { id: true, topicId: true, fullReport: true },
  });

  const globalKindCounts = {};
  let badCount = 0;
  const damageSnippets = new Map(); // pattern signature → sample

  for (const r of reports) {
    const md = r.fullReport || '';
    if (!md) continue;
    const v = validateLatexDelimiters(md);
    if (v.issues.length > 0) badCount++;
    for (const i of v.issues) {
      globalKindCounts[i.kind] = (globalKindCounts[i.kind] || 0) + 1;
    }

    // Look for UNKNOWN patterns — things that DON'T match any validator kind
    // Common "could be damage" patterns to sample:
    const suspicious = [
      // $1 artifacts from old bug
      { re: /\${3,}1\${2,}/g, key: 'literal-$1-artifact' },
      // $$ inside subscript brace
      { re: /\}\$\$/g, key: 'dollars-after-brace' },
      // triple $ anywhere (often wrong)
      { re: /\${3,}/g, key: 'three-plus-dollars' },
      // $ adjacent to ! or @ or weird
      { re: /\$[!@#]/g, key: 'dollar-weird-char' },
      // backslash followed by comma (LaTeX thin space — could be real)
      { re: /\\,/g, key: 'backslash-comma' },
      // backslash-newline (LaTeX \\ for line break outside env — often wrong)
      { re: /\\\\(?!\w)/g, key: 'backslash-backslash-bare' },
      // unclosed brace at end of math
      { re: /\${[^}]*\$/g, key: 'dollar-brace-no-close' },
      // numerical subscript like x_1 — usually ok but might hint at issue
      { re: /[a-zA-Z]_\d+/g, key: 'bare-num-subscript' },
      // Mermaid-like pattern that shouldn't be in reports
      { re: /```mermaid/g, key: 'mermaid-block' },
    ];
    for (const { re, key } of suspicious) {
      const matches = md.match(re);
      if (matches && matches.length > 0) {
        if (!damageSnippets.has(key)) {
          const firstIdx = md.search(re);
          const context = md.substring(
            Math.max(0, firstIdx - 50),
            Math.min(md.length, firstIdx + 100),
          );
          damageSnippets.set(key, {
            count: matches.length,
            sample: context,
            reportId: r.id.slice(0, 8),
          });
        } else {
          damageSnippets.get(key).count += matches.length;
        }
      }
    }
  }

  console.log('=== 60 reports surveyed ===');
  console.log(`${badCount}/${reports.length} have validator issues`);
  console.log('\n=== Validator issue distribution ===');
  for (const [k, c] of Object.entries(globalKindCounts).sort(
    (a, b) => b[1] - a[1],
  )) {
    console.log(`  ${k}: ${c}`);
  }

  console.log('\n=== Suspicious pattern sweep (outside validator) ===');
  for (const [key, data] of damageSnippets) {
    console.log(`\n[${key}] count=${data.count}, from ${data.reportId}`);
    console.log(
      `  ${JSON.stringify(data.sample.replace(/\n/g, '⏎').slice(0, 150))}`,
    );
  }

  await prisma.$disconnect();
}
main().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
