#!/usr/bin/env bash
# Spike item: run Claude Code end to end against an Anthropic-format endpoint on a small fixture
# repo, using a multi-step task (read files, edit them, run tests).
#
#   Against Phala directly:  PHALA_API_KEY=... scripts/spike/claude-code-e2e.sh phala
#   Against our gateway:     SEALCODE_KEY=sc_live_... scripts/spike/claude-code-e2e.sh gateway
#
# Set DISABLE_BETAS=1 to retry with CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1.
set -euo pipefail

mode="${1:-phala}"
work="$(mktemp -d)"
trap 'echo "Fixture kept at $work"' EXIT

mkdir -p "$work/src" "$work/test"
cat > "$work/package.json" <<'JSON'
{ "name": "fixture", "type": "module", "scripts": { "test": "node --test test/" } }
JSON
cat > "$work/src/money.js" <<'JS'
// Formats an amount in minor units (pence) as pounds.
export function formatGBP(pence) {
  return '£' + pence / 100;
}
export function addVat(pence) {
  return pence * 1.2;
}
JS
cat > "$work/test/money.test.js" <<'JS'
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatGBP, addVat } from '../src/money.js';
test('formats with two decimals', () => assert.equal(formatGBP(1050), '£10.50'));
test('formats thousands', () => assert.equal(formatGBP(123456), '£1,234.56'));
test('adds VAT and rounds to whole pence', () => assert.equal(addVat(999), 1199));
test('rejects negative amounts', () => assert.throws(() => formatGBP(-1)));
JS
(cd "$work" && git init -q && git add -A && git commit -qm fixture)

unset ANTHROPIC_API_KEY
export CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1
if [[ "$mode" == "phala" ]]; then
  export ANTHROPIC_BASE_URL=https://inference.phala.com
  export ANTHROPIC_AUTH_TOKEN="${PHALA_API_KEY:?set PHALA_API_KEY}"
  export ANTHROPIC_DEFAULT_OPUS_MODEL=z-ai/glm-5.3
  export ANTHROPIC_DEFAULT_SONNET_MODEL=z-ai/glm-5.3
  export ANTHROPIC_DEFAULT_HAIKU_MODEL=z-ai/glm-5.3-flash
else
  export ANTHROPIC_BASE_URL="${SEALCODE_BASE_URL:-http://localhost:8787}"
  export ANTHROPIC_AUTH_TOKEN="${SEALCODE_KEY:?set SEALCODE_KEY}"
  export ANTHROPIC_DEFAULT_OPUS_MODEL=sealcode-pro
  export ANTHROPIC_DEFAULT_SONNET_MODEL=sealcode-pro
  export ANTHROPIC_DEFAULT_HAIKU_MODEL=sealcode-fast
fi
[[ "${DISABLE_BETAS:-0}" == "1" ]] && export CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1

cd "$work"
claude -p --verbose --output-format stream-json --max-turns 30 \
  --allowedTools "Read,Edit,Write,Bash(npm test:*),Bash(node --test:*),Glob,Grep" \
  "Run the tests with npm test. Read src/money.js and the tests, fix src/money.js so every test passes (thousands separators, two decimals, rounding VAT to whole pence, throwing a RangeError on negative amounts), add a JSDoc comment to each function, then run the tests again and confirm they pass." \
  > "$work/transcript.jsonl" 2> "$work/stderr.log" || true

echo "Turns: $(grep -c '"type":"assistant"' "$work/transcript.jsonl" || true)"
echo "API errors: $(grep -Eo 'API Error: [0-9]{3}' "$work/transcript.jsonl" "$work/stderr.log" | sort | uniq -c || true)"
if (cd "$work" && npm test --silent >/dev/null 2>&1); then echo "RESULT: tests pass"; else echo "RESULT: tests fail"; fi
