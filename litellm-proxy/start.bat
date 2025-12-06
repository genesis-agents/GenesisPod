@echo off
REM LiteLLM 代理启动脚本 (Windows)

echo ========================================
echo   LiteLLM Proxy Server
echo   支持 Claude / OpenAI / Gemini
echo ========================================

REM 检查是否安装了 litellm
where litellm >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [错误] 未找到 litellm，正在安装...
    pip install litellm[proxy]
)

REM 加载环境变量
if exist .env (
    echo [信息] 加载 .env 文件...
    for /f "tokens=1,2 delims==" %%a in (.env) do (
        set %%a=%%b
    )
) else (
    echo [警告] 未找到 .env 文件，请复制 .env.example 为 .env 并配置 API 密钥
    pause
    exit /b 1
)

echo.
echo [启动] LiteLLM 代理服务器在 http://localhost:4000
echo [提示] 按 Ctrl+C 停止服务器
echo.

litellm --config config.yaml --port 4000 --host 0.0.0.0
