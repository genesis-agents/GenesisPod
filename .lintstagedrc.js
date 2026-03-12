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
 */
const path = require("path");

/**
 * Convert absolute file paths to paths relative to a subdirectory.
 * ESLint must run from backend/ or frontend/ to find tsconfig.json,
 * so we strip the prefix so paths resolve correctly after `cd`.
 */
function toRelative(baseDir, files) {
  return files.map((f) => path.relative(baseDir, f));
}

/** Quote a file path for shell usage (handles spaces). */
function quote(f) {
  return `"${f}"`;
}

module.exports = {
  "**/*.{json,md,yml,yaml}": ["prettier --write"],

  "backend/**/*.{ts,tsx}": (files) => {
    const rel = toRelative("backend", files).map(quote).join(" ");
    return [
      `cd backend && npx eslint --cache --fix ${rel}`,
      // prettier uses absolute paths (works from any cwd)
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },

  "backend/**/*.{js,jsx}": (files) => {
    const rel = toRelative("backend", files).map(quote).join(" ");
    return [
      `cd backend && npx eslint --cache --fix ${rel}`,
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },

  "frontend/**/*.{ts,tsx}": (files) => {
    const rel = toRelative("frontend", files).map(quote).join(" ");
    return [
      `cd frontend && npx eslint --cache --fix ${rel}`,
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },

  "frontend/**/*.{js,jsx}": (files) => {
    const rel = toRelative("frontend", files).map(quote).join(" ");
    return [
      `cd frontend && npx eslint --cache --fix ${rel}`,
      `prettier --write ${files.map(quote).join(" ")}`,
    ];
  },
};
