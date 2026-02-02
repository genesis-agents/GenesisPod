/**
 * Parse CHANGELOG.md (conventional-changelog format) and generate changelog.json
 * Run before build: node scripts/generate-changelog.js
 */
const fs = require('fs');
const path = require('path');

const changelogPath = path.resolve(__dirname, '../../CHANGELOG.md');
const outputPath = path.resolve(__dirname, '../lib/generated/changelog.json');

if (!fs.existsSync(changelogPath)) {
  console.log(
    `CHANGELOG.md not found at ${changelogPath}, generating empty changelog.json`
  );
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, '[]');
  process.exit(0);
}

const content = fs.readFileSync(changelogPath, 'utf-8');

// Match version headers: ### [3.3.31](...) (2026-02-02) or ## [3.3.0](...) (2026-02-01)
const versionRegex =
  /^#{2,3}\s+\[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s+\((\d{4}-\d{2}-\d{2})\)/gm;

const sectionTypeMap = {
  features: 'feature',
  'bug fixes': 'fix',
  refactoring: 'improvement',
  'performance improvements': 'improvement',
  'breaking changes': 'breaking',
};

const entries = [];
const matches = [];

let match;
while ((match = versionRegex.exec(content)) !== null) {
  matches.push({ version: match[1], date: match[2], index: match.index });
}

for (let i = 0; i < matches.length; i++) {
  const { version, date, index } = matches[i];
  const nextIndex =
    i + 1 < matches.length ? matches[i + 1].index : content.length;
  const block = content.slice(index, nextIndex);

  const changes = [];

  // Find section headers within the block: ### Bug Fixes, ### Features, etc.
  const sectionRegex = /^### (.+)$/gm;
  let secMatch;
  const sections = [];
  while ((secMatch = sectionRegex.exec(block)) !== null) {
    // Skip the version header itself
    if (secMatch[1].startsWith('[') || /^\d/.test(secMatch[1])) continue;
    sections.push({ name: secMatch[1].trim(), index: secMatch.index });
  }

  for (let j = 0; j < sections.length; j++) {
    const secEnd =
      j + 1 < sections.length ? sections[j + 1].index : block.length;
    const secBlock = block.slice(sections[j].index, secEnd);
    const type =
      sectionTypeMap[sections[j].name.toLowerCase()] || 'improvement';

    // Match bullet items: * description or * **scope:** description
    const itemRegex = /^[*-]\s+(.+)$/gm;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(secBlock)) !== null) {
      let raw = itemMatch[1];
      // Extract scope if present: **scope:**
      const scopeMatch = raw.match(/^\*\*([^*:]+):?\*\*:?\s*/);
      const scope = scopeMatch ? scopeMatch[1] : null;
      if (scopeMatch) raw = raw.slice(scopeMatch[0].length);
      // Clean: remove trailing commit link ([abc123](url))
      let desc = raw
        .replace(/\s*\(\[[a-f0-9]+\]\([^)]*\)\)\s*$/, '')
        .replace(/\s*\([a-f0-9]{7,}\)\s*$/, '')
        .trim();
      if (desc) {
        changes.push({ type, description: desc });
      }
    }
  }

  entries.push({ version, date, changes });
}

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(entries, null, 2));
console.log(`Generated changelog.json with ${entries.length} versions`);
