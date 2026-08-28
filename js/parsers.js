import { extensionOf, normalizeText } from './utils.js';

let pdfjsPromise;
async function pdfjs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs').then(mod => {
      mod.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
      return mod;
    });
  }
  return pdfjsPromise;
}

function section(text, locator='', meta={}) {
  return { text: normalizeText(text), locator, meta };
}

async function parsePdf(file, onProgress) {
  const lib = await pdfjs();
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await lib.getDocument({ data: bytes }).promise;
  const sections = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo++) {
    onProgress?.(pageNo / doc.numPages, `PDF page ${pageNo} of ${doc.numPages}`);
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const text = content.items.map(i => i.str).join(' ');
    if (text.trim()) sections.push(section(text, `Page ${pageNo}`, { page: pageNo }));
  }
  return sections;
}

async function parseDocx(file) {
  if (!window.mammoth) throw new Error('Mammoth DOCX parser failed to load.');
  const buffer = await file.arrayBuffer();
  const result = await window.mammoth.convertToHtml({ arrayBuffer: buffer }, {
    includeDefaultStyleMap: true,
  });
  const doc = new DOMParser().parseFromString(result.value, 'text/html');
  const sections = [];
  let currentHeading = 'Document';
  let bucket = [];
  const flush = () => {
    const text = normalizeText(bucket.join('\n'));
    if (text) sections.push(section(text, currentHeading, { heading: currentHeading }));
    bucket = [];
  };
  for (const el of doc.body.children) {
    if (/^H[1-6]$/.test(el.tagName)) {
      flush();
      currentHeading = normalizeText(el.textContent) || currentHeading;
    } else if (el.tagName === 'TABLE') {
      const rows = [...el.querySelectorAll('tr')].map(row => [...row.children].map(c => normalizeText(c.textContent)).join(' | '));
      bucket.push(rows.join('\n'));
    } else {
      bucket.push(el.textContent || '');
    }
  }
  flush();
  if (!sections.length) sections.push(section(doc.body.textContent || '', 'Document'));
  return sections;
}

function colName(n) {
  let s = '';
  while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); }
  return s || 'A';
}

async function parseWorkbook(file) {
  if (!window.XLSX) throw new Error('SheetJS parser failed to load.');
  const buffer = await file.arrayBuffer();
  const wb = window.XLSX.read(buffer, { type: 'array', cellDates: true, cellText: true });
  const sections = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const range = window.XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
    const rows = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false });
    const blockSize = 40;
    for (let start = 0; start < rows.length; start += blockSize) {
      const slice = rows.slice(start, start + blockSize);
      const end = Math.min(rows.length, start + blockSize);
      const text = slice.map((row, idx) => {
        const rowNo = start + idx + 1;
        const cells = row.map((value, c) => value === '' ? '' : `${colName(c + 1)}${rowNo}: ${value}`).filter(Boolean);
        return cells.join(' | ');
      }).filter(Boolean).join('\n');
      if (!text.trim()) continue;
      const endCol = colName(range.e.c + 1);
      const cellRange = `A${start + 1}:${endCol}${end}`;
      sections.push(section(text, `${sheetName} • ${cellRange}`, { sheet: sheetName, range: cellRange, startRow: start + 1, endRow: end }));
    }
  }
  return sections;
}

function slideNumber(path) {
  const m = path.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

async function parsePptx(file) {
  if (!window.JSZip) throw new Error('JSZip parser failed to load.');
  const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
  const slidePaths = Object.keys(zip.files).filter(p => /^ppt\/slides\/slide\d+\.xml$/.test(p)).sort((a,b) => slideNumber(a) - slideNumber(b));
  const sections = [];
  for (const path of slidePaths) {
    const n = slideNumber(path);
    const xml = await zip.file(path).async('text');
    const dom = new DOMParser().parseFromString(xml, 'application/xml');
    const texts = [...dom.getElementsByTagNameNS('*','t')].map(n => n.textContent).filter(Boolean);
    let notesText = '';
    const notePath = `ppt/notesSlides/notesSlide${n}.xml`;
    if (zip.file(notePath)) {
      const nxml = await zip.file(notePath).async('text');
      const ndom = new DOMParser().parseFromString(nxml, 'application/xml');
      notesText = [...ndom.getElementsByTagNameNS('*','t')].map(x => x.textContent).filter(Boolean).join(' ');
    }
    const combined = `${texts.join('\n')}${notesText ? `\nSpeaker notes: ${notesText}` : ''}`;
    if (combined.trim()) sections.push(section(combined, `Slide ${n}`, { slide: n }));
  }
  return sections;
}

async function parseCsvLike(file, separator=',') {
  const text = await file.text();
  const lines = text.split(/\r?\n/);
  const sections = [];
  const block = 80;
  for (let i = 0; i < lines.length; i += block) {
    const chunk = lines.slice(i, i + block).join('\n');
    if (chunk.trim()) sections.push(section(chunk, `Rows ${i + 1}-${Math.min(lines.length, i + block)}`, { startRow: i + 1, endRow: Math.min(lines.length, i + block), separator }));
  }
  return sections;
}

async function parseHtml(file) {
  const html = await file.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript').forEach(n => n.remove());
  return [section(doc.body?.innerText || doc.body?.textContent || '', 'Document')];
}

async function parseText(file) {
  return [section(await file.text(), 'Document')];
}

export async function parseFile(file, onProgress) {
  const ext = extensionOf(file.name);
  switch (ext) {
    case 'pdf': return parsePdf(file, onProgress);
    case 'docx': return parseDocx(file);
    case 'xlsx': case 'xls': return parseWorkbook(file);
    case 'pptx': return parsePptx(file);
    case 'csv': return parseCsvLike(file, ',');
    case 'tsv': return parseCsvLike(file, '\t');
    case 'html': case 'htm': return parseHtml(file);
    case 'txt': case 'md': case 'markdown': case 'json': case 'xml': case 'yaml': case 'yml': case 'log': return parseText(file);
    default: throw new Error(`Unsupported file type: .${ext || '(none)'}`);
  }
}
