/**
 * Jest 配置 - SWC 版本（比 ts-jest 快 5-10x，用于 coverage 跑）
 */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": [
      "@swc/jest",
      {
        jsc: {
          parser: { syntax: "typescript", decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: "es2020",
        },
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
  ],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  coverageReporters: ["text", "text-summary", "json-summary"],
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
