export const APP_VERSION = '0.6.0';

export const DEFAULT_MODES = Object.freeze({
  cpu: {
    label: 'CPU / No GPU',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: '',
    contextTokens: 4096,
    topK: 4,
    maxAnswerTokens: 384,
    embedBatch: 1,
    workerCount: 1,
    temperature: 0.15,
    semanticSearch: false,
    keywordSearch: true,
    keepAlive: '30m',
    firstResponseTimeoutSeconds: 900,
    inactivityTimeoutSeconds: 240,
  },
  lightweight: {
    label: 'Lightweight (Local Ollama)',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    contextTokens: 4096,
    topK: 6,
    maxAnswerTokens: 640,
    embedBatch: 2,
    workerCount: 1,
    temperature: 0.15,
    semanticSearch: true,
    keywordSearch: true,
    keepAlive: '0',
    firstResponseTimeoutSeconds: 420,
    inactivityTimeoutSeconds: 180,
  },
  local: {
    label: 'Local Ollama',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    contextTokens: 8192,
    topK: 10,
    maxAnswerTokens: 1024,
    embedBatch: 4,
    workerCount: 2,
    temperature: 0.15,
    semanticSearch: true,
    keywordSearch: true,
    keepAlive: '5m',
    firstResponseTimeoutSeconds: 300,
    inactivityTimeoutSeconds: 180,
  },
  balanced: {
    label: 'Balanced (Local Ollama)',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    contextTokens: 16384,
    topK: 12,
    maxAnswerTokens: 1280,
    embedBatch: 8,
    workerCount: 3,
    temperature: 0.18,
    semanticSearch: true,
    keywordSearch: true,
    keepAlive: '5m',
    firstResponseTimeoutSeconds: 300,
    inactivityTimeoutSeconds: 180,
  },
  power: {
    label: 'Power (Local Ollama)',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    contextTokens: 32768,
    topK: 20,
    maxAnswerTokens: 2048,
    embedBatch: 16,
    workerCount: 6,
    temperature: 0.2,
    semanticSearch: true,
    keywordSearch: true,
    keepAlive: '15m',
    firstResponseTimeoutSeconds: 240,
    inactivityTimeoutSeconds: 150,
  },
  remote: {
    label: 'Remote Ollama',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    contextTokens: 32768,
    topK: 16,
    maxAnswerTokens: 1536,
    embedBatch: 8,
    workerCount: 3,
    temperature: 0.18,
    semanticSearch: true,
    keywordSearch: true,
    keepAlive: '15m',
    firstResponseTimeoutSeconds: 240,
    inactivityTimeoutSeconds: 150,
  },
  hosted: {
    label: 'Hosted AI Engine',
    provider: 'openai-compatible',
    endpoint: 'https://your-ai-host.example.com/v1',
    chatModel: '',
    embeddingModel: '',
    contextTokens: 32768,
    topK: 16,
    maxAnswerTokens: 1536,
    embedBatch: 16,
    workerCount: 3,
    temperature: 0.18,
    semanticSearch: true,
    keywordSearch: true,
    keepAlive: '0',
    firstResponseTimeoutSeconds: 420,
    inactivityTimeoutSeconds: 180,
  },
  custom: {
    label: 'Custom',
    provider: 'ollama',
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    contextTokens: 16384,
    topK: 12,
    maxAnswerTokens: 1280,
    embedBatch: 8,
    workerCount: 3,
    temperature: 0.18,
    semanticSearch: true,
    keywordSearch: true,
    keepAlive: '5m',
    firstResponseTimeoutSeconds: 300,
    inactivityTimeoutSeconds: 180,
  },
});

export const DEFAULT_SETTINGS = Object.freeze({
  currentMode: 'balanced',
  ollama: {
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    requestTimeoutSeconds: 300,
  },
  modes: structuredClone(DEFAULT_MODES),
  retrieval: {
    chunkSize: 3200,
    chunkOverlap: 400,
    minKeywordScore: 0.02,
    rescanOnOpen: true,
    maxFileSizeMB: 256,
  },
});

export const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'docx', 'xlsx', 'xls', 'pptx', 'csv', 'txt', 'md', 'markdown',
  'json', 'html', 'htm', 'xml', 'yaml', 'yml', 'log', 'tsv'
]);

export function cloneDefaults() {
  return structuredClone(DEFAULT_SETTINGS);
}

function clampFinite(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function sanitizeMode(savedMode, defaults) {
  const raw = { ...defaults, ...(savedMode || {}) };
  const provider = raw.provider === 'openai-compatible' ? 'openai-compatible' : 'ollama';
  return {
    ...defaults,
    ...raw,
    label: typeof raw.label === 'string' && raw.label.trim() ? raw.label : defaults.label,
    provider,
    endpoint: typeof raw.endpoint === 'string' ? raw.endpoint.trim().replace(/\/+$/,'') : defaults.endpoint,
    chatModel: typeof raw.chatModel === 'string' ? raw.chatModel.trim() : defaults.chatModel,
    embeddingModel: typeof raw.embeddingModel === 'string' ? raw.embeddingModel.trim() : defaults.embeddingModel,
    contextTokens: Math.round(clampFinite(raw.contextTokens, 2048, 262144, defaults.contextTokens)),
    topK: Math.round(clampFinite(raw.topK, 2, 50, defaults.topK)),
    maxAnswerTokens: Math.round(clampFinite(raw.maxAnswerTokens, 128, 8192, defaults.maxAnswerTokens)),
    embedBatch: Math.round(clampFinite(raw.embedBatch, 1, 128, defaults.embedBatch)),
    workerCount: Math.round(clampFinite(raw.workerCount, 1, 8, defaults.workerCount)),
    temperature: clampFinite(raw.temperature, 0, 2, defaults.temperature),
    semanticSearch: raw.semanticSearch !== false,
    keywordSearch: raw.keywordSearch !== false,
    keepAlive: typeof raw.keepAlive === 'string' ? raw.keepAlive : defaults.keepAlive,
    firstResponseTimeoutSeconds: Math.round(clampFinite(raw.firstResponseTimeoutSeconds, 30, 1800, defaults.firstResponseTimeoutSeconds || 300)),
    inactivityTimeoutSeconds: Math.round(clampFinite(raw.inactivityTimeoutSeconds, 30, 600, defaults.inactivityTimeoutSeconds || 180)),
  };
}

export function mergeSettings(saved = {}) {
  const base = cloneDefaults();
  const savedModes = saved && typeof saved.modes === 'object' && saved.modes ? saved.modes : {};
  const modes = Object.fromEntries(
    Object.keys(base.modes).map(key => [key, sanitizeMode(savedModes[key], base.modes[key])])
  );
  const requestedMode = typeof saved.currentMode === 'string' ? saved.currentMode : base.currentMode;
  const retrievalRaw = saved && typeof saved.retrieval === 'object' && saved.retrieval ? saved.retrieval : {};
  const chunkSize = Math.round(clampFinite(retrievalRaw.chunkSize, 500, 12000, base.retrieval.chunkSize));
  const chunkOverlap = Math.round(clampFinite(retrievalRaw.chunkOverlap, 0, Math.min(2000, chunkSize - 1), base.retrieval.chunkOverlap));
  const ollamaRaw = saved && typeof saved.ollama === 'object' && saved.ollama ? saved.ollama : {};
  return {
    ...base,
    currentMode: modes[requestedMode] ? requestedMode : base.currentMode,
    ollama: {
      ...base.ollama,
      endpoint: typeof ollamaRaw.endpoint === 'string' ? ollamaRaw.endpoint.trim().replace(/\/+$/,'') : base.ollama.endpoint,
      chatModel: typeof ollamaRaw.chatModel === 'string' ? ollamaRaw.chatModel.trim() : base.ollama.chatModel,
      embeddingModel: typeof ollamaRaw.embeddingModel === 'string' ? ollamaRaw.embeddingModel.trim() : base.ollama.embeddingModel,
      requestTimeoutSeconds: Math.round(clampFinite(ollamaRaw.requestTimeoutSeconds, 5, 1800, base.ollama.requestTimeoutSeconds)),
    },
    retrieval: {
      ...base.retrieval,
      chunkSize,
      chunkOverlap,
      minKeywordScore: clampFinite(retrievalRaw.minKeywordScore, 0, 1, base.retrieval.minKeywordScore),
      rescanOnOpen: retrievalRaw.rescanOnOpen !== false,
      maxFileSizeMB: Math.round(clampFinite(retrievalRaw.maxFileSizeMB, 1, 2048, base.retrieval.maxFileSizeMB)),
    },
    modes,
  };
}
