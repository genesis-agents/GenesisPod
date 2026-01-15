# Claude Code Tools

> 自动化脚本工具集，支持 Bash (Linux/macOS/Git Bash) 和 PowerShell (Windows)。

## 可用脚本

| 脚本                 | Bash                        | PowerShell                   | 描述             |
| -------------------- | --------------------------- | ---------------------------- | ---------------- |
| check-all            | `./check-all.sh`            | `.\check-all.ps1`            | 全面代码质量检查 |
| validate-commit      | `./validate-commit.sh`      | `.\validate-commit.ps1`      | 验证提交信息格式 |
| pre-merge-validation | `./pre-merge-validation.sh` | `.\pre-merge-validation.ps1` | 合并前验证       |
| monitor-ci           | `./monitor-ci.sh`           | `.\monitor-ci.ps1`           | 监控 CI/CD 状态  |
| rollback-merge       | `./rollback-merge.sh`       | -                            | 回滚合并操作     |

## 使用方式

### Windows (PowerShell)

```powershell
# 切换到项目根目录
cd D:\projects\codes\deepdive-engine

# 运行检查
.\.claude\tools\check-all.ps1

# 验证提交信息
.\.claude\tools\validate-commit.ps1 "feat(auth): add OAuth2 support"

# 合并前验证
.\.claude\tools\pre-merge-validation.ps1 develop

# 监控 CI
.\.claude\tools\monitor-ci.ps1
```

### Linux/macOS/Git Bash

```bash
# 切换到项目根目录
cd /path/to/deepdive-engine

# 添加执行权限（首次使用）
chmod +x .claude/tools/*.sh

# 运行检查
./.claude/tools/check-all.sh

# 验证提交信息
./.claude/tools/validate-commit.sh "feat(auth): add OAuth2 support"

# 合并前验证
./.claude/tools/pre-merge-validation.sh develop

# 监控 CI
./.claude/tools/monitor-ci.sh
```

## 脚本说明

### check-all

全面的代码质量检查，包括：

- Frontend: ESLint, TypeScript, Tests
- Backend: ESLint, TypeScript, Prisma, Tests
- Security: 敏感文件扫描, npm audit
- Git: 未提交更改, 分支检查

### validate-commit

验证提交信息是否遵循 Conventional Commits 规范：

- 类型检查 (feat, fix, docs, etc.)
- 作用域检查 (frontend, backend, etc.)
- 格式检查 (首字母小写, 无句号结尾, etc.)

### pre-merge-validation

合并前的完整验证：

- Git 状态检查
- 远程同步
- 合并冲突检测
- TypeScript 检查
- 快速测试

### monitor-ci

监控 GitHub Actions CI 执行状态：

- 显示最近的 CI 运行
- 实时监控进行中的运行
- 显示成功/失败状态

## 前置要求

- Node.js 18+
- npm 9+
- Git
- GitHub CLI (gh) - 用于 CI 监控

### 安装 GitHub CLI

```bash
# Windows (winget)
winget install GitHub.cli

# macOS (Homebrew)
brew install gh

# 认证
gh auth login
```

---

**最后更新**: 2025-01-15
