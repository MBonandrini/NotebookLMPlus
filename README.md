# NotebookLM+ — Browser-Only Edition

A GitHub Pages-hosted, browser-first replacement for NotebookLM that supports local Ollama, remote Ollama, and configurable hosted OpenAI-compatible AI engines while keeping notebook data/indexes in the browser.

**No Python bridge, FastAPI service, local helper, or desktop agent is required.**

## What this version does

- GitHub Pages static front end only.
- Direct AI API connection from the browser: Ollama locally/remotely or an OpenAI-compatible hosted engine.
- Seven configurable modes: **Lightweight (Local Ollama), Local Ollama, Balanced (Local Ollama), Power (Local Ollama), Remote Ollama, Hosted AI Engine, Custom**.
- Dedicated **AI / Ollama Configuration** tab with provider selection, endpoint testing, Ollama/hosted model discovery, separate chat/embedding model selection, session-only hosted API token support, timeout and keep-alive settings.
- Dedicated in-app **Setup Tutorial**.
- Notebook creation, cloning, reusable templates, and notebooks created from templates.
- File and folder linking through the browser File System Access API where supported.
- Fallback multi-file and folder picker where the richer API is unavailable.
- Browser-side parsing for PDF, DOCX, XLS/XLSX, PPTX, CSV, TXT, Markdown, JSON, HTML, XML, YAML and logs.
- PDF page, Excel sheet/range and PowerPoint slide metadata retained for citations.
- Browser-side chunking, keyword retrieval and vector retrieval.
- Embeddings generated using the selected Ollama or hosted embedding model and stored in IndexedDB; keyword-only retrieval remains available without embeddings.
- Streamed chat responses from Ollama or the configured hosted AI engine.
- Bottom-right slow-operation progress/status widget.
- Source scopes: entire notebook or selected sources.
- Browser-local chat history, notebooks, templates, parsed indexes and embeddings.
- Backup/export and restore/import.
- PWA/service-worker shell caching.
- GitHub Actions test + Pages deployment workflow.

## Architecture

```text
GitHub Pages
     │
     ▼
Browser / PWA
├── UI
├── Notebooks / templates
├── File & folder handles
├── PDF / Office parsing
├── Chunking
├── IndexedDB
├── Keyword search
├── Vector search
└── Retrieval / citation assembly
          │
          ▼
      AI provider
      ├── Local Ollama:  http://127.0.0.1:11434
      ├── Remote Ollama: configurable Ollama endpoint
      └── Hosted AI: configurable OpenAI-compatible HTTPS /v1 endpoint
```

Original documents are not uploaded to GitHub. Third-party parser JavaScript is downloaded by the browser from pinned CDN URLs, but the document bytes are parsed locally inside the page.

## Recommended browser

Use a current **Chrome or Edge** release for the richest local filesystem experience. `showDirectoryPicker()` support varies between browsers, so the application contains a fallback directory picker.

## 1. Deploy to GitHub Pages

Create a new GitHub repository and copy the contents of this folder into its root.

The project already contains:

```text
.github/workflows/pages.yml
```

Push to `main`. The workflow:

1. checks all JavaScript syntax;
2. runs the retrieval/configuration unit tests;
3. runs mocked Ollama API integration tests;
4. runs static application contract tests;
5. smoke-tests the static site over HTTP;
6. deploys the repository as a GitHub Pages artifact.

In GitHub, ensure **Settings → Pages → Source** is configured to use **GitHub Actions** if it is not selected automatically.

## 2. Install Ollama

Install Ollama from the official Ollama site and start it.

Ollama's default local API is:

```text
http://127.0.0.1:11434
```


## One-click Windows Ollama setup (recommended)

NotebookLM+ includes a ready-to-run Ollama setup package:

```text
downloads/NotebookLMPlus-Ollama-Setup.zip
```

Extract it and double-click:

```text
Run-Ollama-Setup.bat
```

It automatically adds the exact NotebookLMPlus GitHub Pages origin to the current user's `OLLAMA_ORIGINS`, preserves existing origins, restarts Ollama, optionally pulls `qwen3:4b` and `embeddinggemma`, and tests both the Ollama API and the returned browser-origin/CORS header. It deliberately does **not** use `OLLAMA_ORIGINS=*`.

The source scripts are also committed under `tools/ollama-setup/`.

## 3. Download models

Example lightweight/default starting pair:

```bash
ollama pull qwen3:4b
ollama pull embeddinggemma
```

You may use any installed Ollama chat model and compatible embedding model. The application reads the installed model list using `/api/tags`.

## 4. Allow your GitHub Pages origin

A page hosted at GitHub Pages is a different browser origin from Ollama. Configure Ollama to allow the **exact trusted site origin** using `OLLAMA_ORIGINS`.

For:

```text
https://MBonandrini.github.io/NotebookLMPlus/
```

the origin is:

```text
https://MBonandrini.github.io
```

### Windows

Create a user environment variable:

```text
Name:  OLLAMA_ORIGINS
Value: https://MBonandrini.github.io
```

Then **fully quit and restart Ollama**.

You can also set a persistent user variable from PowerShell:

```powershell
setx OLLAMA_ORIGINS "https://MBonandrini.github.io"
```

Restart Ollama after doing this; `setx` does not alter processes that are already running.

### Linux

For a manually started Ollama server:

```bash
OLLAMA_ORIGINS=https://MBonandrini.github.io ollama serve
```

For a system service, add the environment value to the Ollama service configuration and restart the service.

### macOS

Set `OLLAMA_ORIGINS` for the Ollama process/service and restart Ollama.

### Security

Prefer an exact origin. Avoid setting:

```text
OLLAMA_ORIGINS=*
```

unless you understand why exposing Ollama to arbitrary web origins is unsafe.

## 5. Browser local-network permission

Modern browsers increasingly protect requests from public HTTPS sites to software on localhost/private networks.

When your trusted NotebookLM+ page first connects to Ollama, the browser may ask permission to access software or devices on the local/loopback network. Approve it for your own GitHub Pages deployment.

The Ollama client attempts to use the modern `targetAddressSpace: "loopback"` request hint when talking to localhost; browsers that do not implement the option ignore it.

## 6. Configure Ollama inside the application

Open:

```text
AI / Ollama Configuration
```

Then:

1. choose a mode from the top-right dropdown;
2. set the endpoint for that mode;
3. press **Test connection**;
4. press **Refresh installed models**;
5. select a **Chat model**;
6. select an **Embedding model**;
7. configure timeout and keep-alive;
8. configure context size, top-K retrieval, batch size, workers and temperature;
9. save the Ollama and mode settings.

The endpoint, chat model, embedding model and performance values can be different by mode.

## Performance modes

| Mode | Default context | Top K | Purpose |
|---|---:|---:|---|
| Lightweight (Local Ollama) | 4,096 | 6 | Slow/older computers |
| Local Ollama | 8,192 | 10 | Normal local use |
| Balanced (Local Ollama) | 16,384 | 12 | General default |
| Power (Local Ollama) | 32,768 | 20 | Strong CPU/GPU workstation |
| Remote Ollama | 32,768 | 16 | Inference on another Ollama server |
| Hosted AI Engine | 32,768 | 16 | OpenAI-compatible private/cloud engine |
| Custom | 16,384 | 12 | Fully manual provider/tuning |

All values are editable.


## Hosted AI Engine mode

Choose **Hosted AI Engine** from the main mode dropdown to use an OpenAI-compatible HTTPS endpoint instead of Ollama. The browser supports:

- `GET /models` for optional model discovery;
- `POST /chat/completions` with streaming SSE responses;
- `POST /embeddings` when a hosted embedding model is configured.

Enter the API base, normally ending in `/v1`, in **AI / Ollama Configuration**. A bearer token can be entered for the current page session. NotebookLM+ keeps it in JavaScript module memory only; a reload clears it, and it is never persisted to IndexedDB or exported notebook backups.

For a future production/paid deployment, do not embed a permanent provider secret in this static GitHub Pages application. Prefer short-lived user tokens, an authenticated gateway, VPN/private access, or another server-side authentication layer. The hosted service must allow CORS from the NotebookLM+ web origin.

If no hosted embedding model is configured, the application continues to use keyword/exact-term retrieval.

## Remote mode

Remote mode still keeps the notebook and source index in the browser. The application retrieves the relevant passages locally and sends the assembled context to the configured remote Ollama endpoint.

For remote use, prefer an **HTTPS** endpoint protected by a VPN, authenticated reverse proxy, private network or another access-control layer. Do not expose an unauthenticated raw Ollama port directly to the public internet.

## File/folder behaviour

### Full File System Access API

Where supported, `showOpenFilePicker()` / `showDirectoryPicker()` return permissioned file-system handles. These handles can be stored in IndexedDB and reused for rescans, subject to browser permission rules.

### Fallback picker

NotebookLM+ now uses ordinary browser file/directory selection as the primary Add files/Add folder path because it is the most reliable option on GitHub Pages. Selected bytes are parsed locally and the resulting index is stored in IndexedDB. The original files are not uploaded. Because ordinary picker selections do not grant a permanent filesystem handle, a future re-index may require the source to be selected again.

## File formats

| Format | Browser parser |
|---|---|
| PDF | PDF.js |
| DOCX | Mammoth |
| XLSX / XLS | SheetJS |
| PPTX | JSZip + Open XML parsing |
| CSV / TSV | Native text parser |
| TXT / Markdown / JSON / XML / YAML / LOG | Native text parser |
| HTML | DOM parser |
| DOC | Convert to DOCX first |
| PPT | Convert to PPTX first |

Excel chunks preserve sheet/range metadata. PPTX chunks preserve slide metadata. PDF chunks preserve page metadata.

## Templates

Use these Workspace actions:

```text
Clone
Save template
From template
```

**Clone** duplicates the notebook structure, sources, parsed chunks and existing embeddings locally, but starts a fresh conversation.

**Save template** stores the notebook description/instructions and source blueprints.

**From template** creates a clean notebook using the template. Source references can optionally be copied and rescanned.

## Search / RAG

Retrieval combines:

- semantic similarity from Ollama embeddings;
- keyword/exact-term scoring for IDs, clauses, dates and codes;
- source scope filtering;
- per-document diversity;
- context-budget trimming.

Evidence is labelled:

```text
[S1] Contract.pdf — Page 146
[S2] Programme.xlsx — Milestones • A1:H40
[S3] Weekly Report.pptx — Slide 23
```

The system prompt explicitly tells the model that retrieved documents are **untrusted evidence, not instructions**, which reduces document prompt-injection risk.

## Slow-operation indicator

Operations only show the bottom-right progress widget after a short delay, so fast operations do not flash a distracting status box.

Examples:

```text
Scanning folder               47%
Embedding Programme.xlsx      72%
Ranking 3,820 chunks
Generating response • qwen3
```

When Ollama reports generation statistics, tokens/second is shown at completion.

## Browser storage and backups

The application stores data under the GitHub Pages origin using IndexedDB.

Use:

```text
Settings → Export backup
```

to create a `.lnb` JSON backup.

Filesystem permission handles are deliberately excluded from JSON backups because they are browser-specific capability objects. Restored sources may therefore require re-linking.

## Testing

Run:

```bash
bash tests/run_tests.sh
```

Current suite:

- JavaScript syntax checks for every application module and service worker;
- 18 retrieval/configuration/parser/security/fuzz unit tests;
- 7 Ollama API protocol/integration tests against a mock HTTP Ollama server;
- 9 hosted OpenAI-compatible protocol/integration tests;
- 24 static application-contract tests;
- static GitHub Pages HTTP smoke test;
- real Chromium E2E regression in GitHub Actions covering selectable models, zero-source chat, source indexing, Enter-to-send, folder selection, backup safety, IndexedDB persistence, and service-worker registration.

The tests verify, among other things:

- all seven local/remote/hosted/custom modes;
- hybrid retrieval and exact-identifier scoring;
- context/citation assembly;
- model discovery;
- embedding requests;
- streamed chat parsing;
- required tabs and Ollama controls;
- setup tutorial content;
- PDF/DOCX/XLS/XLSX/PPTX parser wiring;
- file and folder APIs;
- IndexedDB usage;
- progress widget wiring;
- no duplicate HTML IDs;
- GitHub Pages deployment workflow;
- absence of the old `127.0.0.1:8765` local bridge dependency.

## Hardened chat and indexing behaviour

- **Enter sends** a chat message; **Shift+Enter** inserts a new line.
- Chat and embedding models are real selectable dropdowns populated by model discovery, with **Custom model…** for manual/private endpoints.
- The embedding model can be left blank for **keyword-only** retrieval.
- Chat works with **zero sources**. When indexed evidence is unavailable, NotebookLM+ behaves as normal AI chat and explicitly avoids claiming that an answer came from notebook files.
- A source card is not treated as proof of a usable index. Source cards show **Indexing, Ready, Index error, No text found, or Needs indexing**, together with indexed-file and chunk counts.
- If a persistent source handle exists but chunks are missing, NotebookLM+ attempts one automatic recovery scan before falling back to general chat.
- Generation can be cancelled from the progress widget.


## v0.5.1 startup/cache hardening

NotebookLM+ now includes a build-version handshake between `index.html` and `app.js`. If GitHub Pages or a service worker ever serves HTML and JavaScript from different releases, the app automatically unregisters the stale worker, clears only NotebookLM+ cache entries, and reloads once with a cache-busting build parameter. The service worker is network-first for same-origin application assets, and the entry CSS/JavaScript URLs are versioned. This prevents the previous `Cannot set properties of null (setting 'innerHTML')` mixed-build startup failure.

If a required UI element is genuinely absent, startup errors now name the missing element and include the application build and stack trace instead of only showing a generic null-property error.

## Important limitations of a bridge-free web application

1. A closed browser cannot continuously watch a linked folder in the background. The app rescans linked folders when requested and optionally when a notebook opens.
2. Browser permission rules may require access to a previously linked file/folder to be re-approved.
3. Browser storage can be cleared by the user/browser. Export backups for important notebooks.
4. Browser-only legacy Office parsing is intentionally limited. Convert `.doc` and `.ppt` to modern Office formats.
5. Browser-to-localhost behaviour can vary by browser/version because local-network security controls are evolving.
6. If Ollama's browser CORS/preflight behaviour changes in a future release, update Ollama and use the in-app connection test/troubleshooting guide.

## Project structure

```text
index.html
css/
  styles.css
js/
  app.js
  config.js
  db.js
  ollama.js
  parsers.js
  chunking.js
  retrieval.js
  indexer.js
  sources.js
  progress.js
  markdown.js
  utils.js
.github/workflows/
  pages.yml
tests/
  unit.test.mjs
  ollama.integration.mjs
  contract_test.py
  run_tests.sh
manifest.webmanifest
sw.js
.nojekyll
```
