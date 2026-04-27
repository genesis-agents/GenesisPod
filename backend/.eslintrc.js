module.exports = {
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: ["tsconfig.json", "tsconfig.eslint.json"],
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
    "scripts",
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
      files: [
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/test/**/*.ts",
        "**/__tests__/**/*.ts",
      ],
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
        // Test files may directly import internal paths for mocking purposes
        "no-restricted-imports": "off",
      },
    },
    {
      // AI-App modules must access AI Engine only through AIEngineFacade or Registry
      // See CLAUDE.md: "所有 AI App 模块只通过 AIEngineFacade 和 Registry 访问 AI Engine"
      files: ["**/modules/ai-app/**/*.ts"],
      excludedFiles: [
        // Test files may directly import internals for mocking
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/__tests__/**/*.ts",
        // ★ Zero exclusions for production code — all ai-engine imports must go through facade
        // Agent base classes: facade/base-classes.ts
        // Config/Skill/Bridge files: facade/index.ts
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              // ════════════════════════════════════════════════════════════
              // ★ SECTION 1: Registry & Agent internals
              //   AgentRegistry, TeamRegistry, RoleRegistry, SkillRegistry,
              //   ToolRegistry, BUILTIN_TOOLS, BUILTIN_ROLES, IAgent, etc.
              //   are all re-exported from facade/index.ts — use that path.
              // ════════════════════════════════════════════════════════════
              {
                group: ["**/ai-engine/agents/**"],
                message:
                  "Import AgentRegistry, IAgent, BaseAgent types, etc. from 'ai-engine/facade'. " +
                  "If you need to extend BaseAgent/PlanBasedAgent (class inheritance), add your file to ESLint excludedFiles.",
              },
              {
                group: ["**/ai-engine/tools/**"],
                message:
                  "Import ToolRegistry, ToolContext, ITool, BUILTIN_TOOLS, etc. from 'ai-engine/facade'.",
              },
              {
                group: ["**/ai-engine/core/**"],
                message:
                  "Import BUILTIN_TOOLS, BUILTIN_ROLES, agent type constants, etc. from 'ai-engine/facade'.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 2: LLM types
              //   TaskProfile, AIModelType, ModelFallbackOptions, AIModelConfig
              //   are re-exported from facade/index.ts.
              // ════════════════════════════════════════════════════════════
              {
                group: ["**/ai-engine/llm/**"],
                message:
                  "Import TaskProfile, AIModelType, ModelFallbackOptions, etc. from 'ai-engine/facade'.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 3: Skills internals
              //   SkillRegistry and PromptSkillBridge are re-exported from facade.
              // ════════════════════════════════════════════════════════════
              {
                group: ["**/ai-engine/skills/**"],
                message:
                  "Import SkillRegistry, SkillContext, PromptSkillBridge, etc. from 'ai-engine/facade'. " +
                  "If you need to implement ISkill (class inheritance), add your file to ESLint excludedFiles.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 4: Teams internals
              //   TeamRegistry, RoleRegistry, TeamConfig, WorkflowConfig,
              //   ConstraintProfile, createConstraintProfile, MissionContext,
              //   MissionEvent, ITeam, etc. are re-exported from facade.
              // ════════════════════════════════════════════════════════════
              {
                group: [
                  "**/ai-engine/teams/abstractions/**",
                  "**/ai-engine/teams/constraints/**",
                  "**/ai-engine/teams/registry/**",
                  "**/ai-engine/teams/services/**",
                ],
                message:
                  "Import TeamRegistry, RoleRegistry, TeamConfig, WorkflowConfig, ConstraintProfile, " +
                  "createConstraintProfile, MissionEvent, MissionContext, ITeam, etc. from 'ai-engine/facade'. " +
                  "For team *.config.ts files (which reference many abstractions), they are in ESLint excludedFiles.",
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

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 5: Orchestration internals
              // ════════════════════════════════════════════════════════════
              // Barrel index (covers 'import ... from ".../orchestration/services"'):
              {
                group: ["**/ai-engine/orchestration/services"],
                message:
                  "Import orchestration types from 'ai-engine/facade'. " +
                  "Use AIEngineFacade getters instead of the barrel index.",
              },
              // Specific services with dedicated facade accessors:
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
              // Broader orchestration internals:
              {
                group: [
                  "**/ai-engine/orchestration/executors/**",
                  "**/ai-engine/orchestration/state-machine/**",
                  "**/ai-engine/orchestration/utils/**",
                  "**/ai-engine/orchestration/interfaces/**",
                  "**/ai-engine/orchestration/capabilities/**",
                ],
                message:
                  "Access orchestration internals only through AIEngineFacade. " +
                  "If a type is missing from facade/index.ts, add it there first.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 6: Knowledge bounded context internals
              //   Covers: knowledge/rag, knowledge/search, knowledge/evidence,
              //   knowledge/memory — all types re-exported from facade/index.ts.
              // ════════════════════════════════════════════════════════════
              {
                group: ["**/ai-engine/knowledge/rag/**"],
                message:
                  "Import EmbeddingResult, SimilaritySearchOptions, SimilarityResult from 'ai-engine/facade'. " +
                  "For RAGPipelineService, add it to facade/index.ts exports first.",
              },
              // Memory — must go through AIEngineFacade
              {
                group: [
                  "**/ai-engine/knowledge/memory/stores/**",
                  "**/ai-engine/knowledge/memory/abstractions/**",
                  "**/ai-engine/knowledge/memory/memory-coordinator.service*",
                ],
                message:
                  "Use AIEngineFacade.storeMemory()/retrieveMemory() instead.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 7: Content bounded context internals
              //   Covers: content/long-form, content/fetch, content/image,
              //   content/analysis, content/synthesis.
              // ════════════════════════════════════════════════════════════
              {
                group: [
                  "**/ai-engine/content/long-form/services/long-content-engine*",
                ],
                message: "Use facade.longContentEngine instead.",
              },
              {
                group: [
                  "**/ai-engine/content/long-form/interfaces/**",
                  "**/ai-engine/content/long-form/types/**",
                  "**/ai-engine/content/long-form/long-content.module*",
                ],
                message:
                  "Do not import LongContentModule or its interfaces directly. " +
                  "AiEngineModule already includes it. Add missing types to facade/index.ts.",
              },
              // Content fetch — must go through AIEngineFacade
              {
                group: ["**/ai-engine/content/fetch/**"],
                message: "Use facade.contentFetch instead.",
              },
              // Image engine internals
              {
                group: ["**/ai-engine/content/image/**"],
                message:
                  "Add image matching types to facade/index.ts, then import from 'ai-engine/facade'.",
              },
              // Content analysis internals
              {
                group: ["**/ai-engine/content/analysis/**"],
                message:
                  "Add content analysis types to facade/index.ts, then import from 'ai-engine/facade'.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 8: Infra bounded context internals
              //   Covers: infra/realtime, infra/observability, infra/a2a.
              // ════════════════════════════════════════════════════════════
              // Realtime — must go through AIEngineFacade
              {
                group: ["**/ai-engine/runtime/realtime/**"],
                message:
                  "Use AIEngineFacade.emitToRoom()/emitProgress() instead.",
              },
              // MCP abstractions
              {
                group: ["**/ai-engine/mcp/**"],
                message:
                  "Add MCP abstractions to facade/index.ts, then import from 'ai-engine/facade'.",
              },
              // ════════════════════════════════════════════════════════════
              // ★ SECTION 9: Preventive — not yet accessed but must stay clean
              //   Uses top-level bounded context paths to cover all sub-paths.
              // ════════════════════════════════════════════════════════════
              {
                group: [
                  // Safety bounded context: guardrails, quality, constraint
                  "**/ai-engine/safety/**",
                  // Knowledge bounded context (catchall beyond rag/memory above)
                  "**/ai-engine/knowledge/search/**",
                  "**/ai-engine/knowledge/evidence/**",
                  // Content bounded context (catchall beyond long-form/fetch/image/analysis above)
                  "**/ai-engine/content/synthesis/**",
                  // Agents collaboration sub-context
                  "**/ai-engine/agents/collaboration/**",
                  // Infra bounded context (catchall beyond realtime above)
                  "**/ai-engine/runtime/observability/**",
                  "**/ai-engine/runtime/a2a/**",
                  // API core internals
                  "**/ai-engine/api/**",
                ],
                message:
                  "Access AI Engine internals only through 'ai-engine/facade'. " +
                  "If a symbol is missing from facade/index.ts, add it there first.",
              },
            ],
          },
        ],
      },
    },
    {
      // Phase H1: Harness 第一公民独立。ai-engine 永远不允许 import ai-harness
      // （依赖方向必须单向：ai-app → ai-harness → ai-engine）
      //
      // 例外：迁移过渡期间允许的反向引用：
      //   - ai-engine/harness/**  abstractions shim（PR-H6 清理）
      //   - ai-engine/facade/**   back-compat 出口（旧 ai-app 通过此拿 harness 类型）
      // ✅ PR-H4: ai-engine/runtime/resource/** 已通过 DI token 解耦，移出例外
      // PR-H6 清理 shim 后移除全部例外
      files: ["**/modules/ai-engine/**/*.ts"],
      excludedFiles: [
        "**/modules/ai-engine/harness/**/*.ts",
        "**/modules/ai-engine/facade/**/*.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["**/ai-harness/**", "**/modules/ai-harness/**"],
                message:
                  "ai-engine 不允许 import ai-harness（依赖方向必须单向）。" +
                  "如果是 harness 抽象类型，应该 ai-harness 主动暴露给 ai-engine 使用，" +
                  "而不是 ai-engine 反向引用。",
              },
            ],
          },
        ],
      },
    },
    {
      // LLM hardcoding guard: ai-app and core modules must use TaskProfile, not raw params.
      // See CLAUDE.md: "禁止硬编码 model: 'gpt-4o' 或 temperature: 0.7"
      // Legitimate exceptions (ai-engine LLM internals, common direct API calls) are outside this scope.
      files: ["**/modules/ai-app/**/*.ts", "**/modules/core/**/*.ts"],
      excludedFiles: ["**/*.spec.ts", "**/*.test.ts", "**/__tests__/**/*.ts"],
      rules: {
        "no-restricted-syntax": [
          "warn",
          {
            selector:
              "ObjectExpression > Property[key.name='temperature'][value.type='Literal']",
            message:
              "Hardcoded temperature is not allowed. Use TaskProfile ({ creativity: 'low'|'medium'|'high'|'deterministic' }) via AiChatService instead.",
          },
          {
            selector:
              "ObjectExpression > Property[key.name='maxTokens'][value.type='Literal']",
            message:
              "Hardcoded maxTokens is not allowed. Use TaskProfile ({ outputLength: 'minimal'|'short'|'medium'|'long'|'standard' }) via AiChatService instead.",
          },
        ],
      },
    },
  ],
};
