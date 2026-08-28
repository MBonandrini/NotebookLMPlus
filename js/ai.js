import { embedTexts as ollamaEmbedTexts, getVersion as getOllamaVersion, listModels as listOllamaModels, streamChat as streamOllamaChat, explainConnectionError as explainOllamaError } from './ollama.js';

const SESSION_KEY = 'notebooklmplus-hosted-api-key';

export function normalizeProvider(provider) {
  return provider === 'openai-compatible' ? 'openai-compatible' : 'ollama';
}

export function getSessionApiKey() {
  try { return sessionStorage.getItem(SESSION_KEY) || ''; } catch { return ''; }
}

export function setSessionApiKey(value) {
  try {
    if (value) sessionStorage.setItem(SESSION_KEY, value);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch { /* session storage may be unavailable */ }
}

function cleanBase(endpoint) {
  return String(endpoint || '').trim().replace(/\/+$/, '');
}

function hostedUrl(endpoint, path) {
  const base = cleanBase(endpoint);
  if (!base) throw new Error('No hosted AI endpoint configured.');
  return `${base}/${String(path || '').replace(/^\/+/, '')}`;
}

async function fetchHosted(endpoint, path, init={}, timeoutSeconds=120, apiKey=getSessionApiKey()) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutSeconds * 1000);
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
    return ollamaEmbedTexts({ endpoint, model, texts, timeoutSeconds, keepAlive });
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
  return (data.data || []).sort((a,b) => (a.index ?? 0) - (b.index ?? 0)).map(x => x.embedding || x.vector).filter(Boolean);
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

export async function streamAiChat({ provider='ollama', endpoint, apiKey=getSessionApiKey(), model, messages, contextTokens=16384, maxAnswerTokens=1280, temperature=0.18, timeoutSeconds=120, keepAlive='5m', onToken=()=>{}, onStats=()=>{} }) {
  provider = normalizeProvider(provider);
  if (provider === 'ollama') {
    return streamOllamaChat({
      endpoint, model, messages, timeoutSeconds, keepAlive,
      options: { num_ctx: contextTokens, num_predict: maxAnswerTokens, temperature },
      onToken, onStats,
    });
  }

  if (!model) throw new Error('No hosted chat model selected.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutSeconds * 1000);
  try {
    const headers = new Headers({ 'Content-Type': 'application/json', 'Accept': 'text/event-stream' });
    if (apiKey) headers.set('Authorization', `Bearer ${apiKey}`);
    const res = await fetch(hostedUrl(endpoint, 'chat/completions'), {
      method: 'POST', mode: 'cors', headers, signal: controller.signal,
      body: JSON.stringify({ model, messages, stream: true, temperature, max_tokens: maxAnswerTokens }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Hosted chat request failed (${res.status}). ${body.slice(0, 260)}`);
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
  if (/timed out|Timeout/i.test(msg)) return `Connection to ${endpoint} timed out.`;
  return msg;
}
