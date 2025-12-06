# Install global 'claude' wrapper command

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path

Write-Host ""
Write-Host "  Installing global 'claude' command..." -ForegroundColor Cyan
Write-Host ""

# Create wrapper function
$wrapperCode = @"

# Claude Code Wrapper (auto-generated)
function global:claude {
    param(
        [switch]`$api,
        [Parameter(ValueFromRemainingArguments=`$true)]
        `$remainingArgs
    )

    `$proxyPath = "$scriptPath"

    if (`$api) {
        # API Mode - use Gemini
        `$envFile = Join-Path `$proxyPath ".env"
        if (Test-Path `$envFile) {
            Get-Content `$envFile -Encoding UTF8 | ForEach-Object {
                if (`$_ -match '^\s*([^#][^=]+)=(.*)$') {
                    [Environment]::SetEnvironmentVariable(`$matches[1].Trim(), `$matches[2].Trim(), "Process")
                }
            }
        }

        # Check/start LiteLLM
        `$running = `$false
        try { `$null = Invoke-WebRequest -Uri "http://localhost:4000/health" -TimeoutSec 2 -ErrorAction Stop; `$running = `$true } catch {}

        if (-not `$running) {
            Write-Host "  [Starting LiteLLM proxy...]" -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-File", "`$proxyPath\start.ps1"
            Start-Sleep -Seconds 6
        }

        `$env:ANTHROPIC_BASE_URL = "http://localhost:4000"
        `$env:ANTHROPIC_AUTH_TOKEN = `$env:LITELLM_MASTER_KEY

        Write-Host "  [MODE] Gemini 3 Pro (API)" -ForegroundColor Magenta
        & claude.exe @remainingArgs
    } else {
        # Subscription Mode
        Remove-Item Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:ANTHROPIC_AUTH_TOKEN -ErrorAction SilentlyContinue
        & claude.exe @remainingArgs
    }
}

"@

# Check if profile exists
$profileDir = Split-Path -Parent $PROFILE
if (-not (Test-Path $profileDir)) {
    New-Item -ItemType Directory -Path $profileDir -Force | Out-Null
}

if (-not (Test-Path $PROFILE)) {
    New-Item -ItemType File -Path $PROFILE -Force | Out-Null
}

# Check if already installed
$profileContent = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
if ($profileContent -match "Claude Code Wrapper") {
    Write-Host "  [SKIP] Already installed" -ForegroundColor Yellow
} else {
    Add-Content -Path $PROFILE -Value $wrapperCode
    Write-Host "  [OK] Installed to: $PROFILE" -ForegroundColor Green
}

Write-Host ""
Write-Host "  Usage:" -ForegroundColor White
Write-Host "    claude          # Subscription mode (Claude Pro/Max)" -ForegroundColor Gray
Write-Host "    claude -api     # API mode (Gemini 3 Pro)" -ForegroundColor Gray
Write-Host ""
Write-Host "  Run this to activate now:" -ForegroundColor Cyan
Write-Host "    . `$PROFILE" -ForegroundColor White
Write-Host ""
