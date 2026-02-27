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

for token in "${FORBIDDEN_TOKENS[@]}"; do
  matches="$(rg -n -S --glob '!**/*.test.*' --glob '!**/*.spec.*' --glob '!**/*.d.ts' "$token" src || true)"
  if [[ -n "$matches" ]]; then
    echo "Forbidden hardcoded token found in src: $token"
    echo "$matches"
    found=1
  fi
done

if [[ "$found" -ne 0 ]]; then
  echo "Hardcoded-token guard failed."
  exit 1
fi

echo "Hardcoded-token guard passed."
