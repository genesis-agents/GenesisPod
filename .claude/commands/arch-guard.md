# Arch Guard - 架构看护快速检查

对当前工作区的**近期变更**进行架构合规快速扫描：

$ARGUMENTS

## 检查范围

使用 arch-guardian agent 检查以下规则：

1. **Facade 边界** - AI App 是否绕过 AIEngineFacade 直接导入 Engine 内部路径
2. **Registry 导入路径** - AgentRegistry/TeamRegistry 等是否从 `ai-engine/facade` 导入（不允许直接引用内部路径）
3. **反向依赖** - AI Engine 是否导入了 AI App 模块
4. **LLM 硬编码** - 是否有硬编码的模型名/temperature/maxTokens
5. **ESLint 覆盖缺口** - 新增的 Engine 子目录是否已加入限制规则

## 执行方式

```
Task({ subagent_type: "arch-guardian", prompt: "检查近期变更..." })
```

## 输出预期

- 快速通过/失败状态
- 具体违规文件、行号、违规内容
- 修复建议

## 适用场景

- PR 提交前的快速自检
- 完成 AI Engine 相关功能后的即时验证
- 新增 ai-engine 子模块后检查规则覆盖
