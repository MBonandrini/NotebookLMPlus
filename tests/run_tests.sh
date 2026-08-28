#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "[1/6] JavaScript syntax"
for f in js/*.js sw.js; do node --check "$f"; done

echo "[2/6] Retrieval/configuration unit tests"
node --test tests/unit.test.mjs

echo "[3/6] Ollama API integration tests (mock server)"
node --test tests/ollama.integration.mjs

echo "[4/6] Hosted AI integration tests (mock OpenAI-compatible server)"
node --test tests/hosted-ai.integration.mjs

echo "[5/6] Static application contract tests"
python -m pytest -q tests/contract_test.py

echo "[6/6] GitHub Pages static-server smoke test"
PORT=8768
python -m http.server "$PORT" --bind 127.0.0.1 >/tmp/notebooklmplus-http.log 2>&1 &
SERVER_PID=$!
trap 'kill "$SERVER_PID" 2>/dev/null || true' EXIT
sleep 1
curl --fail --silent "http://127.0.0.1:$PORT/" | grep -q 'NotebookLM+'
curl --fail --silent "http://127.0.0.1:$PORT/js/app.js" | grep -q 'sendQuestion'
curl --fail --silent "http://127.0.0.1:$PORT/sw.js" | grep -q 'notebooklmplus-v0.4.0'
kill "$SERVER_PID" 2>/dev/null || true
trap - EXIT

echo "All tests passed."
