# NotebookLM+ v0.5.0 Hardened QA Report

## Release scope

This release hardens the browser-only GitHub Pages build, with particular focus on:

- selectable chat and embedding models;
- source indexing correctness and visible index state;
- normal AI chat when there are zero sources or zero usable chunks;
- Enter-to-send / Shift+Enter;
- browser file and directory selection;
- Ollama and hosted OpenAI-compatible streaming;
- IndexedDB / backup integrity;
- parser and citation correctness;
- context-size and slow-model behaviour;
- static-site caching and deployment.

## Automated release gate

The final local release suite passes:

- 18 core unit / parser / security / fuzz tests
- 7 Ollama protocol and streaming tests
- 9 hosted-AI protocol and streaming tests
- 24 application-contract tests
- GitHub Pages static-server smoke test
- direct TXT parse + chunk smoke test

Total: **58 automated assertions/tests plus deployment and parser smoke checks**.

## Real-browser E2E

`tests/browser_e2e.py` exercises a real Chromium browser and covers:

1. Ollama model discovery.
2. Selecting chat and embedding models from dropdowns.
3. Creating a notebook.
4. Chatting successfully with zero sources.
5. Adding and indexing a TXT source.
6. Verifying source state/chunk count.
7. RAG chat with indexed evidence.
8. Enter-to-send and Shift+Enter.
9. Directory selection/indexing.
10. Malformed-backup safety.
11. IndexedDB persistence after reload.
12. Service-worker registration.

The GitHub Actions deployment workflow installs Playwright/Chromium and runs this test before Pages deployment. The current ChatGPT execution container itself blocks Chromium navigation to `127.0.0.1` with `ERR_BLOCKED_BY_ADMINISTRATOR`, so the browser test cannot be executed inside this container; the non-browser suite and static HTTP smoke test do execute successfully here.

## Defects fixed during iterative hardening

- stale deployment smoke-test assertions;
- source-card existence incorrectly implying usable chunks;
- fatal no-index chat behaviour;
- model controls not behaving as true discovered-model selects;
- embedding vectors from a previous embedding model being mixed with a new query model;
- Excel citations assuming A1-based used ranges;
- malformed backup import risking data loss before validation;
- imported display data sanitisation;
- slow active streams being killed by total-duration timeout rather than inactivity timeout;
- hosted engines returning non-streaming JSON despite `stream:true`;
- malformed stream-line resilience;
- incomplete embedding batches;
- context-budget overruns;
- chunk boundary/termination edge cases;
- outdated SheetJS dependency;
- PDF scripting/eval hardening;
- index-worker setting previously not affecting actual concurrency;
- oversized-file browser safety limit;
- hosted API token persistence reduced to in-memory only;
- service-worker stale-code behaviour;
- user cancellation for long generations.

## Known architectural limitations

A browser-only GitHub Pages application cannot continuously monitor ordinary file-input selections while the browser is closed. Re-indexing an ordinary file/folder picker source can require selecting it again. This is deliberate in the bridge-free architecture and is surfaced in the source status UI instead of failing silently.
