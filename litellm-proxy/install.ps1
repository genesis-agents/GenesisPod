<#
.SYNOPSIS
    安装 Claude Code 快捷命令到系统
.DESCRIPTION
    创建全局可用的快捷命令:
    - cc      : 订阅模式启动 Claude Code
    - cc-api  : API 模式启动 Claude Code (Gemini/OpenAI)
#>

$proxyPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  ╔═══════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "  ║    Claude Code 快捷命令安装器         ║" -ForegroundColor Cyan
Write-Host "  ╚═══════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

# 检查 PowerShell Profile 是否存在
$profileDir = Split-Path -Parent $PROFILE
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
    Write-Host "  [创建] PowerShell Profile: $PROFILE" -ForegroundColor Yellow
}

# 要添加的函数定义
$functionsToAdd = @"

# ============================================
# Claude Code 快捷命令 (自动生成)
# ============================================

function cc {
    <#
    .SYNOPSIS
        启动 Claude Code (订阅模式)
    #>
    & "$proxyPath\claude-code.ps1"
}

function cc-api {
    <#
    .SYNOPSIS
        启动 Claude Code (API 模式 - Gemini/OpenAI)
    .PARAMETER model
        指定模型: gemini (默认), gpt, o1
    #>
    param([string]`$model = "gemini")
    & "$proxyPath\claude-code.ps1" -api -model `$model
}

function cc-start-proxy {
    <#
    .SYNOPSIS
        启动 LiteLLM 代理服务器
    #>
    & "$proxyPath\start.ps1"
}

# ============================================
"@

# 检查是否已经安装过
$profileContent = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
if ($profileContent -match "Claude Code 快捷命令") {
    Write-Host "  [跳过] 快捷命令已存在于 Profile 中" -ForegroundColor Yellow
} else {
    Add-Content -Path $PROFILE -Value $functionsToAdd
    Write-Host "  [安装] 快捷命令已添加到 Profile" -ForegroundColor Green
}

Write-Host ""
Write-Host "  ========================================" -ForegroundColor Gray
Write-Host "  安装完成! 可用命令:" -ForegroundColor White
Write-Host "  ========================================" -ForegroundColor Gray
Write-Host ""
Write-Host "  cc             " -NoNewline -ForegroundColor Green
Write-Host "- 订阅模式 (使用 Claude Pro/Max)" -ForegroundColor Gray
Write-Host "  cc-api         " -NoNewline -ForegroundColor Magenta
Write-Host "- API 模式 (默认 Gemini 2.5)" -ForegroundColor Gray
Write-Host "  cc-api gpt     " -NoNewline -ForegroundColor Magenta
Write-Host "- API 模式 (OpenAI GPT-4o)" -ForegroundColor Gray
Write-Host "  cc-start-proxy " -NoNewline -ForegroundColor Yellow
Write-Host "- 启动 LiteLLM 代理" -ForegroundColor Gray
Write-Host ""
Write-Host "  [提示] 请重启 PowerShell 或运行以下命令使其生效:" -ForegroundColor Cyan
Write-Host "  . `$PROFILE" -ForegroundColor White
Write-Host ""
