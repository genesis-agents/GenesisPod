module.exports = {
  ...require('./jest.config.swc.js'),
  collectCoverageFrom: [
    "modules/ai-engine/**/*.ts",
    "!**/*.module.ts",
    "!**/index.ts",
    "!**/*.interface.ts",
    "!**/*.dto.ts",
    "!**/*.spec.ts",
    "!**/deprecated/**",
    "!**/*.example.ts",
    "!**/*.types.ts",
    "!**/*.prompts.ts",
    "!**/*.constants.ts",
  ],
  testPathPattern: "modules/ai-engine",
};
