@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo 🔧 Railway部署修复脚本 (Windows)
echo ==================================
echo.

REM 检查是否在git仓库中
git rev-parse --git-dir >nul 2>&1
if errorlevel 1 (
    echo ❌ 错误: 不在git仓库中
    exit /b 1
)

REM 检查当前分支
for /f "tokens=*" %%i in ('git branch --show-current') do set CURRENT_BRANCH=%%i
echo 📍 当前分支: %CURRENT_BRANCH%

if not "%CURRENT_BRANCH%"=="main" (
    echo ⚠️  警告: 当前不在main分支
    set /p SWITCH="是否切换到main分支? (y/n): "
    if /i "!SWITCH!"=="y" (
        git checkout main
        git pull origin main
    ) else (
        echo ❌ 取消操作
        exit /b 1
    )
)

echo.
echo ✓ 检查完成
echo.

REM 显示最近的相关提交
echo 📝 最近的相关提交:
git log --oneline -5
echo.

REM 选择修复方案
echo 请选择修复方案:
echo.
echo 1. 🚀 空提交触发重新部署 (推荐，最快)
echo 2. 📦 切换到nixpacks构建器 (长期方案)
echo 3. 🔄 两者都执行 (最保险)
echo 4. ❌ 取消
echo.
set /p CHOICE="请输入选项 (1-4): "

if "%CHOICE%"=="1" goto option1
if "%CHOICE%"=="2" goto option2
if "%CHOICE%"=="3" goto option3
if "%CHOICE%"=="4" goto option4
goto invalid

:option1
echo.
echo 🚀 方案1: 空提交触发重新部署
echo.

REM 获取时间戳
for /f "tokens=1-4 delims=/ " %%a in ('date /t') do (
    set DATE=%%a-%%b-%%c
)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (
    set TIME=%%a:%%b
)
set TIMESTAMP=%DATE% %TIME%

REM 创建空提交
git commit --allow-empty -m "chore: force Railway rebuild - icon-only tabs update" -m "" -m "This commit forces Railway to rebuild and deploy the latest changes:" -m "- Icon-only tab design (commit 59f3cbf)" -m "- Image tab for text-to-image generation" -m "- Optimized cache strategy (commit 2b97786)" -m "" -m "Triggered at: %TIMESTAMP%" -m "" -m "🤖 Generated with [Claude Code](https://claude.com/claude-code)" -m "" -m "Co-Authored-By: Claude <noreply@anthropic.com>"

echo ✓ 空提交已创建
echo.

REM 推送到远程
echo 准备推送到远程仓库...
git push origin main

echo.
echo ✅ 完成！
echo.
echo 📋 后续步骤:
echo 1. 前往 Railway Dashboard 查看部署进度
echo 2. 等待部署完成 (通常需要3-5分钟)
echo 3. 硬刷新浏览器 (Ctrl+Shift+R)
echo 4. 检查资源详情页是否显示5个icon-only按钮
echo.
echo 🔍 如果仍然没有更新:
echo    - 在Railway控制台清除构建缓存
echo    - 手动触发 Redeploy
echo.
goto end

:option2
echo.
echo 📦 方案2: 切换到nixpacks构建器
echo.

REM 检查Dockerfile是否存在
if exist "frontend\Dockerfile" (
    echo 重命名 frontend\Dockerfile → frontend\Dockerfile.backup
    move frontend\Dockerfile frontend\Dockerfile.backup
    git add frontend\Dockerfile frontend\Dockerfile.backup

    git commit -m "fix(deploy): use nixpacks instead of Dockerfile for Railway" -m "" -m "Railway will now use nixpacks for frontend builds instead of Dockerfile." -m "This provides:" -m "- Better Next.js optimization" -m "- Smarter caching strategy" -m "- Reduced maintenance overhead" -m "- Automatic detection of Next.js configuration" -m "" -m "The Dockerfile is preserved as Dockerfile.backup for reference." -m "" -m "🤖 Generated with [Claude Code](https://claude.com/claude-code)" -m "" -m "Co-Authored-By: Claude <noreply@anthropic.com>"

    echo ✓ Dockerfile已重命名
    echo.

    REM 推送到远程
    echo 准备推送到远程仓库...
    git push origin main

    echo.
    echo ✅ 完成！
    echo.
    echo 📋 后续步骤:
    echo 1. Railway会自动检测到变更并重新部署
    echo 2. 这次部署会使用nixpacks构建器
    echo 3. 等待部署完成 (首次使用nixpacks可能需要5-7分钟)
    echo 4. 硬刷新浏览器检查更新
    echo.
) else (
    echo ⚠️  frontend\Dockerfile 不存在，跳过此步骤
)
goto end

:option3
echo.
echo 🔄 方案3: 执行两种修复方案
echo.

REM 先重命名Dockerfile
if exist "frontend\Dockerfile" (
    echo 1. 重命名 Dockerfile...
    move frontend\Dockerfile frontend\Dockerfile.backup
    git add frontend\Dockerfile frontend\Dockerfile.backup
)

REM 获取时间戳
for /f "tokens=1-4 delims=/ " %%a in ('date /t') do (
    set DATE=%%a-%%b-%%c
)
for /f "tokens=1-2 delims=: " %%a in ('time /t') do (
    set TIME=%%a:%%b
)
set TIMESTAMP=%DATE% %TIME%

REM 创建提交
git commit -m "fix(deploy): force Railway rebuild with nixpacks" -m "" -m "Changes:" -m "- Switch to nixpacks builder (remove Dockerfile)" -m "- Force rebuild to deploy icon-only tabs design" -m "- Icon-only tab interface (commit 59f3cbf)" -m "- New Image tab for text-to-image generation" -m "- Optimized cache strategy (commit 2b97786)" -m "" -m "This ensures Railway rebuilds from scratch with the latest code." -m "" -m "Triggered at: %TIMESTAMP%" -m "" -m "🤖 Generated with [Claude Code](https://claude.com/claude-code)" -m "" -m "Co-Authored-By: Claude <noreply@anthropic.com>"

echo ✓ 提交已创建
echo.

REM 推送到远程
echo 2. 推送到远程仓库...
git push origin main

echo.
echo ✅ 完成！
echo.
echo 📋 后续步骤:
echo 1. Railway会检测到变更并自动部署
echo 2. 使用nixpacks重新构建 (首次可能需要5-7分钟)
echo 3. 等待部署完成
echo 4. 硬刷新浏览器 (Ctrl+Shift+R)
echo 5. 检查icon-only tabs是否显示
echo.
echo 🔍 如果仍然有问题:
echo    前往Railway控制台手动清除构建缓存
echo.
goto end

:option4
echo.
echo ❌ 已取消
goto end

:invalid
echo.
echo ❌ 无效的选项
exit /b 1

:end
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 🎉 修复脚本执行完成！
echo.
echo 📖 详细文档: docs/guides/railway-deployment-fix.md
echo.
pause
