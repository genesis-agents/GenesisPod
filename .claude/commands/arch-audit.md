# Arch Audit - 全量架构审计

对整个代码库进行深度架构合规扫描，生成持久化审计报告：

$ARGUMENTS

## 审计范围

使用 arch-auditor agent 对以下维度进行全量扫描：

1. **Facade 边界（全量）** - 所有 ai-app 文件的跨层 import 违规
2. **反向依赖** - ai-engine 对 ai-app 的依赖
3. **LLM 硬编码（全量）** - 全库扫描硬编码模型配置
4. **注册模式合规** - App 模块的 onModuleInit 注册情况
5. **模块依赖图** - .module.ts imports 的层级关系
6. **ESLint 规则完备性** - 覆盖规则是否跟上代码库演进
7. **代码规范** - console.log、any 类型、硬编码品牌名

## 输出

审计报告保存至：`docs/audits/YYYY-MM-DD_arch-audit.md`

包含：
- 架构健康评分
- 按模块汇总的违规明细
- 架构债务优先级矩阵
- 与上次审计的对比趋势
- 具体行动项清单

## 执行时机

- 每月定期执行，建立健康趋势
- 重大重构完成后验证效果
- Release 前确保架构合规

## 注意

全量扫描耗时较长，建议在非紧急场景使用。
日常快速检查请使用 `/arch-guard`。
