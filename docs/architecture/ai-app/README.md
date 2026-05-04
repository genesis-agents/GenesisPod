# L3 AI Apps

> 业务应用层。每个子目录对应 `backend/src/modules/ai-app/{module}/`。

## 模块清单

| 模块             | 代码路径                   | 文档目录                               |
| ---------------- | -------------------------- | -------------------------------------- |
| agent-playground | `ai-app/agent-playground/` | [agent-playground/](agent-playground/) |
| ask              | `ai-app/ask/`              | [ask/](ask/)                           |
| byok             | `ai-app/byok/`             | [byok/](byok/)                         |
| contracts        | `ai-app/contracts/`        | [contracts/](contracts/)               |
| explore          | `ai-app/explore/`          | [explore/](explore/)                   |
| feedback         | `ai-app/feedback/`         | [feedback/](feedback/)                 |
| image            | `ai-app/image/`            | [image/](image/)                       |
| library          | `ai-app/library/`          | [library/](library/)                   |
| management       | `ai-app/management/`       | [management/](management/)             |
| office           | `ai-app/office/`           | [office/](office/)                     |
| planning         | `ai-app/planning/`         | [planning/](planning/)                 |
| research         | `ai-app/research/`         | [research/](research/)                 |
| simulation       | `ai-app/simulation/`       | [simulation/](simulation/)             |
| social           | `ai-app/social/`           | [social/](social/)                     |
| teams            | `ai-app/teams/`            | [teams/](teams/)                       |
| topic-insights   | `ai-app/topic-insights/`   | [topic-insights/](topic-insights/)     |
| writing          | `ai-app/writing/`          | [writing/](writing/)                   |

## 边界规则

- 业务编排专属层。多 agent / 业务流程 / mission 模板都归这里
- **必须通过 facade 消费下层**：`ai-engine/facade`、`ai-harness/facade`，不得穿透内部路径
- App 之间极少直接依赖，必要时通过下层 Registry 中转
- 通过 `onModuleInit` 向 `AgentRegistry` / `TeamRegistry` 注册自有 Agent / Team

## 注册模式

```typescript
onModuleInit() {
  this.agentRegistry.register(this.myAgent);
  this.teamRegistry.registerConfig(MY_TEAM_CONFIG);
}
```

详见 [`.claude/CLAUDE.md`](../../../.claude/CLAUDE.md) 中"模块依赖关系"。
