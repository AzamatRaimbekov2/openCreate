#!/usr/bin/env bash
# Behaviour-harness sensor runner — stack-aware, best-effort, non-destructive.
# Runs the project's behaviour sensors (tests, types/lint, mutation) and reports
# what ran, what passed, and which behaviour sensors are MISSING so the gap is
# visible (no silent "looks covered"). Exit code reflects test failures only.
# Usage: bash .claude/skills/behaviour-harness/assets/behaviour-check.sh [target-path]
set -uo pipefail
ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"; cd "$ROOT" || exit 1
TARGET="${1:-.}"
FAIL=0; MISSING=()
say(){ printf '\n=== %s ===\n' "$1"; }
have(){ command -v "$1" >/dev/null 2>&1; }
jshas(){ [ -f package.json ] && node -e "const p=require('./package.json');process.exit((((p.dependencies||{})[process.argv[1]])||((p.devDependencies||{})[process.argv[1]]))?0:1)" "$1" 2>/dev/null; }

echo "[behaviour-check] project: $ROOT  target: $TARGET"

# ---------- JavaScript / TypeScript ----------
if [ -f package.json ]; then
  say "JS/TS: type & lint (keep-left, computational)"
  jshas typescript && { npx --no-install tsc --noEmit 2>&1 | tail -20 || FAIL=1; } || echo "(no typescript)"
  ( npm run -s lint 2>/dev/null || jshas eslint && npx --no-install eslint . 2>&1 | tail -20 ) || echo "(no lint script/eslint)"

  say "JS/TS: tests (behaviour sensors)"
  if jshas vitest; then npx --no-install vitest run 2>&1 | tail -30 || FAIL=1
  elif jshas jest; then npx --no-install jest 2>&1 | tail -30 || FAIL=1
  elif npm run -s test >/dev/null 2>&1; then npm run -s test 2>&1 | tail -30 || FAIL=1
  else MISSING+=("JS test runner (vitest/jest)"); fi

  jshas @playwright/test || jshas cypress || MISSING+=("E2E (playwright/cypress)")
  jshas fast-check || MISSING+=("property-based (fast-check)")

  say "JS/TS: mutation testing (sensor-on-sensors)"
  if jshas @stryker-mutator/core || [ -f stryker.conf.json ] || [ -f stryker.config.json ] || [ -f stryker.conf.js ]; then
    npx --no-install stryker run 2>&1 | tail -25 || true
  else MISSING+=("mutation testing (StrykerJS)"); fi
fi

# ---------- Python ----------
if [ -f pyproject.toml ] || [ -f setup.cfg ] || [ -f requirements.txt ] || ls ./*.py >/dev/null 2>&1; then
  say "Python: type & lint (keep-left, computational)"
  have ruff && ruff check "$TARGET" 2>&1 | tail -20 || echo "(no ruff)"
  have mypy && mypy "$TARGET" 2>&1 | tail -20 || echo "(no mypy)"

  say "Python: tests (behaviour sensors)"
  if have pytest; then pytest -q 2>&1 | tail -30 || FAIL=1
  elif python3 -c "import pytest" 2>/dev/null; then python3 -m pytest -q 2>&1 | tail -30 || FAIL=1
  else MISSING+=("Python test runner (pytest)"); fi

  python3 -c "import hypothesis" 2>/dev/null || MISSING+=("property-based (hypothesis)")

  say "Python: mutation testing (sensor-on-sensors)"
  if have mutmut; then mutmut run 2>&1 | tail -20 || true
  elif have cosmic-ray; then echo "cosmic-ray present — run per its config";
  else MISSING+=("mutation testing (mutmut/cosmic-ray)"); fi
fi

say "Behaviour sensor coverage report"
if [ ${#MISSING[@]} -eq 0 ]; then
  echo "✓ all expected behaviour sensors are present"
else
  echo "⚠ MISSING behaviour sensors (add or justify — do not treat as covered):"
  for m in "${MISSING[@]}"; do echo "  - $m"; done
fi
echo
[ $FAIL -eq 0 ] && echo "[behaviour-check] tests: PASS" || echo "[behaviour-check] tests: FAIL"
exit $FAIL
