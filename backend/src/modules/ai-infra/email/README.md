# email

> 邮件发送基础设施。

## 定位

`email/` 只负责邮件发送 runtime、连接测试与 provider 适配。

## 明确边界

- 允许：
  - SMTP / provider 发送
  - 邮件连接初始化与重载
  - 发送能力的统一入口

- 不允许：
  - 业务域模板编排中心
  - 系统设置持久化

邮件配置资产归 `settings/`，通知模板归 `notifications/`。
