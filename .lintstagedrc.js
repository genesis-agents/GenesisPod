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

/**
 * Convert absolute file paths to paths relative to a subdirectory,
 * always using forward slashes (cross-platform).
 */
function toRelative(baseDir, files) {
  return files.map((f) => path.relative(baseDir, f).replace(/\\/g, "/"));
}

function quote(f) {
  return `"${f}"`;
}

module.exports = {
  "**/*.{json,md,yml,yaml}": ["prettier --write"],

  "backend/**/*.{ts,tsx}": (files) => {
    const rel = toRelative("backend", files).map(quote).join(" ");
    return [
      `npx -w backend eslint --cache --fix ${rel}`,
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },

  "backend/**/*.{js,jsx}": (files) => {
    const rel = toRelative("backend", files).map(quote).join(" ");
    return [
      `npx -w backend eslint --cache --fix ${rel}`,
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },

  "frontend/**/*.{ts,tsx}": (files) => {
    const rel = toRelative("frontend", files).map(quote).join(" ");
    return [
      `npx -w frontend eslint --cache --fix ${rel}`,
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },

  "frontend/**/*.{js,jsx}": (files) => {
    const rel = toRelative("frontend", files).map(quote).join(" ");
    return [
      `npx -w frontend eslint --cache --fix ${rel}`,
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },
};
