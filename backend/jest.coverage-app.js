module.exports = {
  ...require('./jest.config.js'),
  collectCoverageFrom: [
    "modules/ai-app/**/*.ts",
    "!**/*.module.ts",
    "!**/index.ts",
    "!**/*.interface.ts",
    "!**/*.dto.ts",
    "!**/*.spec.ts",
  ],
  testPathPattern: "modules/ai-app",
};
