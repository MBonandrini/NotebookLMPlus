import { embedTexts as ollamaEmbedTexts, getVersion as getOllamaVersion, listModels as listOllamaModels, streamChat as streamOllamaChat, explainConnectionError as explainOllamaError } from './ollama.js';

let sessionApiKey = '';

export function normalizeProvider(provider) {
  return provider === 'openai-compatible' ? 'openai-compatible' : 'ollama';
}

// Hosted credentials intentionally live only in this ES module's memory. They
// are never written to sessionStorage, localStorage, IndexedDB, service-worker
// caches, or backups. Reloading/closing the page clears the token.
export function getSessionApiKey() {
  return sessionApiKey;
}

export function setSessionApiKey(value) {
  sessionApiKey = typeof value === 'string' ? value : '';
}

function cleanBase(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function validateEmbeddings(vectors, expected) {
  if (!Array.isArray(vectors) || vectors.length !== expected) {
    throw new Error(`Embedding provider returned ${Array.isArray(vectors) ? vectors.length : 0} vector(s) for ${expected} input(s).`);
  }
  for (let i = 0; i < vectors.length; i++) {
    const vector = vectors[i];
    if (!Array.isArray(vector) || !vector.length || vector.some(v => !Number.isFinite(Number(v)))) {
      throw new Error(`Embedding provider returned an invalid vector at index ${i}.`);
    }
  }
  return vectors.map(v => v.map(Number));
}

function hostedUrl(endpoint, path) {
  const base = cleanBase(endpoint);
  if (!base) throw new Error('No hosted AI endpoint configured.');
  return `${base}/${String(path || '').replace(/^\/+/, '')}`;
}

async function fetchHosted(endpoint, path, init={}, timeoutSeconds=120, apiKey=getSessionApiKey()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), Math.max(1, Number(timeoutSeconds) || 120) * 1000);
  try {
    const headers = new Headers(init.headers || {});
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    return await fetch(hostedUrl(endpoint, path), { ...init, headers, mode: 'cors', signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

export async function testAiConnection({ provider='ollama', endpoint, timeoutSeconds=10, apiKey=getSessionApiKey() }) {
  provider = normalizeProvider(provider);
  if (provider === 'ollama') {
    const version = await getOllamaVersion(endpoint, timeoutSeconds);
    return { provider, ok: true, label: `Ollama ${version.version || 'online'}`, detail: version };
  }
  const res = await fetchHosted(endpoint, 'models', {}, timeoutSeconds, apiKey);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Hosted AI returned HTTP ${res.status}. ${body.slice(0, 240)}`);
  }
  const data = await res.json().catch(() => ({}));
  return { provider, ok: true, label: 'Hosted AI online', detail: data };
}

export async function listAiModels({ provider='ollama', endpoint, timeoutSeconds=12, apiKey=getSessionApiKey() }) {
  provider = normalizeProvider(provider);
  if (provider === 'ollama') return listOllamaModels(endpoint, timeoutSeconds);
  const res = await fetchHosted(endpoint, 'models', {}, timeoutSeconds, apiKey);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Model discovery failed (${res.status}). ${body.slice(0, 240)}`);
  }
  const data = await res.json();
  const rows = data.data || data.models || [];
  return rows.map(m => typeof m === 'string' ? { name: m } : ({ name: m.id || m.name || m.model, details: m })).filter(m => m.name);
}

export async function embedAiTexts({ provider='ollama', endpoint, apiKey=getSessionApiKey(), model, texts, timeoutSeconds=120, keepAlive='5m' }) {
  provider = normalizeProvider(provider);
  if (provider === 'ollama') {
    const vectors = await ollamaEmbedTexts({ endpoint, model, texts, timeoutSeconds, keepAlive });
    return validateEmbeddings(vectors, texts?.length || 0);
  }
  if (!model) throw new Error('No hosted embedding model selected.');
  if (!texts?.length) return [];
  const res = await fetchHosted(endpoint, 'embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts }),
  }, timeoutSeconds, apiKey);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Hosted embedding request failed (${res.status}). ${body.slice(0, 260)}`);
  }
  const data = await res.json();
  const vectors = (data.data || []).sort((a,b) => (a.index ?? 0) - (b.index ?? 0)).map(x => x.embedding || x.vector || null);
  return validateEmbeddings(vectors, texts.length);
}

function processSseBuffer(buffer, onEvent) {
  const events = buffer.split(/\r?\n\r?\n/);
  const rest = events.pop() || '';
  for (const event of events) {
    for (const line of event.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (data) onEvent(data);
    }
  }
  return rest;
}

export async function streamAiChat({ provider='ollama', endpoint, apiKey=getSessionApiKey(), model, messages, contextTokens=16384, maxAnswerTokens=1280, temperature=0.18, timeoutSeconds=120, firstResponseTimeoutSeconds=timeoutSeconds, inactivityTimeoutSeconds=timeoutSeconds, keepAlive='5m', signal=null, onToken=()=>{}, onStats=()=>{} }) {
  provider = normalizeProvider(provider);
  if (provider === 'ollama') {
    return streamOllamaChat({
      endpoint, model, messages, timeoutSeconds, firstResponseTimeoutSeconds, inactivityTimeoutSeconds, keepAlive, signal,
      options: { num_ctx: contextTokens, num_predict: maxAnswerTokens, temperature },
      onToken, onStats,
    });
  }

  if (!model) throw new Error('No hosted chat model selected.');
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(signal?.reason || new DOMException('Generation cancelled', 'AbortError'));
  if (signal?.aborted) abortFromExternal();
  else signal?.addEventListener?.('abort', abortFromExternal, { once: true });
  let timeout;
  const armTimeout = (seconds, message='Request timed out') => {
    clearTimeout(timeout);
    timeout = setTimeout(() => controller.abort(new DOMException(message, 'TimeoutError')), Math.max(0.01, Number(seconds) || timeoutSeconds) * 1000);
  };
  armTimeout(firstResponseTimeoutSeconds, 'Model load / first response timed out');
  try {
    const headers = new Headers({ 'Content-Type': 'application/json', 'Accept': 'text/event-stream, application/json' });
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    const res = await fetch(hostedUrl(endpoint, 'chat/completions'), {
      method: 'POST', mode: 'cors', headers, signal: controller.signal,
      body: JSON.stringify({ model, messages, stream: true, temperature, max_tokens: maxAnswerTokens }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Hosted chat request failed (${res.status}). ${body.slice(0, 260)}`);
    }
    armTimeout(inactivityTimeoutSeconds, 'Streaming response stalled');

    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('application/json')) {
      const obj = await res.json();
      const full = obj.choices?.[0]?.message?.content ?? obj.choices?.[0]?.text ?? '';
      if (full) onToken(full, full);
      if (obj.usage) onStats(obj.usage);
      return full;
    }
    if (!res.body) throw new Error('Streaming response body unavailable.');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let done = false;
    const consume = data => {
      if (data === '[DONE]') { done = true; return; }
      try {
        const obj = JSON.parse(data);
        const token = obj.choices?.[0]?.delta?.content ?? obj.choices?.[0]?.text ?? '';
        if (token) { full += token; onToken(token, full); }
        if (obj.usage) onStats(obj.usage);
      } catch { /* ignore malformed keepalive events */ }
    };

    while (!done) {
      const { value, done: streamDone } = await reader.read();
      if (streamDone) break;
      armTimeout(inactivityTimeoutSeconds, 'Streaming response stalled'); // reset only when the stream makes progress
      buffer += decoder.decode(value, { stream: true });
      buffer = processSseBuffer(buffer, consume);
    }
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        if (line.startsWith('data:')) consume(line.slice(5).trim());
      }
    }
    return full;
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener?.('abort', abortFromExternal);
  }
}

export function explainAiConnectionError(error, endpoint, provider='ollama') {
  provider = normalizeProvider(provider);
  if (provider === 'ollama') return explainOllamaError(error, endpoint);
  const msg = String(error?.message || error || 'Unknown error');
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) {
    return `Could not reach the hosted AI endpoint ${endpoint}. Check the URL, HTTPS certificate, CORS settings for ${location.origin}, authentication, and network access.`;
  }
  if (/401|403|unauthor|forbidden/i.test(msg)) return 'Hosted AI authentication failed. Check the API token and endpoint permissions.';
  if (/first response|model load/i.test(msg)) return `The hosted AI endpoint is reachable, but it did not produce a first response before the configured model-load timeout.`;
  if (/streaming response stalled/i.test(msg)) return `The hosted AI stream started but stopped making progress before the configured inactivity timeout.`;
  if (/timed out|Timeout/i.test(msg)) return `Connection to ${endpoint} timed out.`;
  return msg;
}
