$profileContent = @'

# Claude Code Wrapper (auto-generated)
function global:claude {
    param(
        [switch]$api,
        [Parameter(ValueFromRemainingArguments=$true)]
        $remainingArgs
    )

    $proxyPath = "D:\projects\genesis\litellm-proxy"
    $claudeCmd = "C:\Users\dudugo\AppData\Roaming\npm\claude.cmd"

    if ($api) {
        # API Mode - use Gemini
        $envFile = Join-Path $proxyPath ".env"
        if (Test-Path $envFile) {
            Get-Content $envFile -Encoding UTF8 | ForEach-Object {
                if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
                    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), "Process")
                }
            }
        }

        # Check/start LiteLLM
        $running = $false
        try { $null = Invoke-WebRequest -Uri "http://localhost:4000/health" -TimeoutSec 2 -ErrorAction Stop; $running = $true } catch {}

        if (-not $running) {
            Write-Host "  [Starting LiteLLM proxy...]" -ForegroundColor Yellow
            Start-Process powershell -ArgumentList "-NoExit", "-File", "$proxyPath\start.ps1"
            Start-Sleep -Seconds 6
        }

        $env:ANTHROPIC_BASE_URL = "http://localhost:4000"
        $env:ANTHROPIC_AUTH_TOKEN = $env:LITELLM_MASTER_KEY

        Write-Host "  [MODE] Gemini 3 Pro (API)" -ForegroundColor Magenta
        & $claudeCmd --dangerously-skip-permissions @remainingArgs
    } else {
        # Subscription Mode
        Remove-Item Env:ANTHROPIC_BASE_URL -ErrorAction SilentlyContinue
        Remove-Item Env:ANTHROPIC_AUTH_TOKEN -ErrorAction SilentlyContinue
        & $claudeCmd --dangerously-skip-permissions @remainingArgs
    }
}

'@

Set-Content -Path $PROFILE -Value $profileContent -Encoding UTF8
Write-Host "Profile updated with --dangerously-skip-permissions" -ForegroundColor Green
