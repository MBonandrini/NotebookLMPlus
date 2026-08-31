export function normalizedRelativeParts(src, relativePath, fileName='') {
  let parts = String(relativePath || fileName || '').replace(/\\/g, '/').split('/').filter(Boolean);
  if (src?.type === 'folder' && parts.length && String(parts[0]).toLowerCase() === String(src.name || '').toLowerCase()) {
    parts = parts.slice(1);
  }
  if (!parts.length && fileName) parts = [String(fileName)];
  return parts;
}

export function buildSourceTree(src, docs=[]) {
  const root = { folders: new Map(), files: [] };
  for (const doc of docs || []) {
    const parts = normalizedRelativeParts(src, doc.relativePath, doc.fileName);
    const filePart = parts.pop() || doc.fileName || 'Unnamed file';
    let node = root;
    const path = [];
    for (const part of parts) {
      path.push(part);
      if (!node.folders.has(part)) {
        node.folders.set(part, { name: part, path: path.join('/'), folders: new Map(), files: [] });
      }
      node = node.folders.get(part);
    }
    node.files.push({ ...doc, _treeName: filePart });
  }
  return root;
}

export function flattenTreeDocs(node) {
  const out = [...(node?.files || [])];
  for (const child of (node?.folders || new Map()).values()) out.push(...flattenTreeDocs(child));
  return out;
}

export function documentsInFolder(src, docs, folderPath='') {
  const prefix = String(folderPath || '').replace(/\\/g,'/').replace(/^\/+|\/+$/g,'');
  return (docs || []).filter(doc => {
    const parts = normalizedRelativeParts(src, doc.relativePath, doc.fileName);
    const docFolder = parts.slice(0,-1).join('/');
    return !prefix || docFolder === prefix || docFolder.startsWith(`${prefix}/`);
  });
}
