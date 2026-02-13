function normalizeHostAllowlist() {
  const raw = process.env.DS_ALLOWED_CONTEXT_HOSTS || '';
  return raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function resolveConfluenceBaseUrl() {
  const raw = String(process.env.DS_CONFLUENCE_BASE_URL || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.origin;
  } catch {
    return null;
  }
}

function readTimeoutMs() {
  const value = Number(process.env.DS_CONTEXT_FETCH_TIMEOUT_MS || process.env.DS_SCHEMA_FETCH_TIMEOUT_MS || 7000);
  if (!Number.isFinite(value) || value <= 0) return 7000;
  return Math.min(value, 30000);
}

function buildAuthHeaders() {
  const mode = String(process.env.DS_CONTEXT_FETCH_AUTH_MODE || process.env.DS_SCHEMA_FETCH_AUTH_MODE || '').toLowerCase().trim();
  const headers = {};

  if (mode === 'bearer') {
    const token = String(process.env.DS_CONTEXT_FETCH_BEARER_TOKEN || process.env.DS_SCHEMA_FETCH_BEARER_TOKEN || '').trim();
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }

  if (mode === 'header') {
    const name = String(process.env.DS_CONTEXT_FETCH_HEADER_NAME || process.env.DS_SCHEMA_FETCH_HEADER_NAME || '').trim();
    const value = String(process.env.DS_CONTEXT_FETCH_HEADER_VALUE || process.env.DS_SCHEMA_FETCH_HEADER_VALUE || '').trim();
    if (name && value) headers[name] = value;
    return headers;
  }

  return headers;
}

function isAllowedHost(url) {
  const allowlist = normalizeHostAllowlist();
  if (allowlist.length === 0) return true;
  const hostname = String(url.hostname || '').toLowerCase();
  return allowlist.some((allowed) => hostname === allowed || hostname.endsWith(`.${allowed}`));
}

function validateUrl(rawUrl, label) {
  if (!rawUrl) throw new Error(`${label} is required`);
  let parsed = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid ${label}`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${label} must use http/https`);
  }
  if (!isAllowedHost(parsed)) {
    throw new Error(`${label} host is not allowed by DS_ALLOWED_CONTEXT_HOSTS`);
  }
  return parsed;
}

async function fetchText(url, timeoutMs = readTimeoutMs(), extraHeaders = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { ...buildAuthHeaders(), ...extraHeaders }
    });
    if (!response.ok) throw new Error(`Failed to fetch context URL: ${response.status}`);
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) throw new Error('Fetched context is too large (max 2MB)');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeContextBody(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';

  try {
    const parsed = JSON.parse(text);
    const page = parsed?.results?.[0] || parsed;
    const title = page?.title ? `제목: ${page.title}` : '';
    const storage = page?.body?.storage?.value || '';
    const plain = stripHtml(storage || text);
    return [title, plain].filter(Boolean).join('\n');
  } catch {
    return stripHtml(text);
  }
}

function summarizeText(text, maxLength = 1800) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}...`;
}

function detectContextSignals(text) {
  const lower = String(text || '').toLowerCase();
  return {
    hasTableIntent: /table|리스트|목록|조회|행|컬럼/.test(lower),
    hasCancelIntent: /cancel|취소/.test(lower),
    hasFlowIntent: /flow|시나리오|전이|이동|클릭|prototype|프로토타입/.test(lower),
    hasDataPolicy: /정책|rule|validation|조건|필수|status|state/.test(lower)
  };
}

export async function fetchContextFromUrl(rawUrl) {
  const parsed = validateUrl(String(rawUrl || '').trim(), 'contextUrl');
  const raw = await fetchText(parsed.toString(), readTimeoutMs(), buildConfluenceAuthHeaders());
  const extracted = summarizeText(normalizeContextBody(raw));
  return {
    contextUrl: parsed.toString(),
    rawLength: raw.length,
    extractedText: extracted,
    signals: detectContextSignals(extracted)
  };
}

export function mergeContextText({ prompt = '', contextText = '', selectionContext = '', editInstruction = '' } = {}) {
  const segments = [];
  if (prompt) segments.push(String(prompt).trim());
  if (contextText) segments.push(`[기획 맥락]\n${String(contextText).trim()}`);
  if (selectionContext) segments.push(`[선택 화면 맥락]\n${String(selectionContext).trim()}`);
  if (editInstruction) segments.push(`[수정 요청]\n${String(editInstruction).trim()}`);
  return segments.filter(Boolean).join('\n\n');
}

function buildConfluenceAuthHeaders() {
  const headers = {};
  const email = String(process.env.DS_CONFLUENCE_EMAIL || '').trim();
  const token = String(process.env.DS_CONFLUENCE_API_TOKEN || '').trim();
  if (email && token) {
    const basic = Buffer.from(`${email}:${token}`).toString('base64');
    headers.Authorization = `Basic ${basic}`;
    return headers;
  }
  return buildAuthHeaders();
}

export async function searchConfluenceDocuments(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) throw new Error('query is required');
  const base = resolveConfluenceBaseUrl();
  if (!base) {
    throw new Error('DS_CONFLUENCE_BASE_URL is not configured');
  }
  const url = new URL('/wiki/rest/api/search', base);
  url.searchParams.set('cql', `type=page AND text ~ "${query.replace(/"/g, '\\"')}"`);
  url.searchParams.set('limit', '10');
  url.searchParams.set('expand', 'content.space,content.version');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), readTimeoutMs());
  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      headers: buildConfluenceAuthHeaders()
    });
    if (!response.ok) {
      throw new Error(`Confluence search failed: ${response.status}`);
    }
    const data = await response.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results.map((row) => {
      const content = row.content || {};
      const links = content._links || {};
      const webui = links.webui ? `${base}${links.webui}` : '';
      return {
        id: content.id || '',
        title: content.title || '(제목 없음)',
        url: webui,
        space: content.space?.name || '',
        lastUpdatedBy: content.version?.by?.displayName || '',
        lastUpdatedAt: content.version?.when || ''
      };
    });
  } finally {
    clearTimeout(timer);
  }
}
