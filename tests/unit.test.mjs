import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, keywordScore, rankChunks, buildContext, trimConversationHistory } from '../js/retrieval.js';
import { estimateTokens } from '../js/chunking.js';
import { DEFAULT_MODES, mergeSettings } from '../js/config.js';

test('all seven performance and AI modes are present', () => {
  assert.deepEqual(Object.keys(DEFAULT_MODES), ['lightweight','local','balanced','power','remote','hosted','custom']);
  assert.equal(DEFAULT_MODES.lightweight.contextTokens, 4096);
  assert.equal(DEFAULT_MODES.power.contextTokens, 32768);
});

test('mergeSettings preserves defaults and overrides values', () => {
  const s = mergeSettings({ currentMode: 'lightweight', ollama: { requestTimeoutSeconds: 42 } });
  assert.equal(s.currentMode, 'lightweight');
  assert.equal(s.ollama.requestTimeoutSeconds, 42);
  assert.equal(s.retrieval.chunkSize, 3200);
  assert.equal(s.modes.remote.label, 'Remote Ollama');
  assert.equal(s.modes.hosted.provider, 'openai-compatible');
});

test('cosine similarity handles identical and orthogonal vectors', () => {
  assert.ok(Math.abs(cosineSimilarity([1,2],[1,2]) - 1) < 1e-10);
  assert.equal(cosineSimilarity([1,0],[0,1]), 0);
});

test('keyword scoring rewards exact identifiers and phrases', () => {
  const a = keywordScore('DUB-MEP-10340', 'Activity DUB-MEP-10340 is forecast to finish Monday.');
  const b = keywordScore('DUB-MEP-10340', 'A completely unrelated paragraph.');
  assert.ok(a > b);
  assert.ok(a > 0.5);
});

test('hybrid rank returns best evidence first', () => {
  const chunks = [
    { id:'1', documentId:'d1', text:'Clause 14.2 requires ten days notice', textLower:'clause 14.2 requires ten days notice', embedding:[1,0] },
    { id:'2', documentId:'d2', text:'Weather forecast and lunch menu', textLower:'weather forecast and lunch menu', embedding:[0,1] },
  ];
  const out = rankChunks({ chunks, query:'Clause 14.2 notice', queryEmbedding:[1,0], topK:2, useSemantic:true, useKeyword:true });
  assert.equal(out[0].id, '1');
});

test('context builder respects budget and creates S citations', () => {
  const results = [
    { fileName:'Contract.pdf', locator:'Page 2', text:'A'.repeat(600), sourceId:'s', documentId:'d', _score:1 },
    { fileName:'Report.docx', locator:'Section 1', text:'B'.repeat(600), sourceId:'s2', documentId:'d2', _score:.9 },
  ];
  const ctx = buildContext(results, 200);
  assert.ok(ctx.entries.length >= 1);
  assert.equal(ctx.entries[0].id, 'S1');
  assert.match(ctx.text, /Contract\.pdf/);
});

test('token estimator is deterministic', () => {
  assert.equal(estimateTokens('12345678'), 2);
});

test('mergeSettings clamps corrupted or out-of-range persisted values', () => {
  const s = mergeSettings({
    currentMode: 'does-not-exist',
    ollama: { requestTimeoutSeconds: -100 },
    retrieval: { chunkSize: -1, chunkOverlap: 99999, minKeywordScore: 99 },
    modes: { balanced: { contextTokens: 'NaN', topK: 999, maxAnswerTokens: -2, embedBatch: 0, workerCount: 99, temperature: 88, provider: 'bogus' } }
  });
  assert.equal(s.currentMode, 'balanced');
  assert.equal(s.ollama.requestTimeoutSeconds, 5);
  assert.equal(s.retrieval.chunkSize, 500);
  assert.equal(s.retrieval.chunkOverlap, 499);
  assert.equal(s.retrieval.minKeywordScore, 1);
  assert.equal(s.modes.balanced.contextTokens, DEFAULT_MODES.balanced.contextTokens);
  assert.equal(s.modes.balanced.topK, 50);
  assert.equal(s.modes.balanced.maxAnswerTokens, 128);
  assert.equal(s.modes.balanced.embedBatch, 1);
  assert.equal(s.modes.balanced.workerCount, 8);
  assert.equal(s.modes.balanced.temperature, 2);
  assert.equal(s.modes.balanced.provider, 'ollama');
});

test('semantic ranking ignores embeddings created by another embedding model', () => {
  const chunks = [
    { id:'wrong-model', documentId:'d1', text:'irrelevant', textLower:'irrelevant', embedding:[1,0], embeddingModel:'old-model' },
    { id:'right-model', documentId:'d2', text:'target phrase', textLower:'target phrase', embedding:[0,1], embeddingModel:'new-model' },
  ];
  const out = rankChunks({ chunks, query:'target phrase', queryEmbedding:[1,0], queryEmbeddingModel:'new-model', topK:2, useSemantic:true, useKeyword:true });
  assert.equal(out[0].id, 'right-model');
  assert.equal(out.find(x=>x.id==='wrong-model')?._semantic || 0, 0);
});


test('history trimming keeps newest messages inside token budget', () => {
  const rows = [
    {role:'user',content:'A'.repeat(1000)},
    {role:'assistant',content:'B'.repeat(1000)},
    {role:'user',content:'C'.repeat(200)},
  ];
  const out = trimConversationHistory(rows, 100);
  assert.ok(out.estimatedTokens <= 100);
  assert.equal(out.messages.at(-1).role, 'user');
  assert.ok(out.messages.at(-1).content.endsWith('C'.repeat(50)));
});

test('chunking always terminates and respects sane bounds under extreme overlap', async () => {
  const { chunkSections } = await import('../js/chunking.js');
  const chunks = chunkSections({sections:[{text:'x '.repeat(10000)}],documentId:'d',notebookId:'n',sourceId:'s',fileName:'x.txt',chunkSize:500,overlap:499});
  assert.ok(chunks.length > 1);
  assert.ok(chunks.length < 1000);
  assert.ok(chunks.every(c => c.text.length <= 500));
});

test('Excel parser preserves non-A1 used-range coordinates in citations', async () => {
  const previousWindow = globalThis.window;
  globalThis.window = {
    XLSX: {
      read: () => ({ SheetNames: ['Data'], Sheets: { Data: { '!ref': 'C5:F6' } } }),
      utils: {
        decode_range: () => ({ s: { r: 4, c: 2 }, e: { r: 5, c: 5 } }),
        sheet_to_json: () => [['Alpha','Beta','',''], ['Gamma','Delta','','']],
      },
    },
  };
  try {
    const { parseFile } = await import('../js/parsers.js');
    const fakeFile = { name:'range.xlsx', arrayBuffer: async () => new ArrayBuffer(1) };
    const sections = await parseFile(fakeFile);
    assert.equal(sections.length, 1);
    assert.equal(sections[0].locator, 'Data • C5:F6');
    assert.match(sections[0].text, /C5: Alpha/);
    assert.match(sections[0].text, /D6: Delta/);
  } finally {
    globalThis.window = previousWindow;
  }
});

test('PPTX relationship targets resolve relative paths safely', async () => {
  const { resolveZipTarget } = await import('../js/parsers.js');
  assert.equal(resolveZipTarget('ppt/slides/slide1.xml', '../notesSlides/notesSlide3.xml'), 'ppt/notesSlides/notesSlide3.xml');
  assert.equal(resolveZipTarget('ppt/slides/slide1.xml', './media/image1.png'), 'ppt/slides/media/image1.png');
  assert.equal(resolveZipTarget('slide.xml', '../../../../evil.xml'), 'evil.xml');
});

test('backup validation rejects malicious message roles and malformed records before import', async () => {
  const { validateImportPayload } = await import('../js/db.js');
  assert.throws(() => validateImportPayload({schema:3,stores:{messages:[{id:'m1',role:'\" onclick=alert(1) x=\"',content:'x'}]}}), /message role/);
  assert.throws(() => validateImportPayload({schema:3,stores:{messages:[{id:'m1',role:'user',content:{bad:true}}]}}), /message content/);
  assert.throws(() => validateImportPayload({schema:999,stores:{}}), /newer than/);
  assert.doesNotThrow(() => validateImportPayload({schema:3,stores:{messages:[{id:'m1',role:'user',content:'safe'}]}}));
});

test('context builder never exceeds a small hard token budget', () => {
  const results = [{fileName:'Huge.pdf',locator:'Page 1',text:'Z'.repeat(50000),documentId:'d',sourceId:'s'}];
  const ctx = buildContext(results, 100);
  assert.ok(ctx.entries.length <= 1);
  assert.ok(ctx.estimatedTokens <= 100);
  assert.ok(ctx.text.length <= 400);
});

test('hosted API token stays in module memory and can be cleared', async () => {
  const { setSessionApiKey, getSessionApiKey } = await import('../js/ai.js');
  setSessionApiKey('secret-test-token');
  assert.equal(getSessionApiKey(), 'secret-test-token');
  setSessionApiKey('');
  assert.equal(getSessionApiKey(), '');
});

test('markdown renderer escapes active HTML from model or imported content', async () => {
  const { renderMarkdown } = await import('../js/markdown.js');
  const html = renderMarkdown('<script>alert(1)</script> **safe** <img src=x onerror=alert(2)>');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img '));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<strong>safe<\/strong>/);
});

test('randomized settings and chunking inputs remain bounded', async () => {
  const { chunkSections } = await import('../js/chunking.js');
  for (let i=0; i<250; i++) {
    const rawSize = Math.floor(Math.random()*40000)-10000;
    const rawOverlap = Math.floor(Math.random()*40000)-10000;
    const merged = mergeSettings({retrieval:{chunkSize:rawSize,chunkOverlap:rawOverlap},modes:{balanced:{topK:Math.random()*500-100}}});
    assert.ok(merged.retrieval.chunkSize >= 500 && merged.retrieval.chunkSize <= 12000);
    assert.ok(merged.retrieval.chunkOverlap >= 0 && merged.retrieval.chunkOverlap < merged.retrieval.chunkSize);
    assert.ok(merged.modes.balanced.topK >= 2 && merged.modes.balanced.topK <= 50);
    const text='abc def. '.repeat(500 + (i%50));
    const chunks=chunkSections({sections:[{text}],documentId:'d',notebookId:'n',sourceId:'s',fileName:'f.txt',chunkSize:merged.retrieval.chunkSize,overlap:merged.retrieval.chunkOverlap});
    assert.ok(chunks.length < 1000);
    assert.ok(chunks.every(c => c.text.length <= merged.retrieval.chunkSize));
  }
});
