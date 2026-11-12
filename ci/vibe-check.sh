#!/usr/bin/env bash
# 平台无关门禁入口：任何 CI 都能调这一个脚本。
# 用法：ci/vibe-check.sh [project-dir]
set -u

PROJECT="${1:-.}"
BASE_DIR="$(cd "$(dirname "$0")/.." && pwd)"

node "$BASE_DIR/bin/vibe-check.mjs" all --project "$PROJECT" --ci --sarif "$PROJECT/vibe.sarif"
CODE=$?

case "$CODE" in
  0) echo "vibe-check: PASS" ;;
  1) echo "vibe-check: FAIL（判定未通过）" ;;
  2) echo "vibe-check: CONFIG（.vibe 配置损坏）" ;;
  3) echo "vibe-check: CRASH（判定崩溃，不得当作通过）" ;;
  *) echo "vibe-check: UNKNOWN exit $CODE" ;;
esac

exit "$CODE"
