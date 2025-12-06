@echo off
REM Claude Code 模式切换启动器
REM 用法:
REM   claude-code.bat         - 订阅模式
REM   claude-code.bat -api    - API 模式 (Gemini)

setlocal

if "%1"=="-api" (
    goto :api_mode
) else (
    goto :subscription_mode
)

:subscription_mode
echo.
echo   ========================================
echo      Claude Code - 订阅模式
echo   ========================================
echo.
echo   [模式] 使用 Claude Pro/Max 订阅
echo.

REM 清除 API 模式的环境变量
set ANTHROPIC_BASE_URL=
set ANTHROPIC_AUTH_TOKEN=

echo   启动 Claude Code...
echo.
claude
goto :end

:api_mode
echo.
echo   ========================================
echo      Claude Code - API 模式
echo   ========================================
echo.
echo   [模式] 使用 Gemini/OpenAI API
echo   [代理] http://localhost:4000
echo.

REM 加载 .env
if exist "%~dp0.env" (
    for /f "tokens=1,2 delims==" %%a in (%~dp0.env) do (
        set %%a=%%b
    )
)

set ANTHROPIC_BASE_URL=http://localhost:4000
set ANTHROPIC_AUTH_TOKEN=%LITELLM_MASTER_KEY%

echo   启动 Claude Code...
echo.
claude
goto :end

:end
endlocal
