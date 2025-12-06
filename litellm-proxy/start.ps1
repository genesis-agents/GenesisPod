# LiteLLM Proxy Startup Script

Write-Host ""
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host "       LiteLLM Proxy Server" -ForegroundColor Cyan
Write-Host "       Gemini / OpenAI Support" -ForegroundColor Cyan
Write-Host "  ============================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptPath

# Load .env file
$envFile = Join-Path $scriptPath ".env"
if (Test-Path $envFile) {
    Write-Host "  [INFO] Loading .env file..." -ForegroundColor Gray
    Get-Content $envFile -Encoding UTF8 | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, "Process")
            Write-Host "  [SET] $name" -ForegroundColor DarkGray
        }
    }
} else {
    Write-Host "  [ERROR] .env file not found!" -ForegroundColor Red
    Write-Host "  Please copy .env.example to .env and set your API keys" -ForegroundColor Yellow
    Read-Host "Press Enter to exit"
    exit 1
}

Write-Host ""
Write-Host "  [START] http://localhost:4000" -ForegroundColor Green
Write-Host "  [TIP] Press Ctrl+C to stop" -ForegroundColor Gray
Write-Host ""

$configPath = Join-Path $scriptPath "config.yaml"
litellm --config $configPath --port 4000 --host 0.0.0.0
