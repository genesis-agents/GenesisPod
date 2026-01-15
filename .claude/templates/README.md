# Templates

> Claude Code 使用的模板文件，用于生成 PR、Issue、Commit 等内容。

## 可用模板

| 模板                 | 用途                  | 使用场景              |
| -------------------- | --------------------- | --------------------- |
| `pr-template.md`     | Pull Request 描述模板 | 创建 PR 时            |
| `issue-template.md`  | Issue 描述模板        | 报告 Bug 或请求功能时 |
| `commit-template.md` | Commit 消息模板       | 提交代码时            |

## 使用方式

Claude Code 会自动使用这些模板。如需手动引用：

```markdown
请使用 .claude/templates/pr-template.md 模板创建 PR
```

## 自定义模板

添加新模板：

1. 在此目录创建 `.md` 文件
2. 使用 `{{variable}}` 标记变量
3. 更新本 README

---

**最后更新**: 2025-01-15
