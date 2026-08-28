export const APP_VERSION = '0.4.0-browser';

export const DEFAULT_MODES = Object.freeze({
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
  },
});

export const DEFAULT_SETTINGS = Object.freeze({
  currentMode: 'balanced',
  ollama: {
    endpoint: 'http://127.0.0.1:11434',
    chatModel: '',
    embeddingModel: 'embeddinggemma',
    requestTimeoutSeconds: 120,
  },
  modes: structuredClone(DEFAULT_MODES),
  retrieval: {
    chunkSize: 3200,
    chunkOverlap: 400,
    minKeywordScore: 0.02,
    rescanOnOpen: true,
  },
});

export const SUPPORTED_EXTENSIONS = new Set([
  'pdf', 'docx', 'xlsx', 'xls', 'pptx', 'csv', 'txt', 'md', 'markdown',
  'json', 'html', 'htm', 'xml', 'yaml', 'yml', 'log', 'tsv'
]);

export function cloneDefaults() {
  return structuredClone(DEFAULT_SETTINGS);
}

export function mergeSettings(saved = {}) {
  const base = cloneDefaults();
  return {
    ...base,
    ...saved,
    ollama: { ...base.ollama, ...(saved.ollama || {}) },
    retrieval: { ...base.retrieval, ...(saved.retrieval || {}) },
    modes: Object.fromEntries(
      Object.keys(base.modes).map(key => [key, { ...base.modes[key], ...((saved.modes || {})[key] || {}) }])
    ),
  };
}
