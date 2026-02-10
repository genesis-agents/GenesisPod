module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: "tsconfig.json",
    tsconfigRootDir: __dirname,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint/eslint-plugin"],
  extends: [
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/recommended-requiring-type-checking",
    "prettier",
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: [
    ".eslintrc.js",
    "dist",
    "node_modules",
    "test/**/*.ts",
    "test/__mocks__/**/*.ts",
  ],
  rules: {
    // TypeScript规则
    "@typescript-eslint/interface-name-prefix": "off",
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",

    // 类型安全 - 核心规则保持error
    "@typescript-eslint/no-explicit-any": "warn", // 降级为warn，允许合理使用any
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    // Promise handling - temporarily relaxed for legacy code
    "@typescript-eslint/no-floating-promises": "warn",
    "@typescript-eslint/no-misused-promises": "warn",
    "@typescript-eslint/await-thenable": "error",
    "@typescript-eslint/no-unnecessary-type-assertion": "error",

    // Unsafe操作 - 降级为warn（MongoDB/Neo4j等场景需要）
    "@typescript-eslint/no-unsafe-assignment": "warn",
    "@typescript-eslint/no-unsafe-member-access": "warn",
    "@typescript-eslint/no-unsafe-return": "warn",
    "@typescript-eslint/no-unsafe-call": "warn",
    "@typescript-eslint/no-unsafe-argument": "warn",

    // 其他规则调整
    "@typescript-eslint/restrict-template-expressions": "warn",
    "@typescript-eslint/require-await": "warn",
    "@typescript-eslint/prefer-nullish-coalescing": "warn",
    "@typescript-eslint/prefer-optional-chain": "warn",

    // 临时降级 - 技术债务需要逐步清理
    "@typescript-eslint/no-redundant-type-constituents": "warn",
    "@typescript-eslint/no-unsafe-enum-comparison": "warn",
    "@typescript-eslint/ban-ts-comment": "warn",
    "@typescript-eslint/no-var-requires": "warn",
    "@typescript-eslint/await-thenable": "warn",
    "@typescript-eslint/no-base-to-string": "warn",
    "@typescript-eslint/ban-types": "warn",
    "@typescript-eslint/no-implied-eval": "warn",
    "@typescript-eslint/unbound-method": "warn",

    // 代码质量
    "no-console": [
      "error",
      {
        allow: ["warn", "error"],
      },
    ],
    "no-debugger": "error",
    "prefer-const": "error",
    "no-var": "error",

    // NestJS特定规则
    "@typescript-eslint/no-inferrable-types": "off",
  },
  overrides: [
    {
      // Test files need special handling
      files: ["**/*.spec.ts", "**/*.test.ts", "**/test/**/*.ts"],
      rules: {
        // Jest's expect().toHaveBeenCalled() triggers this incorrectly
        "@typescript-eslint/unbound-method": "off",
        // Tests often need to use any for mocking
        "@typescript-eslint/no-explicit-any": "off",
        "@typescript-eslint/no-unsafe-assignment": "off",
        "@typescript-eslint/no-unsafe-member-access": "off",
        "@typescript-eslint/no-unsafe-call": "off",
        "@typescript-eslint/no-unsafe-return": "off",
        "@typescript-eslint/no-unsafe-argument": "off",
      },
    },
    {
      // AI-App modules should use AIEngineFacade instead of direct ai-engine imports
      files: ["**/modules/ai-app/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "warn",
          {
            patterns: [
              {
                group: ["**/ai-engine/tools/registry/*"],
                message:
                  "Use AIEngineFacade.executeTool()/getAvailableTools() instead.",
              },
              {
                group: ["**/ai-engine/capabilities/*"],
                message:
                  "Use AIEngineFacade.getAvailableCapabilities() instead.",
              },
              {
                group: ["**/ai-engine/realtime/**"],
                message:
                  "Use AIEngineFacade.emitToRoom()/emitProgress() instead.",
              },
              {
                group: ["**/ai-engine/memory/stores/*"],
                message:
                  "Use AIEngineFacade.storeMemory()/retrieveMemory() instead.",
              },
            ],
          },
        ],
      },
    },
  ],
};
