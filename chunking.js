import { normalizeText, uuid } from './utils.js';

export function chunkSections({ sections, documentId, notebookId, sourceId, fileName, chunkSize=3200, overlap=400 }) {
  const chunks = [];
  for (const sec of sections) {
    const text = normalizeText(sec.text || '');
    if (!text) continue;
    if (text.length <= chunkSize) {
      chunks.push(makeChunk(text, sec, documentId, notebookId, sourceId, fileName, 0));
      continue;
    }
    let start = 0;
    let part = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + chunkSize);
      if (end < text.length) {
        const boundary = Math.max(text.lastIndexOf('\n', end), text.lastIndexOf('. ', end), text.lastIndexOf(' ', end));
        if (boundary > start + Math.floor(chunkSize * .55)) end = Math.min(end, boundary + 1);
      }
      const piece = text.slice(start, end).trim();
      if (piece) chunks.push(makeChunk(piece, sec, documentId, notebookId, sourceId, fileName, part++));
      if (end >= text.length) break;
      start = Math.max(start + 1, end - Math.min(overlap, Math.floor(chunkSize * .35)));
    }
  }
  return chunks;
}

function makeChunk(text, sec, documentId, notebookId, sourceId, fileName, part) {
  return {
    id: uuid(),
    documentId,
    notebookId,
    sourceId,
    fileName,
    locator: sec.locator || '',
    meta: sec.meta || {},
    part,
    text,
    textLower: text.toLowerCase(),
    embedding: null,
    embeddingModel: null,
  };
}

export function estimateTokens(text) {
  return Math.ceil(String(text || '').length / 4);
}
