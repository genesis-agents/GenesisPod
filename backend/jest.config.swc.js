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
    "^p-limit$": "<rootDir>/__mocks__/p-limit.js",
    "^marked$": "<rootDir>/__mocks__/marked.js",
    "pdfjs-dist/legacy/build/pdf.mjs":
      "<rootDir>/../test/__mocks__/pdfjs-dist.ts",
  },
};
