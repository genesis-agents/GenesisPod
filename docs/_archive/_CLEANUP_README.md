# 文档清理指南

> **欢迎!** 这里是 DeepDive Engine 文档清理的中心枢纽。本指南将帮助您了解和执行文档清理计划。

---

## 📚 文档清单

本次清理提供以下文档，请根据需要选择阅读:

### 1. 快速了解（推荐从这里开始）

- **[\_cleanup_quick_reference.md](_cleanup_quick_reference.md)**
  - 📄 一页纸快速参考
  - ⏱️ 阅读时间: 3-5 分钟
  - 🎯 适合: 快速了解方案要点
  - 💡 提示: 可打印随身携带

### 2. 执行摘要（决策者必读）

- **[\_cleanup_executive_summary.md](_cleanup_executive_summary.md)**
  - 📊 核心数据和改进目标
  - ⏱️ 阅读时间: 10-15 分钟
  - 🎯 适合: 项目负责人、决策者
  - 💡 提示: 包含三阶段执行计划概览

### 3. 完整分析报告（详细参考）

- **[\_cleanup_analysis.md](_cleanup_analysis.md)**
  - 📖 267 个文档的完整诊断
  - ⏱️ 阅读时间: 30-45 分钟
  - 🎯 适合: 执行团队、深入了解
  - 💡 提示: 包含所有细节和决策依据

### 4. 执行检查清单（实施必备）

- **[\_cleanup_checklist.md](_cleanup_checklist.md)**
  - ✅ 逐项勾选的任务清单
  - ⏱️ 使用时间: 贯穿整个执行过程
  - 🎯 适合: 执行团队
  - 💡 提示: 确保不遗漏任何步骤

### 5. 执行脚本（半自动化工具）

- **[scripts/docs-cleanup-phase1-preview.sh](../scripts/docs-cleanup-phase1-preview.sh)**
  - 🛠️ 阶段1自动化脚本
  - ⏱️ 运行时间: 预览模式 < 1分钟，实际执行 2-3 小时
  - 🎯 适合: 熟悉 Shell 的开发者
  - 💡 提示: 默认预览模式，安全无风险

---

## 🚀 快速开始

### 第一步：了解现状

```bash
# 查看当前文档数量
find docs -name "*.md" | wc -l
# 输出: 267

# 查看活跃文档数量
find docs -name "*.md" ! -path "docs/archive/*" | wc -l
# 输出: 267

# 检查命名违规
find docs -name "*.md" ! -path "docs/archive/*" ! -name "readme.md" \
  | grep -E "[A-Z_]|[ ]" | wc -l
# 输出: 131 个违规
```

### 第二步：阅读执行摘要

```bash
# 在编辑器中打开
code docs/_cleanup_executive_summary.md

# 或在终端中阅读
cat docs/_cleanup_executive_summary.md
```

### 第三步：运行预览脚本

```bash
# 预览模式（安全，不会修改任何文件）
bash scripts/docs-cleanup-phase1-preview.sh

# 查看预期变更
```

### 第四步：开始执行

```bash
# 1. 创建备份分支
git checkout -b docs-cleanup-backup
git push origin docs-cleanup-backup

# 2. 创建工作分支
git checkout main
git checkout -b docs-cleanup-phase1

# 3. 执行清理（方式A: 使用脚本）
# 编辑脚本，将 DRY_RUN=true 改为 DRY_RUN=false
nano scripts/docs-cleanup-phase1-preview.sh
bash scripts/docs-cleanup-phase1-preview.sh

# 或（方式B: 手动执行，参考检查清单）
# 打开检查清单，逐项执行
code docs/_cleanup_checklist.md
```

---

## 📊 清理概览

### 问题严重性

| 问题       | 严重度 | 影响文件数 | 预计耗时 |
| ---------- | ------ | ---------- | -------- |
| 命名违规   | 🔴 P0  | 131        | 3小时    |
| 过期文档   | 🔴 P0  | ~50        | 2小时    |
| 重复文档   | 🟡 P1  | ~30        | 3小时    |
| 分类混乱   | 🟡 P1  | 全部267    | 6小时    |
| 缺少索引   | 🟢 P2  | -          | 2小时    |
| 代码不一致 | 🟢 P2  | ~20        | 4小时    |

### 清理目标

| 指标     | 清理前   | 清理后  | 改进     |
| -------- | -------- | ------- | -------- |
| 文档总数 | 267      | 180-200 | ↓ 25-33% |
| 活跃文档 | 267      | 120-140 | ↓ 47-55% |
| 命名合规 | 51%      | 100%    | ↑ 96%    |
| 过期文档 | ~50      | 0       | ↓ 100%   |
| 重复文档 | 15组     | 0       | ↓ 100%   |
| 查找时间 | 5-10分钟 | 1-2分钟 | ↓ 60-80% |

### 执行时间表

```
Week 1 (2026-01-15~19): 阶段1 - 紧急清理
├─ 任务1: 归档过期文档（2h）
├─ 任务2: 修正命名违规（3h）
└─ 任务3: 更新核心文档（2h）

Week 2 (2026-01-22~26): 阶段2 - 结构优化
├─ 任务1: 重组 data-management（1h）
├─ 任务2: 合并重复文档（3h）
└─ 任务3: 优化 PRD 目录（2h）

Week 3-4 (2026-01-29~02-12): 阶段3 - 完善补充
├─ 任务1: 创建索引文档（2h）
├─ 任务2: 验证代码一致性（4h）
└─ 任务3: 建立自动化检查（3h）

Week 5 (2026-02-13~14): 最终验收
└─ 质量检查 + 团队审查（2h）
```

---

## 🎯 阅读路径推荐

### 路径1: 快速决策者（15分钟）

```
1. 阅读"快速参考"（5分钟）
   → _cleanup_quick_reference.md

2. 阅读"执行摘要"（10分钟）
   → _cleanup_executive_summary.md

3. 决策: 批准/修改/拒绝方案
```

### 路径2: 执行团队（1小时）

```
1. 阅读"执行摘要"（15分钟）
   → _cleanup_executive_summary.md

2. 浏览"完整分析报告"的关键章节（30分钟）
   → _cleanup_analysis.md
   - 第一阶段: 全面调研
   - 第二阶段: 问题诊断
   - 第三阶段: 清理方案

3. 熟悉"执行检查清单"（15分钟）
   → _cleanup_checklist.md
   - 了解每个任务的详细步骤
```

### 路径3: 技术实施者（2小时）

```
1. 阅读"执行摘要"（15分钟）

2. 详细阅读"完整分析报告"（60分钟）
   → _cleanup_analysis.md
   - 重点关注 3.3、3.4、3.5 节
   - 理解每个决策的依据

3. 研究"执行检查清单"（30分钟）
   → _cleanup_checklist.md
   - 逐项检查执行细节

4. 测试执行脚本（15分钟）
   → scripts/docs-cleanup-phase1-preview.sh
   - 预览模式运行
   - 理解脚本逻辑
```

---

## ⚠️ 重要提示

### 执行前必读

1. **备份是必须的**

   ```bash
   git checkout -b docs-cleanup-backup
   git push origin docs-cleanup-backup
   ```

2. **在工作分支执行**

   ```bash
   git checkout -b docs-cleanup-phase1
   # 不要直接在 main 分支操作
   ```

3. **通知团队**
   - 清理期间避免修改 docs/ 文件
   - 选择低峰时段执行（建议周五下午或周末）

### 执行中注意事项

1. **使用 git mv**

   ```bash
   # ✅ 正确（保留历史）
   git mv old/path.md new/path.md

   # ❌ 错误（丢失历史）
   mv old/path.md new/path.md
   git add .
   ```

2. **频繁提交**

   ```bash
   # 每完成一小批操作就提交
   git add docs/
   git commit -m "docs: archive project reports (3 files)"
   ```

3. **分批执行重命名**
   ```bash
   # 不要一次性重命名 131 个文件
   # 按目录分批：prd/ → design/ → features/ → ...
   ```

### 遇到问题

1. **命名规范疑问**
   - 参考 `../.claude/standards/03-naming-conventions.md`

2. **分类不明确**
   - 参考完整报告 3.2 节"目录职责定义"
   - 或查看"快速参考"中的决策树

3. **Git 操作失误**
   - 立即停止
   - 回滚到备份分支

   ```bash
   git checkout docs-cleanup-backup
   git branch -D docs-cleanup-phase1
   ```

4. **技术问题**
   - 查看脚本注释
   - 提 Issue 反馈

---

## 🔍 如何验证清理结果

### 自动验证

```bash
# 1. 命名规范检查
find docs -name "*.md" ! -path "docs/archive/*" ! -name "readme.md" \
  | grep -E "[A-Z_]|[ ]"
# 期望: 无输出

# 2. 文档数量检查
find docs -name "*.md" ! -path "docs/archive/*" | wc -l
# 期望: 120-140

# 3. 链接有效性检查
npm install -g markdown-link-check
find docs -name "*.md" ! -path "docs/archive/*" \
  -exec markdown-link-check {} \;
# 期望: 无 ERROR

# 4. 重复文档检查
# 手动检查完整报告 3.4 节列出的 15 组是否都已处理
```

### 手动验证

1. **目录结构检查**

   ```bash
   tree docs -L 2
   # 检查是否符合 v3.0 结构
   ```

2. **索引文件检查**

   ```bash
   # 确认以下文件存在
   ls docs/readme.md
   ls docs/prd/readme.md
   ls docs/design/readme.md
   ls docs/archive/readme.md
   ls docs/features/*/readme.md
   ```

3. **PRD 版本管理检查**

   ```bash
   ls docs/prd/
   # 期望: current/ archive/ readme.md
   ```

4. **归档结构检查**
   ```bash
   tree docs/archive -L 2
   # 检查是否按季度和类型组织
   ```

---

## 📞 支持与反馈

### 问题反馈

如果在执行过程中遇到问题:

1. **技术问题**
   - 检查脚本注释
   - 查看完整报告相关章节
   - 提 Issue 并附上错误信息

2. **方案疑问**
   - 在执行摘要或完整报告中查找答案
   - 参考"快速参考"中的决策树
   - 团队讨论

3. **改进建议**
   - 在 PR 中评论
   - 提 Issue 说明改进点

### 执行反馈

清理完成后，请在检查清单中记录:

- 实际耗时
- 遇到的问题
- 团队反馈
- 改进建议

这些反馈将帮助优化未来的文档管理流程。

---

## ✅ 成功标准

完成清理后，应达到以下标准:

### 必达指标

- [ ] 命名合规率 = 100%
- [ ] 重复文档组 = 0
- [ ] 过期文档（活跃） = 0
- [ ] 活跃文档数 < 150
- [ ] 所有核心目录有 readme.md

### 质量指标

- [ ] 查找时间 < 2 分钟
- [ ] 链接有效率 = 100%
- [ ] PRD 版本清晰
- [ ] 文档与代码一致

### 团队反馈

- [ ] 至少 3 名成员测试并反馈积极
- [ ] 无重大反对意见
- [ ] CI 自动验证通过

---

## 📚 附加资源

- [项目规则 v2.1](../project-rules.md) - 命名规范详细说明
- [命名规范标准](../.claude/standards/03-naming-conventions.md)
- [文档编写规范](../.claude/standards/09-documentation.md)
- [历史重组方案](archive/2025-q1/reports/docs-reorganization-plan.md)
- [命名审查报告](archive/2025-q1/reports/file-naming-audit-report.md)

---

## 🎉 完成后

清理完成并验收通过后:

1. **合并到主分支**

   ```bash
   git checkout main
   git merge docs-cleanup-phase1
   git push origin main
   ```

2. **删除工作分支**

   ```bash
   git branch -d docs-cleanup-phase1
   git push origin --delete docs-cleanup-phase1
   ```

3. **保留备份分支**

   ```bash
   # 保留 docs-cleanup-backup 分支一段时间
   # 确认无问题后再删除
   ```

4. **创建总结报告**
   - 在 `archive/2025-q1/reports/` 创建完成报告
   - 记录实际执行情况和改进效果

5. **更新文档管理规范**
   - 将新的管理规范正式化
   - 更新到项目规则文档

6. **启用 CI 自动验证**
   - GitHub Actions 开始自动检查
   - 防止问题再次出现

---

**维护者**: 文档专家 Agent
**创建日期**: 2026-01-15
**最后更新**: 2026-01-15

**状态**: ✅ 准备就绪，等待执行

---

**祝清理顺利! 🚀**
