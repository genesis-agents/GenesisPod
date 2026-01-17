# Claude Code Skills 兼容性分析

> 对比 Claude Code 官方规范与我们实现的差异，确保最大兼容性和扩展性

## 1. YAML Frontmatter 字段对比

### Claude Code 官方字段

| 字段             | 必需 | 官方说明                 | 我们的对应字段 | 兼容性          |
| ---------------- | ---- | ------------------------ | -------------- | --------------- |
| `name`           | ✅   | 小写+连字符，max 64 字符 | `id`           | ⚠️ 需要同时支持 |
| `description`    | ✅   | 触发条件描述             | 新增           | ⚠️ 需要增强     |
| `allowed-tools`  | ❌   | 限制可用工具             | 新增           | ➕ 扩展支持     |
| `model`          | ❌   | 指定模型                 | 新增           | ➕ 扩展支持     |
| `context`        | ❌   | fork = 隔离上下文        | 新增           | ➕ 扩展支持     |
| `agent`          | ❌   | 配合 context 使用        | 新增           | ➕ 扩展支持     |
| `hooks`          | ❌   | 生命周期钩子             | 新增           | ➕ 扩展支持     |
| `user-invocable` | ❌   | 是否显示在菜单           | 新增           | ➕ 扩展支持     |

### 我们的扩展字段（保持向后兼容）

| 字段          | 用途         | 保留原因              |
| ------------- | ------------ | --------------------- |
| `id`          | 唯一标识符   | 兼容 `name`，内部使用 |
| `version`     | 版本号       | 版本管理              |
| `domain`      | 领域分类     | 多领域支持            |
| `tags`        | 标签         | 搜索和分类            |
| `taskTypes`   | 任务类型匹配 | 自动选择逻辑          |
| `priority`    | 优先级       | 多 Skill 排序         |
| `author`      | 作者         | 生态系统              |
| `source`      | 来源         | 本地/远程区分         |
| `tokenBudget` | Token 预算   | 优化加载              |

## 2. 兼容性策略

### 策略 1: 字段别名支持

```typescript
// name 和 id 互为别名
interface SkillMdFrontmatter {
  name?: string; // Claude Code 官方
  id?: string; // 我们的扩展
  // 解析时: id = frontmatter.id || frontmatter.name
}
```

### 策略 2: 渐进式增强

1. **核心字段**（必须支持）: `name/id`, `description`
2. **官方扩展**（可选支持）: `allowed-tools`, `model`, `context`
3. **我们的扩展**（向后兼容）: `domain`, `taskTypes`, `priority`

### 策略 3: 自动转换

加载 Claude Code 官方 Skill 时自动填充缺失字段：

```typescript
function normalizeSkill(skill: PartialSkill): FullSkill {
  return {
    id: skill.id || skill.name,
    name: skill.name || skill.id,
    description: skill.description || "",
    domain: skill.domain || "general",
    taskTypes: skill.taskTypes || ["*"], // 匹配所有
    priority: skill.priority ?? 5,
    // ...
  };
}
```

## 3. 目录结构兼容性

### Claude Code 官方结构

```
.claude/skills/
├── skill-name/
│   ├── SKILL.md      # 必需
│   ├── reference.md  # 可选
│   └── scripts/      # 可选
```

### 我们的结构（保持兼容）

```
backend/src/modules/ai-app/
├── writing/skills/
│   ├── chapter-writing.skill.md
│   └── style-control.skill.md
├── research/skills/
│   └── deep-research.skill.md
```

### 兼容方案

1. **支持两种命名**：`SKILL.md` 和 `*.skill.md`
2. **支持目录结构**：`skill-name/SKILL.md` 或 `skill-name.skill.md`
3. **优先级**：项目级 > 用户级 > 全局级

## 4. 变量替换兼容性

### Claude Code 官方

```markdown
Session ID: ${CLAUDE_SESSION_ID}
Arguments: $ARGUMENTS
Positional: $1, $2
```

### 我们的实现

```markdown
Context: {{chapterContext}}
Nested: {{config.setting}}
Default: {{variable | default: "value"}}
```

### 兼容方案

同时支持两种语法：

```typescript
function replaceVariables(
  content: string,
  context: Record<string, unknown>,
): string {
  // 1. Claude Code 风格: ${VAR} 和 $VAR
  content = content.replace(/\$\{([^}]+)\}/g, (_, name) =>
    getVar(name, context),
  );
  content = content.replace(/\$(\w+)/g, (_, name) => getVar(name, context));

  // 2. Handlebars 风格: {{var}}
  content = content.replace(/\{\{([^}]+)\}\}/g, (_, expr) =>
    handleHandlebars(expr, context),
  );

  return content;
}
```

## 5. 触发机制对比

### Claude Code: Description 驱动

- Claude 读取所有 Skills 的 `description`
- 根据用户请求自动匹配
- 用户确认后加载完整内容

### 我们的实现: TaskType 驱动

- 调用方指定 `taskType` 和 `domain`
- 系统精确匹配 `taskTypes` 字段
- 直接加载匹配的 Skills

### 融合方案

```typescript
async getSkillsForTask(options: GetSkillsOptions): Promise<SkillMdDefinition[]> {
  // 方式 1: 精确匹配 taskType（我们的方式）
  let skills = this.matchByTaskType(options.taskType, options.domain);

  // 方式 2: Description 模糊匹配（Claude Code 方式）
  if (skills.length === 0 && options.query) {
    skills = this.matchByDescription(options.query);
  }

  return skills;
}
```

## 6. 扩展性设计

### 插件式 Skill Source

```typescript
interface SkillSource {
  name: string;
  priority: number;
  loadSkills(): Promise<SkillMdDefinition[]>;
  watchChanges?(callback: () => void): void;
}

// 内置来源
class LocalSkillSource implements SkillSource {}
class SkillsMPSource implements SkillSource {}

// 未来扩展
class GitHubSkillSource implements SkillSource {}
class NPMSkillSource implements SkillSource {}
```

### Skill 生命周期钩子

```typescript
interface SkillHooks {
  onLoad?(skill: SkillMdDefinition): void;
  onBeforeUse?(
    skill: SkillMdDefinition,
    context: Record<string, unknown>,
  ): void;
  onAfterUse?(skill: SkillMdDefinition, result: ChatResponse): void;
  onError?(skill: SkillMdDefinition, error: Error): void;
}
```

### Skill 版本管理

```typescript
interface SkillVersionInfo {
  current: string;
  available: string[];
  changelog: Record<string, string>;
}

async upgradeSkill(skillId: string, targetVersion?: string): Promise<boolean>;
async rollbackSkill(skillId: string, version: string): Promise<boolean>;
```

## 7. 推荐改进优先级

### P0 - 必须实现（兼容性）

1. ✅ 支持 `name` 作为 `id` 的别名
2. ⬜ 增强 `description` 字段的使用
3. ⬜ 支持 Claude Code 变量语法 `${VAR}`

### P1 - 应该实现（扩展性）

1. ⬜ 支持 `allowed-tools` 字段
2. ⬜ 支持 `context: fork` 隔离执行
3. ⬜ 支持目录形式 `skill-name/SKILL.md`

### P2 - 可以实现（生态系统）

1. ⬜ Skill 版本管理
2. ⬜ Skill 热重载
3. ⬜ Skill 依赖解析
4. ⬜ Skill 性能统计

---

**版本**: 1.0
**更新日期**: 2026-01-16
**状态**: 分析完成，待实施
