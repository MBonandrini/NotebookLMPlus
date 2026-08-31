import { escapeHtml } from './utils.js';

export function renderMarkdown(input='') {
  let text = escapeHtml(input);
  const codeBlocks = [];
  text = text.replace(/```([\w-]*)\n([\s\S]*?)```/g, (_,lang,code) => {
    const token = `@@CODE${codeBlocks.length}@@`;
    codeBlocks.push(`<pre><code data-lang="${lang || ''}">${code}</code></pre>`);
    return token;
  });
  text = text
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[S(\d+)\]/g, '<strong>[S$1]</strong>');

  const lines = text.split('\n');
  const out = [];
  let inUl = false, inOl = false;
  const closeLists = () => { if (inUl) { out.push('</ul>'); inUl=false; } if (inOl) { out.push('</ol>'); inOl=false; } };
  for (const line of lines) {
    if (/^@@CODE\d+@@$/.test(line.trim())) { closeLists(); out.push(line.trim()); continue; }
    const ul = line.match(/^[-*] (.+)$/);
    const ol = line.match(/^\d+\. (.+)$/);
    if (ul) { if (inOl) { out.push('</ol>'); inOl=false; } if (!inUl) { out.push('<ul>'); inUl=true; } out.push(`<li>${ul[1]}</li>`); continue; }
    if (ol) { if (inUl) { out.push('</ul>'); inUl=false; } if (!inOl) { out.push('<ol>'); inOl=true; } out.push(`<li>${ol[1]}</li>`); continue; }
    closeLists();
    if (!line.trim()) { out.push(''); continue; }
    if (/^<h[1-3]>/.test(line)) out.push(line);
    else out.push(`<p>${line}</p>`);
  }
  closeLists();
  let html = out.join('\n');
  codeBlocks.forEach((block, i) => { html = html.replace(`@@CODE${i}@@`, block); });
  return html;
}
