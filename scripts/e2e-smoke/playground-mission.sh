#!/usr/bin/env bash
# PR-9 v1.6 P-A8 / J 修订 — playground-mission e2e smoke（4 档动态阈值）
#
# Contract:
#   入参（环境变量）:
#     STAGING_BASE_URL    必需 — staging API base URL
#     TEST_USER_API_KEY   必需 — staging test user 的 API key（用于 Authorization）
#     SCALE               可选 — quick/standard/deep/professional（默认 deep）
#     TIMEOUT_SEC         可选 — mission 完成轮询超时（默认 900s）
#
#   出参（stdout）: JSON
#     { passed: bool, gaps: [], duration_sec: number, cost_usd: number, mission_id: string }
#
#   exit code:
#     0 = 全合约通过
#     1 = 至少 1 合约失败（qualityGap > 0）
#     2 = mission 创建失败（HTTP error）
#     3 = mission 超时（> $TIMEOUT_SEC）
#     4 = 环境变量缺失
#
# 见 docs/architecture/ai-app/agent-playground/agent-playground-overhaul-v1.6.md § 3 / § 14.3 P-A8

set -euo pipefail

# 0. env check (exit 4)
[ -z "${STAGING_BASE_URL:-}" ] && { echo "STAGING_BASE_URL missing" >&2; exit 4; }
[ -z "${TEST_USER_API_KEY:-}" ] && { echo "TEST_USER_API_KEY missing" >&2; exit 4; }
[ -z "${SCALE:-}" ] && SCALE="deep"
[ -z "${TIMEOUT_SEC:-}" ] && TIMEOUT_SEC=900

# 1. SCALE 动态阈值（与 backend SCALE_PRESETS 对齐；P-A8 v1.4 修订）
case "$SCALE" in
  quick)
    MIN_WPC=800;  MAX_WPC=1200;  EXP_CH_MIN=5;   FIG_PER_CH=0; CITATIONS_REQUIRED=0
    ;;
  standard)
    MIN_WPC=1500; MAX_WPC=2500;  EXP_CH_MIN=14;  FIG_PER_CH=1; CITATIONS_REQUIRED=1
    ;;
  deep)
    MIN_WPC=12000; MAX_WPC=15000; EXP_CH_MIN=9;  FIG_PER_CH=3; CITATIONS_REQUIRED=1
    ;;
  professional)
    MIN_WPC=18000; MAX_WPC=22000; EXP_CH_MIN=11; FIG_PER_CH=4; CITATIONS_REQUIRED=1
    ;;
  *)
    echo "Unsupported SCALE: $SCALE" >&2
    exit 4
    ;;
esac

# 2. 创建 mission (exit 2 if fail)
echo "Creating mission with scale=$SCALE..." >&2
CREATE_BODY=$(cat <<EOF
{
  "topic": "E2E smoke test - $SCALE - $(date +%Y%m%d-%H%M%S)",
  "reportScale": "$SCALE",
  "withFigures": $([ $FIG_PER_CH -gt 0 ] && echo true || echo false),
  "withCitations": $([ $CITATIONS_REQUIRED -gt 0 ] && echo true || echo false)
}
EOF
)

MISSION_ID=$(
  curl -fsS -X POST "$STAGING_BASE_URL/api/agent-playground/missions" \
    -H "Authorization: Bearer $TEST_USER_API_KEY" \
    -H "Content-Type: application/json" \
    -d "$CREATE_BODY" \
    | jq -r '.mission.id // .id // empty'
) || { echo "Mission creation failed" >&2; exit 2; }

[ -z "$MISSION_ID" ] && { echo "Mission ID not returned" >&2; exit 2; }
echo "Mission created: $MISSION_ID" >&2

# 3. 轮询等完成 (exit 3 if timeout)
START=$(date +%s)
while true; do
  STATUS=$(
    curl -fsS "$STAGING_BASE_URL/api/agent-playground/missions/$MISSION_ID" \
      -H "Authorization: Bearer $TEST_USER_API_KEY" \
      | jq -r '.mission.status // .status // "unknown"'
  )
  if [[ "$STATUS" == "completed" || "$STATUS" == "failed" ]]; then
    echo "Mission $MISSION_ID reached status: $STATUS" >&2
    break
  fi
  ELAPSED=$(( $(date +%s) - START ))
  if (( ELAPSED > TIMEOUT_SEC )); then
    echo "Mission $MISSION_ID timed out after ${ELAPSED}s" >&2
    exit 3
  fi
  sleep 10
done

# 4. 抓取最终 mission JSON
MISSION_JSON=$(
  curl -fsS "$STAGING_BASE_URL/api/agent-playground/missions/$MISSION_ID" \
    -H "Authorization: Bearer $TEST_USER_API_KEY"
)

# 5. jq 动态断言（不硬编码阈值，从 SCALE 推导）
GAPS=$(
  echo "$MISSION_JSON" \
  | jq --argjson minWpc "$MIN_WPC" \
       --argjson figPerCh "$FIG_PER_CH" \
       --argjson expChMin "$EXP_CH_MIN" \
       --argjson citReq "$CITATIONS_REQUIRED" \
       '{
         gaps: [
           # 字数下限：每章 wordCount < 0.7 × MIN_WPC
           ((.chapters // [])
             | map(select(.wordCount < ($minWpc * 0.7)))
             | length
             | select(. > 0)
             | { contract: ("wordsPerCh>=" + (($minWpc * 0.7 | floor)|tostring)), failed: . }),
           # 图数：每章 figures.length < figPerCh
           ((.chapters // [])
             | map(select((.figures // []) | length < $figPerCh))
             | length
             | select(. > 0)
             | { contract: ("figPerCh>=" + ($figPerCh|tostring)), failed: . }),
           # 总章数下限
           ((.chapters // [] | length)
             | select(. < $expChMin)
             | { contract: ("totalChapters>=" + ($expChMin|tostring)), actual: . }),
           # 引用（仅 citReq=1 时校验）
           (if $citReq == 1 then
             ((.chapters // [])
               | map(select((.citations // []) | length < 1))
               | length
               | select(. > 0)
               | { contract: "citationsPerCh>=1", failed: . })
            else null end)
         ] | map(select(. != null))
       }'
)

PASSED=$(echo "$GAPS" | jq '.gaps | length == 0')
DURATION=$(( $(date +%s) - START ))
COST=$(echo "$MISSION_JSON" | jq -r '.mission.costUsd // .costUsd // 0')

# 6. 输出结果 JSON
echo "{\"passed\": $PASSED, \"gaps\": $(echo "$GAPS" | jq -c '.gaps'), \"duration_sec\": $DURATION, \"cost_usd\": $COST, \"mission_id\": \"$MISSION_ID\", \"scale\": \"$SCALE\"}"

# 7. exit code 决定 PASS / FAIL
if [[ "$PASSED" == "true" ]]; then
  exit 0
else
  exit 1
fi
