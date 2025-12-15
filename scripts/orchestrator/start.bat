@echo off
REM Leader Agent 启动脚本 (Windows)
REM
REM 用法:
REM   start.bat              前台运行
REM   start.bat daemon       后台运行 (PM2)
REM   start.bat stop         停止
REM   start.bat status       查看状态
REM   start.bat logs         查看日志

setlocal EnableDelayedExpansion

cd /d "%~dp0\..\..\"

if "%1"=="" goto foreground
if "%1"=="daemon" goto daemon
if "%1"=="start" goto daemon
if "%1"=="stop" goto stop
if "%1"=="status" goto status
if "%1"=="logs" goto logs
if "%1"=="restart" goto restart
if "%1"=="help" goto help
if "%1"=="--help" goto help
if "%1"=="-h" goto help

:foreground
echo.
echo 🔍 检查依赖...

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Node.js 未安装
    exit /b 1
)

where claude >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ Claude CLI 未安装
    echo    请运行: npm install -g @anthropic-ai/claude-code
    exit /b 1
)

echo ✅ 依赖检查通过
echo.

if not exist ".claude\logs" mkdir ".claude\logs"

echo 🚀 启动 Leader Agent (前台模式)...
echo    按 Ctrl+C 停止
echo.
call npx ts-node scripts/orchestrator/leader-agent.ts
goto end

:daemon
echo.
echo 🔍 检查 PM2...

where pm2 >nul 2>nul
if %errorlevel% neq 0 (
    echo ❌ PM2 未安装
    echo    请运行: npm install -g pm2
    exit /b 1
)

if not exist ".claude\logs" mkdir ".claude\logs"

echo 🚀 启动 Leader Agent (后台模式)...
call pm2 start ecosystem.config.js --only leader-agent
echo.
echo ✅ Leader Agent 已启动
echo    查看状态: pm2 status
echo    查看日志: pm2 logs leader-agent
echo    停止: pm2 stop leader-agent
goto end

:stop
echo 🛑 停止 Leader Agent...
call pm2 stop leader-agent 2>nul || echo Leader Agent 未运行
goto end

:status
echo.
call npx ts-node scripts/orchestrator/status.ts
goto end

:logs
where pm2 >nul 2>nul
if %errorlevel% equ 0 (
    call pm2 logs leader-agent --lines 50
) else (
    echo 查看日志文件...
    type .claude\logs\leader-agent-out.log
)
goto end

:restart
call pm2 stop leader-agent 2>nul
timeout /t 2 /nobreak >nul
call pm2 start ecosystem.config.js --only leader-agent
goto end

:help
echo.
echo Leader Agent 启动脚本
echo.
echo 用法:
echo   start.bat              前台运行 (开发模式)
echo   start.bat daemon       后台运行 (生产模式, 使用 PM2)
echo   start.bat stop         停止后台运行
echo   start.bat restart      重启
echo   start.bat status       查看状态
echo   start.bat logs         查看日志
echo   start.bat help         显示帮助
echo.
goto end

:end
endlocal
