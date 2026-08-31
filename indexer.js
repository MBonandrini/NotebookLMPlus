import { parseFile } from './parsers.js';
import { chunkSections } from './chunking.js';
import { bulkPut, deleteByIndex, getAllByIndex, put } from './db.js';
import { embedAiTexts } from './ai.js';
import { extensionOf, nowIso, uuid } from './utils.js';
import { SUPPORTED_EXTENSIONS } from './config.js';

export async function indexFileEntries({ source, entries, settings, mode, onProgress=()=>{} }) {
  const safeEntries = Array.isArray(entries) ? entries : [];
  const existingDocs = await getAllByIndex('documents', 'sourceId', source.id);
  const existingByPath = new Map(existingDocs.map(d => [d.relativePath, d]));
  const seen = new Set();
  const warnings = [];
  const progress = new Array(safeEntries.length).fill(0);
  let progressSum = 0;
  const maxBytes = Math.max(1, Number(settings?.retrieval?.maxFileSizeMB) || 256) * 1024 * 1024;
  let processed = 0;
  let skipped = 0;
  let failed = 0;
  let chunksCreated = 0;
  let nextIndex = 0;

  const report = (idx, fraction, label, detail) => {
    if (idx >= 0 && idx < progress.length) {
      const next = Math.max(progress[idx], Math.max(0, Math.min(1, Number(fraction) || 0)));
      progressSum += next - progress[idx];
      progress[idx] = next;
    }
    const aggregate = progress.length ? progressSum / progress.length * 100 : 100;
    onProgress(aggregate, label, detail);
  };

  async function processEntry(idx) {
    const item = safeEntries[idx] || {};
    const file = item.file;
    const relativePath = item.relativePath || file?.name || `file-${idx + 1}`;
    if (!file?.name) {
      failed++;
      warnings.push(`${relativePath}: invalid file entry.`);
      report(idx, 1, `Skipping ${idx + 1} / ${safeEntries.length}`, relativePath);
      return;
    }

    const ext = extensionOf(file.name);
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      skipped++;
      report(idx, 1, `Skipping unsupported file`, relativePath);
      return;
    }
    seen.add(relativePath);

    if (Number(file.size) > maxBytes) {
      skipped++;
      const limitMb = Math.round(maxBytes / 1024 / 1024);
      warnings.push(`${file.name}: skipped because it exceeds the ${limitMb} MB browser safety limit.`);
      report(idx, 1, `Skipping oversized file`, relativePath);
      return;
    }

    const signature = `${file.size}:${file.lastModified}`;
    const previous = existingByPath.get(relativePath);
    report(idx, 0.02, `Indexing ${idx + 1} / ${safeEntries.length}`, relativePath);

    if (previous?.signature === signature && previous.status === 'ready') {
      skipped++;
      report(idx, 1, `Unchanged ${idx + 1} / ${safeEntries.length}`, relativePath);
      return;
    }

    const documentId = previous?.id || uuid();
    try {
      const sections = await parseFile(file, (fraction, detail) => {
        report(idx, Math.min(0.55, Math.max(0.03, Number(fraction) * 0.55)), `Parsing ${file.name}`, detail);
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
            const completed = Math.min(chunks.length, b + batch.length);
            report(idx, 0.55 + 0.35 * (completed / chunks.length), `Embedding ${file.name}`, `${completed} / ${chunks.length} chunks`);
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
      report(idx, 1, `Indexed ${idx + 1} / ${safeEntries.length}`, relativePath);
    } catch (err) {
      failed++;
      warnings.push(`${file.name}: ${err?.message || String(err)}`);
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
        error: err?.message || String(err),
        indexedAt: nowIso(),
        chunkCount: 0,
      });
      report(idx, 1, `Failed ${idx + 1} / ${safeEntries.length}`, relativePath);
    }
  }

  async function worker() {
    while (true) {
      const idx = nextIndex++;
      if (idx >= safeEntries.length) return;
      await processEntry(idx);
    }
  }

  // Make the performance profile real: weak machines use one worker while
  // stronger modes can parse/embed independent files concurrently. Keep the
  // bound conservative to avoid flooding IndexedDB or the AI endpoint.
  const requestedWorkers = Math.max(1, Math.round(Number(mode.workerCount) || 1));
  const workerCount = Math.min(requestedWorkers, 8, Math.max(1, safeEntries.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

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

  onProgress(100, 'Index complete', `${processed} changed • ${skipped} unchanged/skipped • ${failed} failed`);
  return { processed, skipped, failed, chunksCreated, warnings };
}
