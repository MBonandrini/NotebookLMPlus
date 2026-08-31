import json, subprocess, tempfile, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 8779


def main():
    tmp = Path(tempfile.mkdtemp(prefix='notebooklmplus-e2e-'))
    single = tmp / 'source.txt'
    single.write_text(
        'Project Alpha milestone is 18 March 2027. Contract notice is ten working days. '
        'Activity DUB-MEP-10340 is critical.', encoding='utf-8'
    )
    folder = tmp / 'folder'
    folder.mkdir()
    (folder / 'one.txt').write_text('Folder source one: commissioning starts 1 April 2027.', encoding='utf-8')
    (folder / 'two.md').write_text('# Notes\nFolder source two: energisation is planned for 20 March 2027.', encoding='utf-8')
    bad_backup = tmp / 'bad.lnb'
    bad_backup.write_text(json.dumps({'schema': 3, 'stores': {'notebooks': 'not-an-array'}}), encoding='utf-8')

    server = subprocess.Popen(
        ['python', '-m', 'http.server', str(PORT), '--bind', '127.0.0.1'],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
    )
    try:
        time.sleep(.8)
        with sync_playwright() as p:
            launch = {'headless': True, 'args': ['--no-sandbox']}
            if Path('/usr/bin/chromium').exists():
                launch['executable_path'] = '/usr/bin/chromium'
            browser = p.chromium.launch(**launch)
            context = browser.new_context()
            page = context.new_page()

            # TXT/MD E2E paths do not require third-party parsers. Block CDNs so
            # the browser test is deterministic and does not depend on Internet access.
            for pattern in [
                'https://cdn.jsdelivr.net/**',
                'https://cdn.sheetjs.com/**',
                'https://cdnjs.cloudflare.com/**',
            ]:
                page.route(pattern, lambda route: route.abort())

            def ollama(route):
                url = route.request.url
                if url.endswith('/api/version'):
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps({'version': 'test'}))
                if url.endswith('/api/tags'):
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps({
                        'models': [{'name': 'mock-chat'}, {'name': 'embeddinggemma'}]
                    }))
                if url.endswith('/api/embed'):
                    data = route.request.post_data_json or {}
                    inputs = data.get('input') or []
                    vectors = [[1.0, 0.0, 0.0] for _ in inputs]
                    return route.fulfill(status=200, content_type='application/json', body=json.dumps({'embeddings': vectors}))
                if url.endswith('/api/chat'):
                    data = route.request.post_data_json or {}
                    messages = data.get('messages') or []
                    joined = '\n'.join(str(x.get('content', '')) for x in messages if isinstance(x, dict))
                    sourced = 'Retrieved source evidence:' in joined
                    answer = 'Source mock answer [S1].' if sourced else 'General mock answer without sources.'
                    body = (
                        json.dumps({'message': {'content': answer}, 'done': False}) + '\n' +
                        json.dumps({'done': True, 'eval_count': 4, 'eval_duration': 1_000_000_000}) + '\n'
                    )
                    return route.fulfill(status=200, content_type='application/x-ndjson', body=body)
                return route.fulfill(status=404, body='not found')

            page.route('http://127.0.0.1:11434/**', ollama)
            console_errors = []
            page.on('console', lambda msg: console_errors.append(msg.text) if msg.type == 'error' and 'ERR_FAILED' not in msg.text else None)
            page.on('dialog', lambda d: d.accept())

            page.goto(f'http://127.0.0.1:{PORT}/', wait_until='domcontentloaded')
            page.wait_for_selector('#newNotebookBtn')
            assert 'NotebookLM+' in page.title()

            # Configure AI first and prove both model controls are selectable.
            page.click(".tab[data-tab='ollama']")
            page.click('#testOllamaBtn')
            page.wait_for_function("document.querySelector('#chatModelSelect option[value=\"mock-chat\"]') !== null")
            page.select_option('#chatModelSelect', 'mock-chat')
            page.select_option('#embeddingModelSelect', 'embeddinggemma')
            assert page.input_value('#chatModelSelect') == 'mock-chat'
            assert page.input_value('#embeddingModelSelect') == 'embeddinggemma'
            page.click('#saveOllamaBtn')

            # Create an empty notebook and prove normal AI chat works with zero sources.
            page.click(".tab[data-tab='workspace']")
            page.click('#newNotebookBtn')
            page.fill('#notebookNameInput', 'E2E Notebook')
            page.fill('#notebookDescriptionInput', 'Browser QA')
            page.click('#saveNotebookDialogBtn')
            page.wait_for_function("document.querySelector('#activeNotebookTitle').textContent === 'E2E Notebook'")
            assert 'Link a file or folder' in page.locator('#sourceList').inner_text()

            page.fill('#promptInput', 'Hello without any sources')
            page.press('#promptInput', 'Enter')
            page.wait_for_function("document.querySelector('#chatMessages').innerText.includes('General mock answer without sources')")
            assert 'General mock answer without sources' in page.locator('#chatMessages').inner_text()

            # Add files opens a native chooser, indexes TXT, and surfaces a Ready/chunk state.
            with page.expect_file_chooser() as fc_info:
                page.click('#addFilesBtn')
            fc_info.value.set_files(str(single))
            page.wait_for_function("document.querySelector('#sourceList').innerText.includes('Ready') && /[1-9][0-9]* chunk/.test(document.querySelector('#sourceList').innerText)")
            source_text = page.locator('#sourceList').inner_text()
            assert 'Ready' in source_text and '0 chunk(s)' not in source_text

            # Source-backed chat now uses notebook evidence and citations.
            page.fill('#promptInput', 'What is the Project Alpha milestone?')
            page.press('#promptInput', 'Enter')
            page.wait_for_function("document.querySelector('#chatMessages').innerText.includes('Source mock answer')")
            assert 'Source mock answer' in page.locator('#chatMessages').inner_text()

            # Shift+Enter inserts newline and does not send.
            before = page.locator('.message.user').count()
            page.fill('#promptInput', 'line one')
            page.press('#promptInput', 'Shift+Enter')
            assert '\n' in page.input_value('#promptInput')
            assert page.locator('.message.user').count() == before

            # Add folder indexes multiple local files.
            with page.expect_file_chooser() as fc2_info:
                page.click('#addFolderBtn')
            fc2_info.value.set_files(str(folder))
            page.wait_for_function("document.querySelector('#sourceList').innerText.includes('2 indexed file(s)')")

            # Malformed backup import must not erase the current notebook.
            page.set_input_files('#importBackupInput', str(bad_backup))
            page.wait_for_timeout(250)
            assert page.locator('#activeNotebookTitle').inner_text() == 'E2E Notebook'

            # IndexedDB persistence across reload.
            page.reload(wait_until='domcontentloaded')
            page.wait_for_function("document.querySelector('#activeNotebookTitle').textContent === 'E2E Notebook'")
            assert 'General mock answer without sources' in page.locator('#chatMessages').inner_text()
            assert 'Source mock answer' in page.locator('#chatMessages').inner_text()

            # Service worker registration should succeed on localhost/HTTPS-equivalent secure context.
            sw_count = page.evaluate("navigator.serviceWorker ? navigator.serviceWorker.getRegistrations().then(r=>r.length) : Promise.resolve(0)")
            assert sw_count >= 1

            serious = [e for e in console_errors if 'cdn.jsdelivr' not in e and 'cdn.sheetjs' not in e and 'cdnjs.cloudflare' not in e]
            assert not serious, serious
            browser.close()
        print('browser_e2e: PASS')
    finally:
        server.terminate()
        try:
            server.wait(timeout=3)
        except subprocess.TimeoutExpired:
            server.kill()


if __name__ == '__main__':
    main()
