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
    "tests/**/*.ts",
    "tests/__mocks__/**/*.ts",
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

    // ★ 2026-05-05 散点 antipattern 看护（task #16 + #17）
    // 目的：在写代码时拦截已知 antipattern，杜绝 listener leak / 无 timeout 等
    // 系统性问题再发生。已有存量按渐进迁移走（部分 warn 级，让旧代码不阻塞）。
    "no-restricted-syntax": [
      "warn",
      {
        // task #16: no-naked-abort-listener
        // 禁止裸 signal.addEventListener("abort", ...) — 必须用 AbortableScope。
        // AbortableScope 内部 add 实现是唯一豁免，本规则不会误伤（只检测调用点
        // 含 'abort' 字面量字符串作为第 1 参的 addEventListener 调用）。
        selector:
          "CallExpression[callee.property.name='addEventListener'][arguments.0.type='Literal'][arguments.0.value='abort']",
        message:
          "Use AbortableScope from @/modules/ai-infra/resilience instead of raw addEventListener('abort', ...). Naked listeners with {once:true} leak when abort never fires.",
      },
      {
        // task #6 + 看护：禁止 admin 直接 return process.env.* 的密钥字段。
        // 防止 S1 类漏洞复发（密钥经 admin endpoint 明文传到前端）。
        selector:
          "ReturnStatement > LogicalExpression[operator='||'] > MemberExpression.left[object.object.name='process'][object.property.name='env'][property.name=/_API_KEY|_SECRET|_TOKEN|_PASSWORD/]",
        message:
          "Do not return process.env.*_API_KEY/SECRET/TOKEN/PASSWORD directly in admin endpoint. Use Boolean(...) or maskSensitiveSetting().",
      },
    ],

    // ★ task #17: 限制 axios 直接 import（warn 级渐进迁移）
    // 改用 NestJS HttpService（HttpModule 全局 timeout 已配 120000ms）。
    // 现有 30+ 处旧代码 warn 不阻塞，新代码统一走 httpService。
    "no-restricted-imports": [
      "warn",
      {
        paths: [
          {
            name: "axios",
            message:
              "Prefer NestJS HttpService (HttpModule.register has global timeout). Direct axios imports lack timeout safety net by default.",
          },
        ],
      },
    ],
  },
  overrides: [
    {
      // Test files need special handling
      files: [
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/tests/**/*.ts",
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
      // AI-App modules must access AI Engine only through AIFacade or Registry
      // See CLAUDE.md: "所有 AI App 模块只通过 AIFacade 和 Registry 访问 AI Engine"
      files: ["**/modules/ai-app/**/*.ts"],
      excludedFiles: [
        // Test files may directly import internals for mocking
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/__tests__/**/*.ts",
        // 2026-05-01 (PR-X-U): NestJS *.module.ts 装配 imports: [...] 必须用具体
        // module class（facade re-export 类型不能装配）。Engine 6 个子 module 现已
        // 收在子目录下（PR-X-U：llm/tools/skills/knowledge/safety），ai-app 模块
        // 装配它们时必然指向子路径。Service 层访问仍走 facade —— 本例外只针对装配。
        "**/modules/ai-app/**/*.module.ts",
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
              // ★ Team orchestration services — must go through AIFacade
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
                group: ["**/ai-engine/planning/services"],
                message:
                  "Import orchestration types from 'ai-engine/facade'. " +
                  "Use AIFacade getters instead of the barrel index.",
              },
              // Specific services with dedicated facade accessors:
              {
                group: [
                  "**/ai-engine/planning/services/intent-detection*",
                  "**/ai-engine/planning/services/output-reviewer*",
                  "**/ai-engine/planning/services/context-evolution*",
                  "**/ai-engine/planning/services/circuit-breaker*",
                  "**/ai-engine/planning/services/agent-executor*",
                  "**/ai-engine/planning/services/task-planner*",
                  "**/ai-engine/planning/services/task-decomposer*",
                ],
                message:
                  "Inject AIFacade and access via facade.intentDetector / facade.outputReviewer / etc.",
              },
              // Broader orchestration internals:
              {
                group: [
                  "**/ai-engine/planning/executors/**",
                  "**/ai-engine/planning/state-machine/**",
                  "**/ai-engine/planning/utils/**",
                  "**/ai-engine/planning/interfaces/**",
                  "**/ai-engine/planning/capabilities/**",
                ],
                message:
                  "Access orchestration internals only through AIFacade. " +
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
              // Memory — must go through AIFacade
              {
                group: [
                  "**/ai-engine/knowledge/memory/stores/**",
                  "**/ai-engine/knowledge/memory/abstractions/**",
                  "**/ai-engine/knowledge/memory/memory-coordinator.service*",
                ],
                message: "Use AIFacade.storeMemory()/retrieveMemory() instead.",
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
              // Content fetch — must go through AIFacade
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
              // Realtime — must go through AIFacade
              {
                group: ["**/ai-engine/runtime/realtime/**"],
                message: "Use AIFacade.emitToRoom()/emitProgress() instead.",
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

              // ════════════════════════════════════════════════════════════
              // ★ SECTION 10 (2026-05-01 PR-X-N): ai-harness 内部路径锁定
              //   ai-app 必须通过 ai-harness/facade 访问 harness 能力，不得穿透。
              //   每个 export 都已通过 facade 暴露，ai-app 没有理由绕开。
              // ════════════════════════════════════════════════════════════
              {
                group: [
                  // 7 大聚合内部路径：kernel / execution / governance / memory /
                  // process / protocol / runtime — 全部走 facade
                  "**/ai-harness/kernel/**",
                  "**/ai-harness/execution/**",
                  "**/ai-harness/governance/**",
                  "**/ai-harness/memory/**",
                  "**/ai-harness/process/**",
                  "**/ai-harness/protocol/**",
                  "**/ai-harness/runtime/**",
                ],
                message:
                  "Access AI Harness internals only through 'ai-harness/facade'. " +
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
      // 单向依赖 ai-app → ai-harness → ai-engine
      //
      // PR-X18: 通过 DI tokens（ai-engine/abstractions/runtime-deps.tokens.ts）
      // 完全消除 ai-engine-planning.module 的反向 import；engine 端只看
      // Symbol token + 接口契约，harness 用 useExisting 绑定具体实现。
      // 现在 ai-engine/** 全部生产代码 0 反向 import，零 eslint 例外（除测试）。
      files: ["**/modules/ai-engine/**/*.ts"],
      excludedFiles: [
        // Specs/tests are allowed to import harness facade for mocking purposes
        "**/modules/ai-engine/**/*.spec.ts",
        "**/modules/ai-engine/**/*.test.ts",
        "**/modules/ai-engine/**/__tests__/**/*.ts",
        // 2026-05-01 (PR-X-R): K commit 的 ai-engine → ai-harness 适配器
        // 实现 harness ISkillProvider 端口（Dependency Inversion 模式）。
        // 这是合法的反向 import：ai-engine 主动 expose 用户自定义 skill 给 harness，
        // 不依赖任何 harness 实现，仅依赖 harness 抽象类型（IKernelSkill / ISkillProvider）。
        // jest layer-boundaries.spec.ts 同步 allowlist。
        "**/modules/ai-engine/skills/runtime/adapters/engine-skill-provider.adapter.ts",
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
    //
    // ============================================================================
    // v5.1 R0.5 PR-0: Plugin 系统边界（standards/19-plugin-system-governance.md）
    // ============================================================================
    //
    // 三块规则与 layer-boundaries.spec.ts "Plugin system boundaries" 一一对应：
    //   ① harness/engine 不得 import plugin:<domain> 实现（仅可 plugins/core/）
    //   ② src/plugins/<domain>/ 不得 import harness/engine/app 内部 + 不得 import 其他 plugin
    //   ③ src/plugins/core/ 不得依赖任何 module 或具体 plugin 实现
    //
    {
      files: ["**/modules/ai-harness/**/*.ts", "**/modules/ai-engine/**/*.ts"],
      excludedFiles: [
        "**/*.spec.ts",
        "**/*.test.ts",
        "**/__tests__/**/*.ts",
        // W2 例外：harness/engine 的 *.module.ts 允许 import plugins/<domain>/*.module
        // （NestJS DI 装配，非实现使用；详见 layer-boundaries.spec 同步规则）
        "**/*.module.ts",
      ],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: [
                  "**/plugins/observability/**",
                  "**/plugins/resilience/**",
                  "**/plugins/security/**",
                  "**/plugins/storage/**",
                  "**/plugins/rag-backend/**",
                  "**/plugins/llm-augment/**",
                  "**/plugins/tool-augment/**",
                  "@/plugins/observability/**",
                  "@/plugins/resilience/**",
                  "@/plugins/security/**",
                  "@/plugins/storage/**",
                  "@/plugins/rag-backend/**",
                  "@/plugins/llm-augment/**",
                  "@/plugins/tool-augment/**",
                ],
                message:
                  "harness/engine 不得 import plugin 实现，必须通过 HookBus（plugins/core/）。" +
                  "*.module.ts 文件除外（NestJS DI 装配）。" +
                  "见 standards/19-plugin-system-governance.md 规则 4。",
              },
            ],
          },
        ],
      },
    },
    {
      files: [
        "**/plugins/observability/**/*.ts",
        "**/plugins/resilience/**/*.ts",
        "**/plugins/security/**/*.ts",
        "**/plugins/storage/**/*.ts",
        "**/plugins/rag-backend/**/*.ts",
        "**/plugins/llm-augment/**/*.ts",
        "**/plugins/tool-augment/**/*.ts",
      ],
      excludedFiles: ["**/*.spec.ts", "**/*.test.ts", "**/__tests__/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/modules/ai-harness/**", "**/modules/ai-harness/**"],
                message:
                  "plugin 不得 import ai-harness 内部，仅允许通过 plugins/core/ 的 hook payload 类型。" +
                  "见 standards/19 规则 4。",
              },
              {
                group: ["@/modules/ai-engine/**", "**/modules/ai-engine/**"],
                message:
                  "plugin 不得 import ai-engine 内部，仅允许通过 plugins/core/ 的 hook payload 类型。" +
                  "见 standards/19 规则 4。",
              },
              {
                group: ["@/modules/ai-app/**", "**/modules/ai-app/**"],
                message:
                  "plugin 是平台横切，与业务无关，不得 import ai-app。" +
                  "见 standards/19 规则 3。",
              },
              {
                group: [
                  "**/plugins/observability/**",
                  "**/plugins/resilience/**",
                  "**/plugins/security/**",
                  "**/plugins/storage/**",
                  "**/plugins/rag-backend/**",
                  "**/plugins/llm-augment/**",
                  "**/plugins/tool-augment/**",
                  "@/plugins/observability/**",
                  "@/plugins/resilience/**",
                  "@/plugins/security/**",
                  "@/plugins/storage/**",
                  "@/plugins/rag-backend/**",
                  "@/plugins/llm-augment/**",
                  "@/plugins/tool-augment/**",
                ],
                message:
                  "plugin 之间仅通过 hook payload 通信，不得直接 import 其他 plugin 实现。" +
                  "见 standards/19 规则 4 + DS2。",
              },
            ],
          },
        ],
      },
    },
    {
      files: ["**/plugins/core/**/*.ts"],
      excludedFiles: ["**/*.spec.ts", "**/*.test.ts", "**/__tests__/**/*.ts"],
      rules: {
        "no-restricted-imports": [
          "error",
          {
            patterns: [
              {
                group: ["@/modules/**", "**/modules/**"],
                message:
                  "plugins/core/ 是平台内核，不得依赖任何 module（ai-app/harness/engine/infra）。" +
                  "见 standards/19 规则 4。",
              },
              {
                group: [
                  "**/plugins/observability/**",
                  "**/plugins/resilience/**",
                  "**/plugins/security/**",
                  "**/plugins/storage/**",
                  "**/plugins/rag-backend/**",
                  "**/plugins/llm-augment/**",
                  "**/plugins/tool-augment/**",
                  "@/plugins/observability/**",
                  "@/plugins/resilience/**",
                  "@/plugins/security/**",
                  "@/plugins/storage/**",
                  "@/plugins/rag-backend/**",
                  "@/plugins/llm-augment/**",
                  "@/plugins/tool-augment/**",
                ],
                message:
                  "plugins/core/ 不得依赖具体 plugin 实现（内核不知道有哪些 plugin）。" +
                  "见 standards/19 规则 4。",
              },
            ],
          },
        ],
      },
    },
  ],
};
