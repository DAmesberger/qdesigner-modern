#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

FORBIDDEN_TOKENS=(
  "test-project-1"
  "test-questionnaire-1"
  "demo@example.com"
  "demo123456"
  "TestPassword123!"
)

found=0

SEARCH_PATHS=(
  "apps/web/src"
  "packages/questionnaire-core/src"
  "packages/scripting-engine/src"
)

for token in "${FORBIDDEN_TOKENS[@]}"; do
  matches="$(rg -n -S --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/*.d.ts' "$token" "${SEARCH_PATHS[@]}" || true)"
  if [[ -n "$matches" ]]; then
    echo "Forbidden hardcoded token found in tracked sources: $token"
    echo "$matches"
    found=1
  fi
done

if [[ "$found" -ne 0 ]]; then
  echo "Hardcoded-token guard failed."
  exit 1
fi

echo "Hardcoded-token guard passed."
