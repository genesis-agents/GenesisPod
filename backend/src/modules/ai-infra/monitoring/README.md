# monitoring

> `ai-infra/monitoring` 仅保留运行观测能力，不承载数据库保留/清理治理。

## 结构

```text
monitoring/
├── ai-metrics.service.ts
├── error-tracking.service.ts
├── health-check.service.ts
├── monitoring.module.ts
└── index.ts
```

## 边界

- 保留：
  - metrics
  - error tracking
  - health checks

- 不保留：
  - data retention
  - table cleanup
  - retention policy scheduling

这些能力已归位到 `ai-infra/db-governance/`。
