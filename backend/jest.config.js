module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
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
  ],
  coverageDirectory: "../coverage",
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
    // @genesis-ai/core sub-path mappings
    "^@genesis-ai/core$": "<rootDir>/../../packages/core/src/index.ts",
    "^@genesis-ai/core/types$":
      "<rootDir>/../../packages/core/src/types/index.ts",
    "^@genesis-ai/core/errors$":
      "<rootDir>/../../packages/core/src/errors/index.ts",
    "^@genesis-ai/core/exceptions$":
      "<rootDir>/../../packages/core/src/exceptions/index.ts",
    "^@genesis-ai/core/interfaces$":
      "<rootDir>/../../packages/core/src/interfaces/index.ts",
    "^@genesis-ai/core/llm$": "<rootDir>/../../packages/core/src/llm/index.ts",
    "^@genesis-ai/core/tools$":
      "<rootDir>/../../packages/core/src/tools/index.ts",
    "^@genesis-ai/core/agents$":
      "<rootDir>/../../packages/core/src/agents/index.ts",
    "^@genesis-ai/core/skills$":
      "<rootDir>/../../packages/core/src/skills/index.ts",
    "^@genesis-ai/core/teams$":
      "<rootDir>/../../packages/core/src/teams/index.ts",
    "^@genesis-ai/core/utils$":
      "<rootDir>/../../packages/core/src/utils/index.ts",
    // Mock ESM modules to avoid compatibility issues in tests
    "^p-limit$": "<rootDir>/__mocks__/p-limit.js",
    "^marked$": "<rootDir>/__mocks__/marked.js",
    "pdfjs-dist/legacy/build/pdf.mjs":
      "<rootDir>/../test/__mocks__/pdfjs-dist.ts",
  },
};
