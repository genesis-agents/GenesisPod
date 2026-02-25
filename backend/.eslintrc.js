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
        // Agent files may extend BaseAgent/PlanBasedAgent (inheritance pattern)
        "**/agents/*.agent.ts",
        // Team config files must reference abstract interfaces
        "**/*.config.ts",
        // Skill implementations extend engine skill base classes
        "**/skills/*.skill.ts",
        // Re-export / bridge adapter files (direct engine imports justified)
        "**/office/common/content-analysis.service.ts",
        "**/office/common/content-analysis.types.ts",
        "**/office/common/image-matching.service.ts",
        // Note: writing-agent-registry.ts now imports AgentIfaceOutput/AgentIfaceEvent via facade alias
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
                ],
                message:
                  "Access orchestration internals only through AIEngineFacade. " +
                  "If a type is missing from facade/index.ts, add it there first.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 6: RAG internals
              //   EmbeddingResult, SimilaritySearchOptions, etc. re-exported from facade.
              // ════════════════════════════════════════════════════════════
              {
                group: ["**/ai-engine/rag/**"],
                message:
                  "Import EmbeddingResult, SimilaritySearchOptions, SimilarityResult from 'ai-engine/facade'. " +
                  "For RAGPipelineService, add it to facade/index.ts exports first.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 7: Long-content internals
              // ════════════════════════════════════════════════════════════
              {
                group: [
                  "**/ai-engine/long-content/services/long-content-engine*",
                ],
                message: "Use facade.longContentEngine instead.",
              },
              {
                group: [
                  "**/ai-engine/long-content/interfaces/**",
                  "**/ai-engine/long-content/types/**",
                  "**/ai-engine/long-content/long-content.module*",
                ],
                message:
                  "Do not import LongContentModule or its interfaces directly. " +
                  "AiEngineModule already includes it. Add missing types to facade/index.ts.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 8: Other engine capabilities
              // ════════════════════════════════════════════════════════════
              // AI capabilities — must go through AIEngineFacade
              {
                group: ["**/ai-engine/capabilities/**"],
                message:
                  "Use AIEngineFacade.capabilityGetSkillPrompts() or facade.capabilityResolverService instead.",
              },
              // Realtime — must go through AIEngineFacade
              {
                group: ["**/ai-engine/realtime/**"],
                message:
                  "Use AIEngineFacade.emitToRoom()/emitProgress() instead.",
              },
              // Memory — must go through AIEngineFacade
              {
                group: [
                  "**/ai-engine/memory/stores/**",
                  "**/ai-engine/memory/abstractions/**",
                  "**/ai-engine/memory/memory-coordinator.service*",
                ],
                message:
                  "Use AIEngineFacade.storeMemory()/retrieveMemory() instead.",
              },
              // Content fetch — must go through AIEngineFacade
              {
                group: ["**/ai-engine/content-fetch/**"],
                message: "Use facade.contentFetch instead.",
              },
              // Engine interfaces (image tokens, simulation interfaces)
              {
                group: ["**/ai-engine/interfaces/**"],
                message:
                  "Add required interface or token to facade/index.ts, then import from 'ai-engine/facade'.",
              },
              // MCP abstractions
              {
                group: ["**/ai-engine/mcp/**"],
                message:
                  "Add MCP abstractions to facade/index.ts, then import from 'ai-engine/facade'.",
              },
              // Image engine internals
              {
                group: ["**/ai-engine/image/**"],
                message:
                  "Add image matching types to facade/index.ts, then import from 'ai-engine/facade'.",
              },
              // Content analysis internals
              {
                group: ["**/ai-engine/content-analysis/**"],
                message:
                  "Add content analysis types to facade/index.ts, then import from 'ai-engine/facade'.",
              },

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 9: Preventive — not yet accessed but must stay clean
              // ════════════════════════════════════════════════════════════
              {
                group: [
                  "**/ai-engine/synthesis/**",
                  "**/ai-engine/search/**",
                  "**/ai-engine/quality/**",
                  "**/ai-engine/collaboration/**",
                  "**/ai-engine/guardrails/**",
                  "**/ai-engine/evidence/**",
                  "**/ai-engine/a2a/**",
                  "**/ai-engine/prompts/**",
                  "**/ai-engine/observability/**",
                  "**/ai-engine/constraint/**",
                  "**/ai-engine/common/**",
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
  ],
};
