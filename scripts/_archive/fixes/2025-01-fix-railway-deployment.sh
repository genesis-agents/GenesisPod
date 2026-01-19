#!/bin/bash
set -e

echo "🔧 Railway部署修复脚本"
echo "======================="
echo ""

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 检查是否在git仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo -e "${RED}❌ 错误: 不在git仓库中${NC}"
    exit 1
fi

# 检查当前分支
CURRENT_BRANCH=$(git branch --show-current)
echo -e "${BLUE}📍 当前分支: ${CURRENT_BRANCH}${NC}"

if [ "$CURRENT_BRANCH" != "main" ]; then
    echo -e "${YELLOW}⚠️  警告: 当前不在main分支${NC}"
    read -p "是否切换到main分支? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        git checkout main
        git pull origin main
    else
        echo -e "${RED}❌ 取消操作${NC}"
        exit 1
    fi
fi

echo ""
echo -e "${GREEN}✓ 检查完成${NC}"
echo ""

# 显示最近的相关提交
echo "📝 最近的相关提交:"
git log --oneline -5
echo ""

# 选择修复方案
echo "请选择修复方案:"
echo ""
echo "1. 🚀 空提交触发重新部署 (推荐，最快)"
echo "2. 📦 切换到nixpacks构建器 (长期方案)"
echo "3. 🔄 两者都执行 (最保险)"
echo "4. ❌ 取消"
echo ""
read -p "请输入选项 (1-4): " choice

case $choice in
    1)
        echo ""
        echo -e "${BLUE}🚀 方案1: 空提交触发重新部署${NC}"
        echo ""

        # 创建空提交
        TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
        git commit --allow-empty -m "chore: force Railway rebuild - icon-only tabs update

This commit forces Railway to rebuild and deploy the latest changes:
- Icon-only tab design (commit 59f3cbf)
- Image tab for text-to-image generation
- Optimized cache strategy (commit 2b97786)

Triggered at: $TIMESTAMP

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

        echo -e "${GREEN}✓ 空提交已创建${NC}"
        echo ""

        # 推送到远程
        echo "准备推送到远程仓库..."
        git push origin main

        echo ""
        echo -e "${GREEN}✅ 完成！${NC}"
        echo ""
        echo "📋 后续步骤:"
        echo "1. 前往 Railway Dashboard 查看部署进度"
        echo "2. 等待部署完成 (通常需要3-5分钟)"
        echo "3. 硬刷新浏览器 (Ctrl+Shift+R / Cmd+Shift+R)"
        echo "4. 检查资源详情页是否显示5个icon-only按钮"
        echo ""
        echo "🔍 如果仍然没有更新:"
        echo "   - 在Railway控制台清除构建缓存"
        echo "   - 手动触发 Redeploy"
        echo ""
        ;;

    2)
        echo ""
        echo -e "${BLUE}📦 方案2: 切换到nixpacks构建器${NC}"
        echo ""

        # 检查Dockerfile是否存在
        if [ -f "frontend/Dockerfile" ]; then
            echo "重命名 frontend/Dockerfile → frontend/Dockerfile.backup"
            mv frontend/Dockerfile frontend/Dockerfile.backup
            git add frontend/Dockerfile frontend/Dockerfile.backup

            git commit -m "fix(deploy): use nixpacks instead of Dockerfile for Railway

Railway will now use nixpacks for frontend builds instead of Dockerfile.
This provides:
- Better Next.js optimization
- Smarter caching strategy
- Reduced maintenance overhead
- Automatic detection of Next.js configuration

The Dockerfile is preserved as Dockerfile.backup for reference.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

            echo -e "${GREEN}✓ Dockerfile已重命名${NC}"
            echo ""

            # 推送到远程
            echo "准备推送到远程仓库..."
            git push origin main

            echo ""
            echo -e "${GREEN}✅ 完成！${NC}"
            echo ""
            echo "📋 后续步骤:"
            echo "1. Railway会自动检测到变更并重新部署"
            echo "2. 这次部署会使用nixpacks构建器"
            echo "3. 等待部署完成 (首次使用nixpacks可能需要5-7分钟)"
            echo "4. 硬刷新浏览器检查更新"
            echo ""
        else
            echo -e "${YELLOW}⚠️  frontend/Dockerfile 不存在，跳过此步骤${NC}"
        fi
        ;;

    3)
        echo ""
        echo -e "${BLUE}🔄 方案3: 执行两种修复方案${NC}"
        echo ""

        # 先重命名Dockerfile
        if [ -f "frontend/Dockerfile" ]; then
            echo "1. 重命名 Dockerfile..."
            mv frontend/Dockerfile frontend/Dockerfile.backup
            git add frontend/Dockerfile frontend/Dockerfile.backup
        fi

        # 创建提交
        TIMESTAMP=$(date +"%Y-%m-%d %H:%M:%S")
        git commit -m "fix(deploy): force Railway rebuild with nixpacks

Changes:
- Switch to nixpacks builder (remove Dockerfile)
- Force rebuild to deploy icon-only tabs design
- Icon-only tab interface (commit 59f3cbf)
- New Image tab for text-to-image generation
- Optimized cache strategy (commit 2b97786)

This ensures Railway rebuilds from scratch with the latest code.

Triggered at: $TIMESTAMP

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

        echo -e "${GREEN}✓ 提交已创建${NC}"
        echo ""

        # 推送到远程
        echo "2. 推送到远程仓库..."
        git push origin main

        echo ""
        echo -e "${GREEN}✅ 完成！${NC}"
        echo ""
        echo "📋 后续步骤:"
        echo "1. Railway会检测到变更并自动部署"
        echo "2. 使用nixpacks重新构建 (首次可能需要5-7分钟)"
        echo "3. 等待部署完成"
        echo "4. 硬刷新浏览器 (Ctrl+Shift+R)"
        echo "5. 检查icon-only tabs是否显示"
        echo ""
        echo "🔍 如果仍然有问题:"
        echo "   前往Railway控制台手动清除构建缓存"
        echo ""
        ;;

    4)
        echo ""
        echo -e "${YELLOW}❌ 已取消${NC}"
        exit 0
        ;;

    *)
        echo ""
        echo -e "${RED}❌ 无效的选项${NC}"
        exit 1
        ;;
esac

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "${GREEN}🎉 修复脚本执行完成！${NC}"
echo ""
echo "📖 详细文档: docs/guides/railway-deployment-fix.md"
echo ""
