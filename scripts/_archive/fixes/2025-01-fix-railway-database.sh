#!/bin/bash
# Railway Database Connection Fix Script
# This script will update the DATABASE_URL in Railway to use variable reference

set -e

echo "🔧 Fixing Railway Database Connection..."
echo ""

# Check if railway CLI is installed
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI is not installed"
    echo "   Install it with: npm install -g @railway/cli"
    exit 1
fi

# Check if logged in
if ! railway whoami &> /dev/null; then
    echo "❌ Not logged in to Railway"
    echo "   Run: railway login"
    exit 1
fi

echo "✅ Railway CLI is ready"
echo ""

# Link to the project
echo "🔗 Linking to genesis-ai project..."
cd "$(dirname "$0")/../backend"

echo ""
echo "⚠️  IMPORTANT: You need to manually update the DATABASE_URL in Railway Dashboard"
echo ""
echo "Current (硬编码的私有网络地址):"
echo "  DATABASE_URL=postgresql://postgres:***@postgres.railway.internal:5432/railway"
echo ""
echo "Change to (变量引用):"
echo "  DATABASE_URL=\${{Postgres.DATABASE_URL}}"
echo ""
echo "Steps:"
echo "  1. Open Railway Dashboard: https://railway.app/project/your-project"
echo "  2. Go to Backend service → Variables"
echo "  3. Edit DATABASE_URL"
echo "  4. Replace with: \${{Postgres.DATABASE_URL}}"
echo "  5. Save and redeploy"
echo ""
echo "🌐 Opening Railway Dashboard..."

# Open Railway dashboard
railway open || echo "Please manually open: https://railway.app"

echo ""
echo "✅ Please complete the steps above in Railway Dashboard"
