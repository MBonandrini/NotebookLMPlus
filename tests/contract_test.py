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
    assert "beginProgress('Searching notebook'" in app
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
    assert 'sessionStorage' in ai
    assert 'Authorization' in ai
    assert 'apiKey:' not in config


def test_service_worker_never_caches_cross_origin_ai_calls():
    sw = (ROOT/'sw.js').read_text(encoding='utf-8')
    assert 'url.origin !== self.location.origin' in sw
    assert "'./js/ai.js'" in sw
