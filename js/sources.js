import { deleteByIndex, deleteKey, getAllByIndex, put } from './db.js';
import { indexFileEntries } from './indexer.js';
import { nowIso, uuid } from './utils.js';

async function ensurePermission(handle) {
  if (!handle?.queryPermission) return true;
  let state = await handle.queryPermission({ mode: 'read' });
  if (state === 'granted') return true;
  if (handle.requestPermission) state = await handle.requestPermission({ mode: 'read' });
  return state === 'granted';
}

async function collectDirectory(handle, prefix='') {
  const out = [];
  for await (const entry of handle.values()) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.kind === 'file') out.push({ file: await entry.getFile(), relativePath: rel });
    else if (entry.kind === 'directory') out.push(...await collectDirectory(entry, rel));
  }
  return out;
}

export async function chooseFiles(notebookId) {
  if ('showOpenFilePicker' in window) {
    const handles = await window.showOpenFilePicker({ multiple: true, id: 'notebooklmplus-files' });
    return handles.map(handle => ({
      source: {
        id: uuid(), notebookId, type: 'file', name: handle.name,
        createdAt: nowIso(), updatedAt: nowIso(), handle,
        persistentHandle: true, needsRelink: false,
      },
      loader: async () => [{ file: await handle.getFile(), relativePath: handle.name }],
    }));
  }
  return null;
}

export async function chooseFolder(notebookId) {
  if ('showDirectoryPicker' in window) {
    const handle = await window.showDirectoryPicker({ id: 'notebooklmplus-folder', mode: 'read' });
    return {
      source: {
        id: uuid(), notebookId, type: 'folder', name: handle.name,
        createdAt: nowIso(), updatedAt: nowIso(), handle,
        persistentHandle: true, needsRelink: false,
      },
      loader: async () => collectDirectory(handle),
    };
  }
  return null;
}

export function fallbackSourceFromFiles(notebookId, files, type='files') {
  const array = [...files];
  const name = type === 'folder' && array[0]?.webkitRelativePath
    ? array[0].webkitRelativePath.split('/')[0]
    : type === 'folder' ? 'Selected folder' : `${array.length} selected file${array.length === 1 ? '' : 's'}`;
  const source = {
    id: uuid(), notebookId, type, name,
    createdAt: nowIso(), updatedAt: nowIso(),
    persistentHandle: false, needsRelink: true,
  };
  const entries = array.map(file => ({ file, relativePath: file.webkitRelativePath || file.name }));
  return { source, entries };
}

export async function saveAndIndexSource({ source, entries, settings, mode, onProgress }) {
  await put('sources', source);
  const result = await indexFileEntries({ source, entries, settings, mode, onProgress });
  await put('sources', { ...source, updatedAt: nowIso(), lastScanAt: nowIso(), lastResult: result });
  return result;
}

export async function rescanSource({ source, settings, mode, onProgress }) {
  if (!source.handle) throw new Error('This source cannot be rescanned automatically. Re-link it with Add files/folder.');
  if (!await ensurePermission(source.handle)) throw new Error('File/folder permission was not granted.');
  let entries;
  if (source.type === 'file') entries = [{ file: await source.handle.getFile(), relativePath: source.handle.name }];
  else entries = await collectDirectory(source.handle);
  return saveAndIndexSource({ source, entries, settings, mode, onProgress });
}

export async function rescanNotebookSources({ notebookId, settings, mode, onProgress }) {
  const sources = await getAllByIndex('sources', 'notebookId', notebookId);
  const results = [];
  for (let i = 0; i < sources.length; i++) {
    const source = sources[i];
    if (!source.handle) continue;
    onProgress((i / Math.max(1,sources.length)) * 100, `Scanning ${source.name}`, `${i + 1} / ${sources.length} sources`);
    try { results.push(await rescanSource({ source, settings, mode, onProgress })); }
    catch (err) { results.push({ failed: 1, warnings: [`${source.name}: ${err.message}`] }); }
  }
  return results;
}

export async function removeSource(sourceId) {
  await deleteByIndex('chunks', 'sourceId', sourceId);
  await deleteByIndex('documents', 'sourceId', sourceId);
  await deleteKey('sources', sourceId);
}
