#!/bin/bash
# Facade Boundary Checker
# Ensures ai-app modules only import from ai-engine/facade, never from internal paths.
# Run in CI or locally: bash scripts/devops/check-facade-boundary.sh
#
# Exit code 0 = clean, 1 = violations found

set -euo pipefail

AI_APP_DIR="backend/src/modules/ai-app"
VIOLATIONS=""
COUNT=0

echo "=== Facade Boundary Check ==="
echo "Scanning $AI_APP_DIR for direct ai-engine imports..."

# Find all .ts files in ai-app that import from ai-engine
# Allowed patterns:
#   - ai-engine/facade (the official facade entry point)
#   - ai-engine/ai-engine.module (NestJS module DI wiring - every app module needs this)
while IFS= read -r line; do
  # Skip imports from ai-engine/facade (allowed)
  if echo "$line" | grep -q "ai-engine/facade"; then
    continue
  fi

  # Skip AiEngineModule imports in .module.ts files (NestJS DI wiring is legitimate)
  if echo "$line" | grep -q "ai-engine.module"; then
    continue
  fi

  VIOLATIONS+="$line"$'\n'
  COUNT=$((COUNT + 1))
done < <(grep -rn "from.*['\"].*ai-engine/" "$AI_APP_DIR" \
  --include="*.ts" \
  --include="*.tsx" \
  2>/dev/null | grep -v "node_modules" | grep -v ".spec.ts" | grep -v "__tests__" || true)

if [ "$COUNT" -gt 0 ]; then
  echo ""
  echo "❌ Found $COUNT facade boundary violation(s):"
  echo ""
  echo "$VIOLATIONS" | head -50
  echo ""
  echo "FIX: Import from 'ai-engine/facade' instead of internal ai-engine paths."
  echo "If the symbol is not exported from facade, add it to backend/src/modules/ai-engine/facade/index.ts first."
  exit 1
else
  echo "✅ No facade boundary violations found."
  exit 0
fi
