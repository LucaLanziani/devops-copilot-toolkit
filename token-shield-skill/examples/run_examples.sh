#!/usr/bin/env bash
# run_examples.sh — Run Token Shield against all example inputs and show results.
# Run from the token-shield-skill/ directory:
#   cd token-shield-skill && bash examples/run_examples.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
COMPRESS="$ROOT/scripts/compress.py"
COUNTER="$ROOT/scripts/token_counter.py"
OUTPUT_DIR="$SCRIPT_DIR/output"

mkdir -p "$OUTPUT_DIR"

# Colour codes
BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
RESET="\033[0m"

separator() {
  echo -e "\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
}

run_example() {
  local label="$1"
  local input="$2"
  local output="$3"
  local extra_args="${4:-}"

  separator
  echo -e "${BOLD}▶  $label${RESET}"
  echo -e "   Input  : $input"
  echo -e "   Output : $output"
  echo ""

  # Run compression: compressed content → output file, Shield Report → terminal
  # shellcheck disable=SC2086
  python3 "$COMPRESS" "$input" $extra_args > "$output"

  echo ""
  echo -e "${GREEN}   Token delta:${RESET}"
  python3 "$COUNTER" --compare "$input" "$output" 2>/dev/null || true
}

# ─── Example 1: Kubernetes manifest ──────────────────────────────────────────
run_example \
  "Kubernetes Deployment + Service + HPA" \
  "$SCRIPT_DIR/kubernetes/deployment.yaml" \
  "$OUTPUT_DIR/deployment.compressed.yaml"

# ─── Example 2: Terraform file ───────────────────────────────────────────────
run_example \
  "Terraform ECS + ALB" \
  "$SCRIPT_DIR/terraform/main.tf" \
  "$OUTPUT_DIR/main.compressed.tf"

# ─── Example 3: Application logs ─────────────────────────────────────────────
run_example \
  "Application Logs (payment-api)" \
  "$SCRIPT_DIR/logs/app.log" \
  "$OUTPUT_DIR/app.compressed.log" \
  "--format log"

# ─── Example 4: JSON config ──────────────────────────────────────────────────
run_example \
  "JSON Service Config" \
  "$SCRIPT_DIR/json/service-config.json" \
  "$OUTPUT_DIR/service-config.compressed.json"

# ─── Example 5: Markdown ADR ─────────────────────────────────────────────────
run_example \
  "Markdown ADR (Architecture Decision Record)" \
  "$SCRIPT_DIR/markdown/adr-0042-circuit-breaker.md" \
  "$OUTPUT_DIR/adr-0042.compressed.md"

# ─── Example 6: TypeScript / CDK stack ─────────────────────────────────────────
run_example \
  "TypeScript AWS CDK Stack" \
  "$SCRIPT_DIR/javascript/payment-stack.ts" \
  "$OUTPUT_DIR/payment-stack.compressed.ts"

# ─── Example 7: Node.js Express API ──────────────────────────────────────────
run_example \
  "Node.js Express Payment API" \
  "$SCRIPT_DIR/javascript/payment-api.js" \
  "$OUTPUT_DIR/payment-api.compressed.js"

separator
echo -e "\n${BOLD}All examples complete.${RESET}"
echo -e "Compressed outputs written to: ${CYAN}$OUTPUT_DIR/${RESET}\n"
