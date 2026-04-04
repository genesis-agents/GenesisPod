module.exports = {
  ...require("./jest.config.swc.js"),
  collectCoverageFrom: [
    "modules/ai-app/**/*.ts",
    "!**/*.module.ts",
    "!**/index.ts",
    "!**/*.interface.ts",
    "!**/*.dto.ts",
    "!**/*.spec.ts",
    "!**/*.benchmark.ts",
    "!**/demo/**",
    "!**/*.example.ts",
    "!**/*.types.ts",
    "!**/*.prompts.ts",
    "!**/*.constants.ts",
    "!**/__tests__/**",
  ],
  testPathPattern: "modules/ai-app",
};
