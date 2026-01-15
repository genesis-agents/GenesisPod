# DeepDive Engine - Commit Message Validator (PowerShell)
# 验证提交信息是否遵循 Conventional Commits 规范
# 用法: .\.claude\tools\validate-commit.ps1 "feat(frontend): add new feature"

param(
    [Parameter(Position=0)]
    [string]$CommitMessage
)

# 如果没有参数，从最后一次提交获取
if ([string]::IsNullOrWhiteSpace($CommitMessage)) {
    $CommitMessage = git log -1 --pretty=%B 2>&1
}

Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Commit Message Validator"
Write-Host "========================================="
Write-Host ""
Write-Host "Validating: $CommitMessage"
Write-Host ""

# 验证计数器
$Errors = 0

# 合法的类型
$ValidTypes = @("feat", "fix", "refactor", "test", "docs", "chore", "perf", "ci", "style", "revert")

# 合法的作用域
$ValidScopes = @("frontend", "backend", "ai-service", "crawler", "proxy", "resource", "feed", "api", "database", "auth", "config", "kg")

# 正则匹配
$Pattern = "^([a-z]+)(\(([a-z-]+)\))?:\s(.+)$"

if ($CommitMessage -match $Pattern) {
    $Type = $Matches[1]
    $Scope = $Matches[3]
    $Subject = $Matches[4]

    Write-Host "✓ Basic format valid" -ForegroundColor Green
} else {
    Write-Host "✗ Invalid format" -ForegroundColor Red
    Write-Host "   Expected: <type>(<scope>): <subject>"
    Write-Host "   Example: feat(frontend): add user dashboard"
    $Errors++
    $Type = ""
    $Scope = ""
    $Subject = ""
}

# 验证类型
if (-not [string]::IsNullOrWhiteSpace($Type)) {
    if ($ValidTypes -contains $Type) {
        Write-Host "✓ Type '$Type' is valid" -ForegroundColor Green
    } else {
        Write-Host "✗ Type '$Type' is invalid" -ForegroundColor Red
        Write-Host "   Valid types: $($ValidTypes -join ', ')"
        $Errors++
    }
}

# 验证作用域（可选，但如果提供必须有效）
if (-not [string]::IsNullOrWhiteSpace($Scope)) {
    if ($ValidScopes -contains $Scope) {
        Write-Host "✓ Scope '$Scope' is valid" -ForegroundColor Green
    } else {
        Write-Host "⚠ Scope '$Scope' is not in standard list" -ForegroundColor Yellow
        Write-Host "   Standard scopes: $($ValidScopes -join ', ')"
        Write-Host "   (This is a warning, not an error)"
    }
}

# 验证主题
if (-not [string]::IsNullOrWhiteSpace($Subject)) {
    # 检查首字母小写
    if ($Subject -cmatch "^[a-z]") {
        Write-Host "✓ Subject starts with lowercase" -ForegroundColor Green
    } else {
        Write-Host "✗ Subject should start with lowercase" -ForegroundColor Red
        $Errors++
    }

    # 检查是否以句号结尾
    if ($Subject.EndsWith(".")) {
        Write-Host "✗ Subject should not end with period" -ForegroundColor Red
        $Errors++
    } else {
        Write-Host "✓ Subject does not end with period" -ForegroundColor Green
    }

    # 检查长度
    $SubjectLength = $Subject.Length
    if ($SubjectLength -le 50) {
        Write-Host "✓ Subject length OK ($SubjectLength chars)" -ForegroundColor Green
    } elseif ($SubjectLength -le 72) {
        Write-Host "⚠ Subject is a bit long ($SubjectLength chars)" -ForegroundColor Yellow
        Write-Host "   Recommended: ≤ 50 chars"
    } else {
        Write-Host "✗ Subject too long ($SubjectLength chars)" -ForegroundColor Red
        Write-Host "   Maximum: 72 chars, Recommended: ≤ 50 chars"
        $Errors++
    }

    # 检查是否使用祈使语
    if ($Subject -match "^(added|fixed|updated|changed)") {
        Write-Host "✗ Use imperative mood (add, fix, update, not added, fixed, updated)" -ForegroundColor Red
        $Errors++
    } else {
        Write-Host "✓ Appears to use imperative mood" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "=========================================" -ForegroundColor Cyan
Write-Host "Validation Result"
Write-Host "========================================="
Write-Host ""

if ($Errors -eq 0) {
    Write-Host "✓ Commit message is valid!" -ForegroundColor Green
    Write-Host ""
    Write-Host "Examples of good commit messages:"
    Write-Host "  feat(frontend): add user dashboard"
    Write-Host "  fix(backend): resolve database connection issue"
    Write-Host "  docs(readme): update installation instructions"
    Write-Host "  refactor(ai-service): optimize retry logic"
    exit 0
} else {
    Write-Host "✗ Commit message has $Errors error(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Conventional Commits Format:"
    Write-Host "  <type>(<scope>): <subject>"
    Write-Host ""
    Write-Host "Types:"
    Write-Host "  feat:      New feature"
    Write-Host "  fix:       Bug fix"
    Write-Host "  refactor:  Code refactoring"
    Write-Host "  test:      Add or modify tests"
    Write-Host "  docs:      Documentation changes"
    Write-Host "  chore:     Build/tooling changes"
    Write-Host "  perf:      Performance improvement"
    Write-Host "  ci:        CI/CD changes"
    Write-Host "  style:     Code formatting"
    Write-Host "  revert:    Revert previous commit"
    exit 1
}
