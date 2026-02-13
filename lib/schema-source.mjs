function normalizeHostAllowlist() {
  const raw = process.env.DS_ALLOWED_SCHEMA_HOSTS || '';
  return raw
    .split(',')
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

function readTimeoutMs() {
  const value = Number(process.env.DS_SCHEMA_FETCH_TIMEOUT_MS || 7000);
  if (!Number.isFinite(value) || value <= 0) return 7000;
  return Math.min(value, 30000);
}

function buildAuthHeaders() {
  const mode = String(process.env.DS_SCHEMA_FETCH_AUTH_MODE || '').toLowerCase().trim();
  const headers = {};

  if (mode === 'bearer') {
    const token = String(process.env.DS_SCHEMA_FETCH_BEARER_TOKEN || '').trim();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  if (mode === 'header') {
    const name = String(process.env.DS_SCHEMA_FETCH_HEADER_NAME || '').trim();
    const value = String(process.env.DS_SCHEMA_FETCH_HEADER_VALUE || '').trim();
    if (name && value) {
      headers[name] = value;
    }
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

function validateSchemaUrl(rawUrl) {
  if (!rawUrl) return null;
  let parsed = null;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error('Invalid dataSchemaUrl');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('dataSchemaUrl must use http/https');
  }
  if (!isAllowedHost(parsed)) {
    throw new Error('dataSchemaUrl host is not allowed by DS_ALLOWED_SCHEMA_HOSTS');
  }
  return parsed;
}

async function fetchText(url, timeoutMs = readTimeoutMs()) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const authHeaders = buildAuthHeaders();
    const response = await fetch(url, {
      signal: controller.signal,
      headers: authHeaders
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch schema URL: ${response.status}`);
    }
    const text = await response.text();
    const maxLength = 1024 * 1024;
    if (text.length > maxLength) {
      throw new Error('Fetched schema is too large (max 1MB)');
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

export async function resolveSchemaInput({ dataSchema = '', dataSchemaUrl = '' } = {}) {
  const inline = String(dataSchema || '');
  const urlRaw = String(dataSchemaUrl || '').trim();

  if (inline.trim().length > 0) {
    return {
      dataSchema: inline,
      source: 'inline',
      dataSchemaUrl: urlRaw || null
    };
  }

  if (urlRaw) {
    const parsed = validateSchemaUrl(urlRaw);
    const fetched = await fetchText(parsed.toString());
    return {
      dataSchema: fetched,
      source: 'url',
      dataSchemaUrl: parsed.toString()
    };
  }

  return {
    dataSchema: '',
    source: 'none',
    dataSchemaUrl: null
  };
}

export async function fetchSchemaFromUrl(dataSchemaUrl) {
  const parsed = validateSchemaUrl(String(dataSchemaUrl || '').trim());
  return {
    dataSchema: await fetchText(parsed.toString()),
    dataSchemaUrl: parsed.toString()
  };
}
