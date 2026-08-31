import { parseNdjsonLines } from './utils.js';

function cleanEndpoint(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '').replace(/\/api$/, '');
}

function isLoopback(endpoint) {
  try {
    const u = new URL(cleanEndpoint(endpoint));
    return ['localhost','127.0.0.1','[::1]','::1'].includes(u.hostname);
  } catch { return false; }
}

function buildRequest(url, init, endpoint) {
  const opts = { ...init, mode: 'cors' };
  // 2026 Local Network Access API. Unknown dictionary members are ignored by older browsers.
  if (isLoopback(endpoint)) opts.targetAddressSpace = 'loopback';
  return new Request(url, opts);
}

async function fetchWithTimeout(endpoint, path, init={}, timeoutSeconds=120) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out','TimeoutError')), timeoutSeconds * 1000);
  try {
    const base = cleanEndpoint(endpoint);
    const req = buildRequest(`${base}/api/${path.replace(/^\//,'')}`, { ...init, signal: controller.signal }, endpoint);
    return await fetch(req);
  } finally {
    clearTimeout(timeout);
  }
}

export async function getVersion(endpoint, timeoutSeconds=8) {
  const res = await fetchWithTimeout(endpoint, 'version', {}, timeoutSeconds);
  if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
  return res.json();
}

export async function listModels(endpoint, timeoutSeconds=12) {
  const res = await fetchWithTimeout(endpoint, 'tags', {}, timeoutSeconds);
  if (!res.ok) throw new Error(`Ollama returned HTTP ${res.status}`);
  const data = await res.json();
  return (data.models || []).map(m => ({ name: m.name || m.model, size: m.size, modifiedAt: m.modified_at, details: m.details || {} }));
}

export async function embedTexts({ endpoint, model, texts, timeoutSeconds=120, keepAlive='5m' }) {
  if (!model) throw new Error('No embedding model selected.');
  if (!texts?.length) return [];
  const res = await fetchWithTimeout(endpoint, 'embed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts, keep_alive: keepAlive }),
  }, timeoutSeconds);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Embedding request failed (${res.status}). ${body.slice(0,240)}`);
  }
  const data = await res.json();
  return data.embeddings || [];
}

export async function streamChat({ endpoint, model, messages, options={}, timeoutSeconds=120, firstResponseTimeoutSeconds=timeoutSeconds, inactivityTimeoutSeconds=timeoutSeconds, keepAlive='5m', signal=null, onToken=()=>{}, onStats=()=>{} }) {
  if (!model) throw new Error('No chat model selected.');
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(signal?.reason || new DOMException('Generation cancelled', 'AbortError'));
  if (signal?.aborted) abortFromExternal();
  else signal?.addEventListener?.('abort', abortFromExternal, { once: true });
  let timeout;
  const armTimeout = (seconds, message='Request timed out') => {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(new DOMException(message,'TimeoutError')), Math.max(0.01, Number(seconds) || timeoutSeconds) * 1000);
  };
  armTimeout(firstResponseTimeoutSeconds, 'Model load / first response timed out');
  try {
    const base = cleanEndpoint(endpoint);
    const req = buildRequest(`${base}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: true, keep_alive: keepAlive, options }),
      signal: controller.signal,
    }, endpoint);
    const res = await fetch(req);
    armTimeout(inactivityTimeoutSeconds, 'Streaming response stalled');
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Chat request failed (${res.status}). ${body.slice(0,260)}`);
    }
    if (!res.body) throw new Error('Streaming response body unavailable.');
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let rest = '';
    let full = '';
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      armTimeout(inactivityTimeoutSeconds, 'Streaming response stalled');
      rest += decoder.decode(value, { stream: true });
      rest = parseNdjsonLines(rest, obj => {
        const token = obj.message?.content || '';
        if (token) { full += token; onToken(token, full); }
        if (obj.done) onStats(obj);
      }, error => console.warn('Ignoring malformed Ollama stream line', error));
    }
    if (rest.trim()) {
      try {
        const obj = JSON.parse(rest);
        const token = obj.message?.content || '';
        if (token) { full += token; onToken(token, full); }
        if (obj.done) onStats(obj);
      } catch { /* ignore incomplete trailing data */ }
    }
    return full;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abortFromExternal);
  }
}

export function explainConnectionError(error, endpoint) {
  const msg = String(error?.message || error || 'Unknown error');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return `Could not reach ${endpoint}. Check that Ollama is running, that OLLAMA_ORIGINS includes this site's origin (${location.origin}), and approve any browser local-network/loopback permission prompt.`;
  }
  if (/first response|model load/i.test(msg)) return `Ollama is reachable, but ${endpoint} did not produce a first response before the model-load timeout. On a CPU-only machine, use CPU / No GPU mode, a smaller model, or increase the first-response timeout.`;
  if (/streaming response stalled/i.test(msg)) return `Ollama started responding but then stopped sending data before the inactivity timeout. Increase the streaming inactivity timeout if your CPU is heavily loaded.`;
  if (/timed out|Timeout/i.test(msg)) return `Connection to ${endpoint} timed out.`;
  return msg;
}
