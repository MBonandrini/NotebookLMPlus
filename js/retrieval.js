function tokenize(text='') {
  return String(text).toLowerCase().match(/[\p{L}\p{N}_./:#-]{2,}/gu) || [];
}

export function cosineSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return 0;
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] * a[i]; bb += b[i] * b[i]; }
  if (!aa || !bb) return 0;
  return dot / (Math.sqrt(aa) * Math.sqrt(bb));
}

export function keywordScore(query, text) {
  const q = tokenize(query);
  if (!q.length) return 0;
  const lower = String(text || '').toLowerCase();
  const unique = [...new Set(q)];
  let hits = 0;
  let phraseBonus = 0;
  for (const term of unique) {
    if (lower.includes(term)) hits += 1;
    if (term.length >= 5) {
      const count = lower.split(term).length - 1;
      phraseBonus += Math.min(count, 4) * .04;
    }
  }
  const exactPhrase = lower.includes(String(query).trim().toLowerCase()) ? .35 : 0;
  return Math.min(1, hits / unique.length + phraseBonus + exactPhrase);
}

export function rankChunks({ chunks, query, queryEmbedding=null, topK=10, useSemantic=true, useKeyword=true, minKeywordScore=0 }) {
  const ranked = chunks.map(chunk => {
    const keyword = useKeyword ? keywordScore(query, chunk.textLower || chunk.text) : 0;
    const semantic = useSemantic && queryEmbedding && chunk.embedding ? Math.max(0, cosineSimilarity(queryEmbedding, chunk.embedding)) : 0;
    let score;
    if (useSemantic && queryEmbedding && useKeyword) score = semantic * .68 + keyword * .32;
    else if (useSemantic && queryEmbedding) score = semantic;
    else score = keyword;
    return { ...chunk, _score: score, _keyword: keyword, _semantic: semantic };
  }).filter(x => x._score > 0 && (x._keyword >= minKeywordScore || x._semantic > 0));

  ranked.sort((a,b) => b._score - a._score);
  const selected = [];
  const perDoc = new Map();
  for (const item of ranked) {
    const count = perDoc.get(item.documentId) || 0;
    if (count >= Math.max(3, Math.ceil(topK * .45))) continue;
    selected.push(item);
    perDoc.set(item.documentId, count + 1);
    if (selected.length >= topK) break;
  }
  return selected;
}

export function buildContext(results, maxContextTokens=12000) {
  const entries = [];
  let estimated = 0;
  let i = 1;
  for (const r of results) {
    const header = `[S${i}] ${r.fileName}${r.locator ? ` — ${r.locator}` : ''}`;
    const block = `${header}\n${r.text}`;
    const tokens = Math.ceil(block.length / 4);
    if (entries.length && estimated + tokens > maxContextTokens) break;
    entries.push({ id: `S${i}`, header, text: r.text, result: r });
    estimated += tokens;
    i++;
  }
  return { entries, text: entries.map(e => `${e.header}\n${e.text}`).join('\n\n---\n\n'), estimatedTokens: estimated };
}
