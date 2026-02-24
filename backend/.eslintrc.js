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
    "@typescript-eslint/no-explicit-any": "error", // Production code must not use any (tests override to off)
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    // Promise handling - temporarily relaxed for legacy code
    "@typescript-eslint/no-floating-promises": "error",
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
    // Note: await-thenable is already "error" above - do NOT re-declare here
    "@typescript-eslint/no-base-to-string": "warn",
    "@typescript-eslint/ban-types": "warn",
    "@typescript-eslint/no-implied-eval": "error", // Promoted: eval-like code is a security risk
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
      // AI-App modules must access AI Engine only through AIEngineFacade or Registry
      // See CLAUDE.md: "所有 AI App 模块只通过 AIEngineFacade 和 Registry 访问 AI Engine"
      files: ["**/modules/ai-app/**/*.ts"],
      excludedFiles: [
        // Agent files may extend BaseAgent/PlanBasedAgent (inheritance pattern)
        "**/agents/*.agent.ts",
        // Team config files must reference abstract interfaces
        "**/*.config.ts",
        // Skill implementations extend engine skill base classes
        "**/skills/*.skill.ts",
        // Re-export adapter files
        "**/common/*.service.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              // ★ Orchestration services — must go through AIEngineFacade
              {
                group: [
                  "**/ai-engine/orchestration/services/intent-detection*",
                  "**/ai-engine/orchestration/services/output-reviewer*",
                  "**/ai-engine/orchestration/services/context-evolution*",
                  "**/ai-engine/orchestration/services/circuit-breaker*",
                  "**/ai-engine/orchestration/services/agent-executor*",
                  "**/ai-engine/orchestration/services/task-planner*",
                  "**/ai-engine/orchestration/services/task-decomposer*",
                ],
                message:
                  "Inject AIEngineFacade and access via facade.intentDetector / facade.outputReviewer / etc.",
              },
              // ★ Team orchestration services — must go through AIEngineFacade
              {
                group: [
                  "**/ai-engine/teams/orchestrator/mission-orchestrator*",
                  "**/ai-engine/teams/factory/team-factory*",
                ],
                message:
                  "Use facade.missionOrchestrator or facade.teamFactory instead.",
              },
              // ★ Long-content engine service — must go through AIEngineFacade
              {
                group: [
                  "**/ai-engine/long-content/services/long-content-engine*",
                ],
                message: "Use facade.longContentEngine instead.",
              },
              // ★ AI capabilities — must go through AIEngineFacade
              {
                group: ["**/ai-engine/capabilities/*"],
                message:
                  "Use AIEngineFacade.capabilityGetSkillPrompts() or facade.capabilityResolverService instead.",
              },
              // ★ Realtime — must go through AIEngineFacade
              {
                group: ["**/ai-engine/realtime/**"],
                message:
                  "Use AIEngineFacade.emitToRoom()/emitProgress() instead.",
              },
              // ★ Memory stores — must go through AIEngineFacade
              {
                group: ["**/ai-engine/memory/stores/*"],
                message:
                  "Use AIEngineFacade.storeMemory()/retrieveMemory() instead.",
              },
              // ★ Content fetch service — must go through AIEngineFacade
              {
                group: ["**/ai-engine/content-fetch/content-fetch.service*"],
                message: "Use facade.contentFetch instead.",
              },
            ],
          },
        ],
      },
    },
  ],
};
