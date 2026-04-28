module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  // PR-X40: roots includes both src/ (unit specs near sources) and
  // ../tests/integration/ (cross-module integration specs that don't belong
  // to any single module). All other paths in this config (coverageDirectory,
  // moduleNameMapper, mock paths) stay relative to rootDir=src.
  roots: ["<rootDir>", "<rootDir>/../tests/integration"],
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        isolatedModules: true, // 跳过类型检查，只做转译，大幅提升速度
      },
    ],
  },
  collectCoverageFrom: [
    "**/*.(t|j)s",
    "!**/*.module.ts",
    "!**/index.ts",
    "!**/main.ts",
    "!**/*.interface.ts",
    "!**/*.dto.ts",
    "!**/*.entity.ts",
    "!**/*.spec.ts",
    "!**/__tests__/**",
    "!**/__mocks__/**",
    "!**/deprecated/**",
    "!**/*.example.ts",
    "!**/*.prompt.ts",
    "!**/*-team.config.ts",
    "!**/builtin-templates.ts",
    "!**/agent-roles.ts",
    "!**/ai-prompts.config.ts",
    "!**/*.types.ts",
    "!**/slides/templates/base/components.ts",
  ],
  coverageDirectory: "../coverage",
  coveragePathIgnorePatterns: [
    "node_modules",
    "deprecated",
    "\\.example\\.ts$",
    "\\.d\\.ts$",
  ],
  testEnvironment: "node",

  // 覆盖率阈值 - Phase 1: 50%
  // 根据测试标准文档，采用渐进式提升策略
  // Phase 1 (Week 1-2): 50%
  // Phase 2 (Week 3-6): 70%
  // Phase 3 (Week 7+): 85%
  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50,
    },
  },

  // 覆盖率报告格式
  coverageReporters: ["text", "text-summary", "lcov", "html"],

  // 模块路径映射（支持@/路径别名）
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // Mock ESM modules to avoid compatibility issues in tests
    "^p-limit$": "<rootDir>/__mocks__/p-limit.js",
    "^marked$": "<rootDir>/__mocks__/marked.js",
    "^exceljs$": "<rootDir>/__mocks__/exceljs.js",
    "^pptxgenjs$": "<rootDir>/__mocks__/pptxgenjs.js",
    "^jsdom$": "<rootDir>/__mocks__/jsdom.js",
    "pdfjs-dist/legacy/build/pdf.mjs":
      "<rootDir>/../tests/__mocks__/pdfjs-dist.ts",
  },
};
