import { parseFile } from './parsers.js';
import { chunkSections } from './chunking.js';
import { bulkPut, deleteByIndex, getAllByIndex, put } from './db.js';
import { embedAiTexts } from './ai.js';
import { extensionOf, nowIso, uuid } from './utils.js';
import { SUPPORTED_EXTENSIONS } from './config.js';

export async function indexFileEntries({ source, entries, settings, mode, onProgress=()=>{} }) {
  const existingDocs = await getAllByIndex('documents', 'sourceId', source.id);
  const existingByPath = new Map(existingDocs.map(d => [d.relativePath, d]));
  const seen = new Set();
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let chunksCreated = 0;
  const warnings = [];

  for (let idx = 0; idx < entries.length; idx++) {
    const { file, relativePath } = entries[idx];
    const ext = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.has(ext)) { skipped++; continue; }
    seen.add(relativePath);
    const signature = `${file.size}:${file.lastModified}`;
    const previous = existingByPath.get(relativePath);
    const basePct = (idx / Math.max(1, entries.length)) * 100;
    onProgress(basePct, `Indexing ${idx + 1} / ${entries.length}`, relativePath);

    if (previous?.signature === signature && previous.status === 'ready') {
      skipped++;
      continue;
    }

    const documentId = previous?.id || uuid();
    try {
      const sections = await parseFile(file, (fraction, detail) => {
        const pct = ((idx + Math.min(1, fraction)) / Math.max(1, entries.length)) * 100;
        onProgress(pct, `Parsing ${file.name}`, detail);
      });
      await deleteByIndex('chunks', 'documentId', documentId);
      let chunks = chunkSections({
        sections,
        documentId,
        notebookId: source.notebookId,
        sourceId: source.id,
        fileName: file.name,
        chunkSize: settings.retrieval.chunkSize,
        overlap: settings.retrieval.chunkOverlap,
      });

      const provider = mode.provider || 'ollama';
      const embedModel = mode.embeddingModel || (provider === 'ollama' ? settings.ollama.embeddingModel : '');
      const endpoint = mode.endpoint || (provider === 'ollama' ? settings.ollama.endpoint : '');
      if (mode.semanticSearch && embedModel && chunks.length) {
        try {
          const batchSize = Math.max(1, Number(mode.embedBatch) || 4);
          for (let b = 0; b < chunks.length; b += batchSize) {
            const batch = chunks.slice(b, b + batchSize);
            onProgress(basePct, `Embedding ${file.name}`, `${Math.min(chunks.length,b + batch.length)} / ${chunks.length} chunks`);
            const vectors = await embedAiTexts({
              provider, endpoint,
              model: embedModel,
              texts: batch.map(c => c.text),
              timeoutSeconds: settings.ollama.requestTimeoutSeconds,
              keepAlive: mode.keepAlive,
            });
            batch.forEach((chunk, i) => {
              chunk.embedding = vectors[i] || null;
              chunk.embeddingModel = vectors[i] ? embedModel : null;
            });
          }
        } catch (err) {
          warnings.push(`${file.name}: embeddings unavailable (${err.message}). Keyword search remains available.`);
          chunks = chunks.map(c => ({ ...c, embedding: null, embeddingModel: null }));
        }
      }

      await bulkPut('chunks', chunks);
      await put('documents', {
        id: documentId,
        sourceId: source.id,
        notebookId: source.notebookId,
        relativePath,
        pathKey: `${source.id}:${relativePath}`,
        fileName: file.name,
        extension: ext,
        size: file.size,
        lastModified: file.lastModified,
        signature,
        status: 'ready',
        indexedAt: nowIso(),
        chunkCount: chunks.length,
      });
      processed++;
      chunksCreated += chunks.length;
    } catch (err) {
      failed++;
      warnings.push(`${file.name}: ${err.message}`);
      await put('documents', {
        id: documentId,
        sourceId: source.id,
        notebookId: source.notebookId,
        relativePath,
        pathKey: `${source.id}:${relativePath}`,
        fileName: file.name,
        extension: ext,
        size: file.size,
        lastModified: file.lastModified,
        signature,
        status: 'error',
        error: err.message,
        indexedAt: nowIso(),
        chunkCount: 0,
      });
    }
  }

  // If this is a persistent source rescan, remove files that disappeared.
  if (source.persistentHandle) {
    for (const doc of existingDocs) {
      if (!seen.has(doc.relativePath)) {
        await deleteByIndex('chunks', 'documentId', doc.id);
        // Keep a tombstone document for auditability.
        await put('documents', { ...doc, status: 'missing', missingSince: nowIso(), chunkCount: 0 });
      }
    }
  }

  onProgress(100, 'Index complete', `${processed} changed • ${skipped} unchanged • ${failed} failed`);
  return { processed, skipped, failed, chunksCreated, warnings };
}
