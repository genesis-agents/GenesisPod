# Claude Code 配置脚本
# 配置 Claude Code 使用 LiteLLM 代理

Write-Host "========================================"
Write-Host "  配置 Claude Code 使用 LiteLLM 代理"
Write-Host "========================================"
Write-Host ""

# 设置环境变量 (当前会话)
$env:ANTHROPIC_BASE_URL = "http://localhost:4000"
$env:ANTHROPIC_AUTH_TOKEN = "sk-litellm-master-key"

Write-Host "[已设置] ANTHROPIC_BASE_URL = http://localhost:4000" -ForegroundColor Green
Write-Host "[已设置] ANTHROPIC_AUTH_TOKEN = sk-litellm-master-key" -ForegroundColor Green
Write-Host ""

# 检查 LiteLLM 是否在运行
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4000/health" -Method GET -TimeoutSec 3 -ErrorAction Stop
    Write-Host "[状态] LiteLLM 代理服务器正在运行" -ForegroundColor Green
} catch {
    Write-Host "[警告] LiteLLM 代理服务器未运行!" -ForegroundColor Red
    Write-Host "请先运行 start.ps1 启动代理服务器" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================"
Write-Host "  使用说明"
Write-Host "========================================"
Write-Host ""
Write-Host "1. 启动 LiteLLM: .\start.ps1" -ForegroundColor Cyan
Write-Host "2. 新开终端，运行此脚本: .\setup-claude-code.ps1" -ForegroundColor Cyan
Write-Host "3. 在同一终端启动 Claude Code: claude" -ForegroundColor Cyan
Write-Host ""
Write-Host "永久配置方法 (可选):" -ForegroundColor Yellow
Write-Host "将以下内容添加到 PowerShell 配置文件 (\$PROFILE):" -ForegroundColor Yellow
Write-Host '  $env:ANTHROPIC_BASE_URL = "http://localhost:4000"' -ForegroundColor Gray
Write-Host '  $env:ANTHROPIC_AUTH_TOKEN = "sk-litellm-master-key"' -ForegroundColor Gray
Write-Host ""
