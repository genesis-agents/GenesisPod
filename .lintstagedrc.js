/**
 * lint-staged configuration (function form)
 *
 * Why function form instead of JSON glob → command array?
 * - JSON form causes lint-staged to chunk files by maxArgLength (4095 on Windows)
 * - Each chunk spawns a separate ESLint process → full TS program rebuild (~11s each)
 * - 68 files = 3 chunks × 11s startup = 33s wasted on redundant type-checking
 * - Function form receives ALL files at once → single ESLint invocation
 *
 * Why --cache?
 * - ESLint with type-aware rules rebuilds the TS program every invocation (~11s)
 * - --cache skips files whose content + config haven't changed
 * - Second commit in a session: ~1s instead of ~11s for unchanged files
 *
 * Why npx -w <workspace>?
 * - ESLint needs tsconfig.json from the workspace root (backend/ or frontend/)
 * - `cd backend && ...` fails on Windows (lint-staged doesn't use a shell)
 * - `npx -w backend` uses npm workspaces to set correct cwd
 */
const path = require("path");
const fs = require("fs");

/**
 * Convert absolute file paths to paths relative to a subdirectory,
 * always using forward slashes (cross-platform).
 */
function toRelative(baseDir, files) {
  return files.map((f) => path.relative(baseDir, f).replace(/\\/g, "/"));
}

function toRepoRelative(files) {
  return files.map((f) => path.relative(process.cwd(), f).replace(/\\/g, "/"));
}

function quote(f) {
  return `"${f}"`;
}

/**
 * Find existing spec files for changed source files.
 * Only returns tests that actually exist on disk.
 */
function findMatchingTests(files, workspace) {
  const testFiles = [];
  for (const f of files) {
    // Skip test files themselves, fixtures, mocks
    if (/\.(spec|test|e2e-spec)\.(ts|tsx)$/.test(f)) continue;
    if (f.includes("__tests__") || f.includes("__mocks__")) continue;
    if (f.includes("fixtures")) continue;

    // Try co-located .spec.ts
    const specPath = f.replace(/\.ts$/, ".spec.ts").replace(/\.tsx$/, ".spec.tsx");
    if (fs.existsSync(specPath)) {
      testFiles.push(specPath);
      continue;
    }

    // Try __tests__ directory sibling
    const dir = path.dirname(f);
    const base = path.basename(f, path.extname(f));
    const testDir = path.join(dir, "__tests__", `${base}.spec.ts`);
    if (fs.existsSync(testDir)) {
      testFiles.push(testDir);
    }
  }
  return testFiles;
}

module.exports = {
  "**/*.{json,md,yml,yaml}": ["prettier --write"],

  "backend/**/*.{ts,tsx}": (files) => {
    const rel = toRelative("backend", files).map(quote).join(" ");
    const repoRel = toRepoRelative(files).map(quote).join(" ");
    const cmds = [
      `npx -w backend eslint --cache --fix ${rel}`,
      `prettier --write ${repoRel}`,
    ];

    // Auto-run matching tests for changed source files
    const tests = findMatchingTests(files, "backend");
    if (tests.length > 0) {
      const testRel = toRelative("backend", tests).map(quote).join(" ");
      cmds.push(
        `npx -w backend jest --passWithNoTests --bail --runInBand ${testRel}`
      );
    }

    return cmds;
  },

  "backend/**/*.{js,jsx}": (files) => {
    const rel = toRelative("backend", files).map(quote).join(" ");
    const repoRel = toRepoRelative(files).map(quote).join(" ");
    return [
      `npx -w backend eslint --cache --fix ${rel}`,
      `prettier --write ${repoRel}`,
    ];
  },

  "frontend/**/*.{ts,tsx}": (files) => {
    const rel = toRelative("frontend", files).map(quote).join(" ");
    const repoRel = toRepoRelative(files).map(quote).join(" ");
    return [
      `npx -w frontend eslint --cache --fix ${rel}`,
      `prettier --write ${repoRel}`,
    ];
  },

  "frontend/**/*.{js,jsx}": (files) => {
    const rel = toRelative("frontend", files).map(quote).join(" ");
    const repoRel = toRepoRelative(files).map(quote).join(" ");
    return [
      `npx -w frontend eslint --cache --fix ${rel}`,
      `prettier --write ${repoRel}`,
    ];
  },
};
