const DB_NAME = 'notebooklmplus';
const DB_VERSION = 3;

const STORES = {
  settings: { keyPath: 'key' },
  notebooks: { keyPath: 'id' },
  templates: { keyPath: 'id' },
  conversations: { keyPath: 'id', indexes: [['notebookId','notebookId']] },
  messages: { keyPath: 'id', indexes: [['conversationId','conversationId'], ['notebookId','notebookId']] },
  sources: { keyPath: 'id', indexes: [['notebookId','notebookId']] },
  documents: { keyPath: 'id', indexes: [['sourceId','sourceId'], ['notebookId','notebookId'], ['pathKey','pathKey']] },
  chunks: { keyPath: 'id', indexes: [['documentId','documentId'], ['notebookId','notebookId'], ['sourceId','sourceId']] },
};

let dbPromise;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, config] of Object.entries(STORES)) {
        let store;
        if (!db.objectStoreNames.contains(name)) {
          store = db.createObjectStore(name, { keyPath: config.keyPath });
        } else {
          store = req.transaction.objectStore(name);
        }
        for (const [indexName, keyPath] of config.indexes || []) {
          if (!store.indexNames.contains(indexName)) store.createIndex(indexName, keyPath, { unique: false });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
  });
  return dbPromise;
}

export async function put(storeName, value) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).put(value);
  await txDone(tx);
  return value;
}

export async function bulkPut(storeName, values) {
  if (!values.length) return;
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  for (const value of values) store.put(value);
  await txDone(tx);
}

export async function get(storeName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).get(key));
}

export async function getAll(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).getAll());
}

export async function getAllByIndex(storeName, indexName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readonly');
  return requestToPromise(tx.objectStore(storeName).index(indexName).getAll(key));
}

export async function deleteKey(storeName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  tx.objectStore(storeName).delete(key);
  await txDone(tx);
}

export async function deleteByIndex(storeName, indexName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, 'readwrite');
  const store = tx.objectStore(storeName);
  const index = store.index(indexName);
  const req = index.openCursor(IDBKeyRange.only(key));
  await new Promise((resolve, reject) => {
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return resolve();
      cursor.delete();
      cursor.continue();
    };
  });
  await txDone(tx);
}

export async function getSetting(key) {
  const row = await get('settings', key);
  return row?.value;
}

export async function setSetting(key, value) {
  return put('settings', { key, value, updatedAt: new Date().toISOString() });
}

export async function clearAll() {
  const db = await openDb();
  const names = Array.from(db.objectStoreNames);
  const tx = db.transaction(names, 'readwrite');
  for (const name of names) tx.objectStore(name).clear();
  await txDone(tx);
}

export async function exportData() {
  const out = { schema: DB_VERSION, exportedAt: new Date().toISOString(), stores: {} };
  for (const name of Object.keys(STORES)) {
    out.stores[name] = await getAll(name);
  }
  // FileSystemHandle is structured-cloneable but not JSON serialisable. Remove handles from backups.
  out.stores.sources = (out.stores.sources || []).map(source => ({ ...source, handle: undefined, needsRelink: !!source.handle || source.needsRelink }));
  out.stores.templates = (out.stores.templates || []).map(template => ({
    ...template,
    sourceBlueprints: (template.sourceBlueprints || []).map(source => ({ ...source, handle: undefined, needsRelink: !!source.handle || source.needsRelink })),
  }));
  return out;
}

export function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object' || !payload.stores || typeof payload.stores !== 'object') {
    throw new Error('Invalid backup file: missing stores object.');
  }
  if (payload.schema != null && (!Number.isInteger(Number(payload.schema)) || Number(payload.schema) > DB_VERSION)) {
    throw new Error(`Backup schema ${payload.schema} is newer than this app supports (${DB_VERSION}).`);
  }
  for (const [name, rows] of Object.entries(payload.stores)) {
    if (!STORES[name]) continue;
    if (!Array.isArray(rows)) throw new Error(`Invalid backup file: store ${name} is not an array.`);
    const keyPath = STORES[name].keyPath;
    for (const row of rows) {
      if (!row || typeof row !== 'object' || row[keyPath] === undefined || row[keyPath] === null || row[keyPath] === '') {
        throw new Error(`Invalid backup file: store ${name} contains a row without ${keyPath}.`);
      }
      if (!['string', 'number'].includes(typeof row[keyPath])) {
        throw new Error(`Invalid backup file: store ${name} contains an invalid ${keyPath}.`);
      }
      if (name === 'messages' && !['user', 'assistant'].includes(row.role)) {
        throw new Error('Invalid backup file: message role must be user or assistant.');
      }
      if (name === 'messages' && typeof row.content !== 'string') {
        throw new Error('Invalid backup file: message content must be text.');
      }
    }
  }
}

async function snapshotAllStores() {
  const snapshot = {};
  for (const name of Object.keys(STORES)) snapshot[name] = await getAll(name);
  return snapshot;
}

async function restoreSnapshot(snapshot) {
  await clearAll();
  for (const [name, rows] of Object.entries(snapshot)) await bulkPut(name, rows || []);
}

export async function importData(payload) {
  validateImportPayload(payload);
  const before = await snapshotAllStores();
  try {
    await clearAll();
    for (const [name, rows] of Object.entries(payload.stores)) {
      if (!STORES[name]) continue;
      await bulkPut(name, rows);
    }
  } catch (error) {
    try { await restoreSnapshot(before); }
    catch (rollbackError) { console.error('Backup import rollback failed', rollbackError); }
    throw error;
  }
}
