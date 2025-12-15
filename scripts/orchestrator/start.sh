#!/bin/bash
#
# Leader Agent 启动脚本
#
# 用法:
#   ./scripts/orchestrator/start.sh         # 前台运行
#   ./scripts/orchestrator/start.sh daemon  # 后台运行 (PM2)
#   ./scripts/orchestrator/start.sh stop    # 停止
#   ./scripts/orchestrator/start.sh status  # 查看状态
#   ./scripts/orchestrator/start.sh logs    # 查看日志
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cd "$PROJECT_DIR"

# 检查依赖
check_dependencies() {
    echo "🔍 检查依赖..."

    # 检查 Node.js
    if ! command -v node &> /dev/null; then
        echo "❌ Node.js 未安装"
        exit 1
    fi

    # 检查 Claude CLI
    if ! command -v claude &> /dev/null; then
        echo "❌ Claude CLI 未安装"
        echo "   请运行: npm install -g @anthropic-ai/claude-code"
        exit 1
    fi

    # 检查 ts-node
    if ! npx ts-node --version &> /dev/null; then
        echo "❌ ts-node 未安装"
        echo "   请运行: npm install -D ts-node typescript"
        exit 1
    fi

    # 检查 js-yaml
    if ! node -e "require('js-yaml')" 2>/dev/null; then
        echo "⚠️  js-yaml 未安装，正在安装..."
        npm install js-yaml
    fi

    echo "✅ 依赖检查通过"
}

# 创建日志目录
setup_logs() {
    mkdir -p .claude/logs
    echo "✅ 日志目录已创建"
}

# 前台运行
run_foreground() {
    echo "🚀 启动 Leader Agent (前台模式)..."
    echo "   按 Ctrl+C 停止"
    echo ""
    npx ts-node scripts/orchestrator/leader-agent.ts
}

# 使用 PM2 后台运行
run_daemon() {
    # 检查 PM2
    if ! command -v pm2 &> /dev/null; then
        echo "❌ PM2 未安装"
        echo "   请运行: npm install -g pm2"
        exit 1
    fi

    echo "🚀 启动 Leader Agent (后台模式)..."
    pm2 start ecosystem.config.js --only leader-agent
    echo ""
    echo "✅ Leader Agent 已启动"
    echo "   查看状态: pm2 status"
    echo "   查看日志: pm2 logs leader-agent"
    echo "   停止: pm2 stop leader-agent"
}

# 停止
stop_daemon() {
    if command -v pm2 &> /dev/null; then
        echo "🛑 停止 Leader Agent..."
        pm2 stop leader-agent 2>/dev/null || echo "Leader Agent 未运行"
    else
        echo "❌ PM2 未安装"
    fi
}

# 查看状态
show_status() {
    echo ""
    npx ts-node scripts/orchestrator/status.ts
}

# 查看日志
show_logs() {
    if command -v pm2 &> /dev/null; then
        pm2 logs leader-agent --lines 50
    else
        echo "查看日志文件..."
        tail -f .claude/logs/leader-agent-out.log
    fi
}

# 主入口
case "${1:-}" in
    daemon|start)
        check_dependencies
        setup_logs
        run_daemon
        ;;
    stop)
        stop_daemon
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    restart)
        stop_daemon
        sleep 2
        check_dependencies
        setup_logs
        run_daemon
        ;;
    help|--help|-h)
        echo "Leader Agent 启动脚本"
        echo ""
        echo "用法:"
        echo "  $0              前台运行 (开发模式)"
        echo "  $0 daemon       后台运行 (生产模式, 使用 PM2)"
        echo "  $0 stop         停止后台运行"
        echo "  $0 restart      重启"
        echo "  $0 status       查看状态"
        echo "  $0 logs         查看日志"
        echo "  $0 help         显示帮助"
        ;;
    *)
        check_dependencies
        setup_logs
        run_foreground
        ;;
esac
