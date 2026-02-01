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
    // Mock ESM modules to avoid compatibility issues in tests
    "^p-limit$": "<rootDir>/__mocks__/p-limit.js",
    "^marked$": "<rootDir>/__mocks__/marked.js",
  },
};
