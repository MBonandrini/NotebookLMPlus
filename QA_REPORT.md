# NotebookLM+ v0.6.0 QA Report

## Release focus

This release adds two major hardening areas:

1. **Collapsible source tree** for multi-file and folder sources with document-level selection.
2. **CPU / No GPU performance mode** with split model-load and streaming-inactivity timeouts.

## Source-tree behaviour validated

- Multi-file selections are represented as one expandable source containing individual file nodes.
- Folder selections preserve nested sub-folder structure.
- Source roots are collapsible.
- Folder/sub-folder nodes are collapsible.
- Every source, folder and file has a checkbox.
- Parent checkboxes support partial/indeterminate state.
- Selecting/unselecting a folder applies to all descendant documents only.
- Selecting/unselecting one file no longer removes sibling files from retrieval.
- Any tree checkbox change automatically changes chat scope to **Selected files/folders**.
- Selected retrieval filters chunks by source ID or document ID.
- Source-tree rendering uses stored document chunk counts rather than reading every chunk merely to draw the panel.

## CPU / No GPU behaviour validated

Default CPU preset:

- context: 4,096 tokens
- top-K: 4
- maximum answer: 384 tokens
- embedding model: blank / keyword-only
- semantic retrieval: off by default
- indexing workers: 1
- keep-alive: 30 minutes
- first-response/model-load timeout: 900 seconds
- streaming-inactivity timeout: 240 seconds

Chat timing now distinguishes between:

- **first response/model load timeout** — how long Ollama may take before the response begins;
- **streaming inactivity timeout** — how long an already-started response may make no progress.

The inactivity timer resets whenever streamed data arrives. A slow CPU response can therefore take longer than the configured inactivity interval in total, provided it continues making progress.

## Automated release suite

Final local release suite:

- JavaScript syntax: PASS
- Core/unit/parser/security/fuzz tests: **20/20 PASS**
- Ollama integration/protocol tests: **8/8 PASS**
- Hosted AI integration/protocol tests: **9/9 PASS**
- Static application contract tests: **30/30 PASS**
- GitHub Pages static HTTP smoke test: PASS

Total named automated tests: **67**, plus JavaScript syntax and static-server smoke checks.

### New regression cases in this release

- nested source-tree construction;
- root-folder stripping for browser `webkitRelativePath` values;
- descendant-folder document filtering;
- CPU preset safety values;
- timeout clamp limits;
- delayed Ollama first response succeeds when first-response timeout is long enough;
- delayed first response fails when first-response timeout is deliberately too short;
- tree UI wiring and document-level retrieval filters;
- new source-tree module is included in the offline service-worker shell.

## Real-browser E2E

`tests/browser_e2e.py` was expanded to cover:

- discovered Chat model dropdown;
- discovered Embedding model dropdown;
- source-free chat;
- multi-file native picker;
- individual file check/uncheck;
- automatic switch to Selected files/folders scope;
- folder picker;
- nested folder tree rendering;
- folder checkbox presence;
- source-backed chat;
- Enter send / Shift+Enter newline;
- malformed backup protection;
- IndexedDB persistence;
- service-worker registration.

The current execution environment blocks Chromium navigation to its own localhost test server with `ERR_BLOCKED_BY_ADMINISTRATOR`, so this real-browser test cannot be executed locally here. It remains a required GitHub Actions deployment gate (`.github/workflows/pages.yml`), where Chromium is installed and the E2E test runs before Pages deployment.

## Known operational advice for CPU-only machines

- Prefer **CPU / No GPU** mode.
- Prefer a small quantized chat model.
- Leave Embedding model on **Keyword-only** unless semantic retrieval is needed.
- Keep context small; large context increases RAM and compute requirements.
- Keep Ollama loaded if RAM allows; repeated model loads are expensive.
- Increase the model-load/first-response timeout rather than disabling timeouts entirely.
- If local inference remains impractically slow, use Remote Ollama or Hosted AI Engine mode while keeping notebook indexing in the browser.
