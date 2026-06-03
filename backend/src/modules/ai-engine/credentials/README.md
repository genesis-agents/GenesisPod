# credentials

> `ai-infra` 内唯一合法的凭证基础设施边界。

## 定位

`credentials/` 负责 API key、模型配置、分发池、分配关系、申请流转与凭证解析。

判断口径：

- 只要职责是“凭证资产的存储、分配、解析、校验、调度”，归 `credentials/`
- 只要职责是“LLM 推理时的模型能力、provider 路由、prompt/runtime orchestration”，不归 `credentials/`

## 当前子目录

```text
credentials/
├── distributable-keys/   # 系统可分发 key 池
├── key-assignments/      # key 与用户/主体的分配关系
├── key-requests/         # key 申请与审批流
├── key-resolver/         # 运行时 key 解析与 BYOK 选择
├── scheduling/           # 跨 credentials 子域的定时任务
├── user-api-keys/        # 用户自有 API key 资产
└── user-model-configs/   # 用户模型选择与默认配置
```

## 明确边界

- `user-api-keys/`
  - 只放用户自有 key 的保存、更新、删除、测试
  - 不承载配额重置、分配过期清理这类跨子域任务

- `scheduling/`
  - 只放跨 `distributable-keys / key-assignments / user-api-keys` 的定时任务
  - 当前 `byok-maintenance.scheduler.ts` 负责月度配额重置与过期 assignment 清理

- `key-resolver/`
  - 只放运行时 key 选择、回退与解析错误模型
  - 不放定时任务、不放用户 CRUD

- `user-model-configs/`
  - 只放用户与模型偏好的配置资产
  - 不放 provider runtime 能力声明；那类能力属于 `ai-engine/llm`

## 禁止事项

- 禁止在 `ai-engine` 新增顶层 `credentials/`
- 禁止把仅服务单一 app 场景的凭证包装器塞进 `credentials/`
- 禁止把跨子域调度器塞进 `user-api-keys/` 或 `key-resolver/`
