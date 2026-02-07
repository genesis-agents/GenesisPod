/**
 * Parse CHANGELOG.md (conventional-changelog format) and generate changelog.json
 * Run before build: node scripts/generate-changelog.js
 */
const fs = require('fs');
const path = require('path');

const changelogPath = path.resolve(__dirname, '../CHANGELOG.md');
const outputPath = path.resolve(__dirname, '../lib/generated/changelog.json');

const content = fs.readFileSync(changelogPath, 'utf-8');

// Match version headers: # [3.50.0](...) (2026-02-06) or ## [3.54.0](...) (2026-02-07) or ### [3.50.8](...) (2026-02-06)
const versionRegex =
  /^#{1,3}\s+\[?(\d+\.\d+\.\d+)\]?(?:\([^)]*\))?\s+\((\d{4}-\d{2}-\d{2})\)/gm;

const sectionTypeMap = {
  features: 'feature',
  'bug fixes': 'fix',
  refactoring: 'improvement',
  performance: 'improvement',
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

  // Skip versions with no user-facing changes
  if (changes.length === 0) continue;
  entries.push({ version, date, changes });
}

// Deduplicate: each version should only show changes NEW to that version.
// The CHANGELOG.md may contain cumulative entries (all commits since a base tag),
// so we subtract older-version changes from newer ones.
// Entries are ordered newest-first. For each version, remove changes that also
// appear in the next (older) version, leaving only the delta.
for (let i = 0; i < entries.length - 1; i++) {
  const olderDescs = new Set(entries[i + 1].changes.map((c) => c.description));
  entries[i].changes = entries[i].changes.filter(
    (c) => !olderDescs.has(c.description)
  );
}

// Drop versions that ended up with zero unique changes after dedup
const dedupedEntries = entries.filter((e) => e.changes.length > 0);

// Consolidate patch versions (x.y.1, x.y.2, ...) into their minor version (x.y.0).
// Process oldest-first so the x.y.0 entry is created before patches merge into it.
const consolidated = [];
const minorMap = new Map(); // "major.minor" -> index in consolidated

for (const entry of [...dedupedEntries].reverse()) {
  const [major, minor, patch] = entry.version.split('.').map(Number);
  const minorKey = `${major}.${minor}`;

  if (patch === 0) {
    // Minor/major release: keep as-is, merge any earlier patches already collected
    const existingIdx = minorMap.get(minorKey);
    if (existingIdx !== undefined) {
      // Patches were processed before this minor version; prepend the minor's own changes
      const existingDescs = new Set(
        consolidated[existingIdx].changes.map((c) => c.description)
      );
      const newChanges = entry.changes.filter(
        (c) => !existingDescs.has(c.description)
      );
      consolidated[existingIdx].changes = [
        ...newChanges,
        ...consolidated[existingIdx].changes,
      ];
    } else {
      minorMap.set(minorKey, consolidated.length);
      consolidated.push(entry);
    }
  } else {
    // Patch release: merge into minor version entry
    const existingIdx = minorMap.get(minorKey);
    if (existingIdx !== undefined) {
      const existingDescs = new Set(
        consolidated[existingIdx].changes.map((c) => c.description)
      );
      for (const change of entry.changes) {
        if (!existingDescs.has(change.description)) {
          consolidated[existingIdx].changes.push(change);
        }
      }
      // Use the latest date
      if (entry.date > consolidated[existingIdx].date) {
        consolidated[existingIdx].date = entry.date;
      }
    } else {
      // No minor version entry yet, create a placeholder
      minorMap.set(minorKey, consolidated.length);
      consolidated.push({
        version: `${major}.${minor}.0`,
        date: entry.date,
        changes: [...entry.changes],
      });
    }
  }
}

// Reverse back to newest-first order
consolidated.reverse();

// Ensure output directory exists
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, JSON.stringify(consolidated, null, 2));
console.log(
  `Generated changelog.json with ${consolidated.length} versions (${entries.length - consolidated.length} consolidated/removed)`
);
