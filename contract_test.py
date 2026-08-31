from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
html = (ROOT/'index.html').read_text(encoding='utf-8')
app = (ROOT/'js/app.js').read_text(encoding='utf-8')
ollama = (ROOT/'js/ollama.js').read_text(encoding='utf-8')
ai = (ROOT/'js/ai.js').read_text(encoding='utf-8')
config = (ROOT/'js/config.js').read_text(encoding='utf-8')
parsers = (ROOT/'js/parsers.js').read_text(encoding='utf-8')


def test_no_local_bridge_dependency():
    whole = '\n'.join(p.read_text(encoding='utf-8', errors='ignore') for p in (ROOT/'js').glob('*.js'))
    assert '127.0.0.1:8765' not in whole
    assert 'local-agent' not in whole.lower()
    assert 'fastapi' not in whole.lower()


def test_required_tabs_present():
    for tab in ['workspace','ollama','tutorial','settings']:
        assert f'data-tab="{tab}"' in html
        assert f'id="tab-{tab}"' in html


def test_ollama_configuration_controls_present():
    ids = ['providerSelect','ollamaEndpointInput','chatModelSelect','embeddingModelSelect','hostedApiKeyInput','testOllamaBtn','refreshModelsBtn','saveOllamaBtn']
    for x in ids:
        assert f'id="{x}"' in html
    assert '/api/' in ollama
    assert "'tags'" in ollama
    assert "'embed'" in ollama
    assert '/api/chat' in ollama
    assert 'chat/completions' in ai
    assert "'embeddings'" in ai
    assert "'models'" in ai


def test_tutorial_covers_setup():
    phrases = ['Install Ollama','Automatic Ollama setup','Download a chat model','OLLAMA_ORIGINS','Connect and test','Link folders and files','Hosted AI Engine','Configure a hosted AI engine','Troubleshooting']
    for p in phrases:
        assert p in html


def test_progress_widget_present():
    for x in ['progressWidget','progressBar','progressLabel','progressDetail']:
        assert f'id="{x}"' in html
    assert "beginProgress('Preparing answer'" in app
    assert "'Generating response'" in app


def test_performance_modes_present():
    for key in ['lightweight','local','balanced','power','remote','hosted','custom']:
        assert re.search(rf'\b{key}:\s*\{{', config)


def test_supported_formats_and_parsers():
    for ext in ['pdf','docx','xlsx','xls','pptx','csv','txt','md','json','html','xml']:
        assert ext in config
    assert 'parsePdf' in parsers
    assert 'parseDocx' in parsers
    assert 'parseWorkbook' in parsers
    assert 'parsePptx' in parsers


def test_browser_storage_and_file_system_api():
    assert 'indexedDB.open' in (ROOT/'js/db.js').read_text()
    sources = (ROOT/'js/sources.js').read_text()
    assert 'showDirectoryPicker' in sources
    assert 'showOpenFilePicker' in sources
    assert 'webkitRelativePath' in sources


def test_github_pages_workflow():
    workflow = (ROOT/'.github/workflows/pages.yml').read_text()
    assert 'actions/deploy-pages@v4' in workflow
    assert 'actions/upload-pages-artifact@v3' in workflow


def test_no_duplicate_html_ids():
    ids = re.findall(r'id="([^"]+)"', html)
    dupes = sorted({x for x in ids if ids.count(x) > 1})
    assert not dupes, dupes


def test_one_click_ollama_setup_is_packaged_and_linked():
    root = Path(__file__).resolve().parents[1]
    html = (root / 'index.html').read_text(encoding='utf-8')
    assert 'downloads/NotebookLMPlus-Ollama-Setup.zip' in html
    assert (root / 'downloads' / 'NotebookLMPlus-Ollama-Setup.zip').exists()
    assert (root / 'tools' / 'ollama-setup' / 'Run-Ollama-Setup.bat').exists()
    ps1 = (root / 'tools' / 'ollama-setup' / 'Setup-Ollama-For-NotebookLMPlus.ps1').read_text(encoding='utf-8-sig')
    assert 'https://MBonandrini.github.io/NotebookLMPlus/' in ps1
    assert 'OLLAMA_ORIGINS' in ps1
    assert 'OLLAMA_ORIGINS=*' not in ps1


def test_notebooklm_plus_branding_and_hosted_security():
    assert '<title>NotebookLM+</title>' in html
    assert '<div class="brand-title">NotebookLM+</div>' in html
    assert "provider: 'openai-compatible'" in config
    assert 'Hosted AI Engine' in config
    assert 'sessionStorage.' not in ai
    assert "let sessionApiKey = ''" in ai
    assert 'Authorization' in ai
    assert 'apiKey:' not in config


def test_service_worker_never_caches_cross_origin_ai_calls():
    sw = (ROOT/'sw.js').read_text(encoding='utf-8')
    assert 'url.origin !== self.location.origin' in sw
    assert "'./js/ai.js'" in sw


def test_chat_enter_sends_and_native_source_pickers_are_primary():
    assert "e.key === 'Enter' && !e.shiftKey && !e.isComposing" in app
    assert "$('fileFallbackInput').click()" in app
    assert "$('directoryFallbackInput').click()" in app
    assert 'Enter sends • Shift+Enter adds a new line' in html



def test_excel_parser_uses_patched_sheetjs_release():
    assert 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js' in html
    assert 'xlsx/0.18.5' not in html


def test_imported_display_data_is_sanitized():
    assert "const role = m?.role === 'user' ? 'user' : 'assistant';" in app
    assert 'data-notebook-id="${escapeHtml(String(n.id))}"' in app
    assert 'data-source-check="${escapeHtml(String(src.id))}"' in app
    assert 'data-remove-source="${escapeHtml(String(src.id))}"' in app
    db = (ROOT/'js/db.js').read_text()
    assert "message role must be user or assistant" in db


def test_index_workers_and_file_size_guard_are_functional():
    indexer = (ROOT/'js/indexer.js').read_text()
    assert 'mode.workerCount' in indexer
    assert 'Promise.all(Array.from({ length: workerCount }' in indexer
    assert 'maxFileSizeMB' in indexer
    assert 'Maximum file size (MB)' in html



def test_pdf_parsing_disables_scripting_and_eval_and_site_has_csp():
    assert 'enableScripting: false' in parsers
    assert 'isEvalSupported: false' in parsers
    assert 'Content-Security-Policy' in html
    assert "object-src 'none'" in html
    assert "base-uri 'self'" in html



def test_docx_parser_uses_security_hardened_mammoth_release():
    assert 'mammoth@1.12.1/mammoth.browser.min.js' in html
    assert 'mammoth@1.9.1' not in html


def test_generation_has_user_cancel_control():
    assert 'id="cancelOperationBtn"' in html
    assert 'state.generationController = new AbortController()' in app
    assert 'signal: state.generationController.signal' in app
    ollama_code = (ROOT/'js/ollama.js').read_text()
    assert "signal?.addEventListener?.('abort'" in ollama_code
    assert "signal?.addEventListener?.('abort'" in ai


def test_model_controls_are_real_selectable_dropdowns():
    assert re.search(r'<select id="chatModelSelect"[^>]*>', html)
    assert re.search(r'<select id="embeddingModelSelect"[^>]*>', html)
    assert 'Custom model…' in app
    assert "state.models = await listAiModels" in app
    assert "populateModelSelects();" in app
    assert "selectedModelValue('chatModelSelect', 'chatModelCustomInput')" in app
    assert "selectedModelValue('embeddingModelSelect', 'embeddingModelCustomInput')" in app


def test_chat_gracefully_supports_zero_sources_or_zero_indexed_chunks():
    assert 'This notebook has no indexed source chunks' not in app
    assert "const hasEvidence = results.length > 0;" in app
    assert 'No usable notebook evidence is available for this answer' in app
    assert "'general chat • no indexed evidence used'" in app
    assert "if (chunks.length)" in app


def test_source_cards_surface_real_index_state_and_chunk_counts():
    sources_code = (ROOT/'js/sources.js').read_text()
    assert "status: 'indexing'" in sources_code
    assert "status: 'error'" in sources_code
    assert "'ready'" in sources_code
    assert "'empty'" in sources_code
    assert 'st.chunks' in app
    for label in ['Ready', 'Indexing…', 'Index error', 'No text found', 'Needs indexing']:
        assert label in app


def test_source_inputs_accept_supported_document_types():
    assert 'id="fileFallbackInput"' in html and 'accept=".pdf,.docx,.xlsx,.xls,.pptx' in html
    assert 'id="directoryFallbackInput"' in html and 'webkitdirectory' in html
