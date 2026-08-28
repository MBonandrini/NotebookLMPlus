import test from 'node:test';
import assert from 'node:assert/strict';
import { cosineSimilarity, keywordScore, rankChunks, buildContext } from '../js/retrieval.js';
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
