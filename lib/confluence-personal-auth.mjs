import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const authDir = path.join(projectRoot, 'generated', 'auth');
const sessionPath = path.join(authDir, 'confluence-personal-sessions.json');

function ensureDir() {
  fs.mkdirSync(authDir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, value) {
  ensureDir();
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function randomToken(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
}

function buildBasicAuthHeader(email, apiToken) {
  const e = String(email || '').trim();
  const t = String(apiToken || '').trim();
  if (!e || !t) return null;
  const basic = Buffer.from(`${e}:${t}`).toString('base64');
  return `Basic ${basic}`;
}

async function verifyWithConfluence({ baseUrl, authHeader }) {
  // Lightweight verification: call "current user" endpoint.
  const base = new URL(String(baseUrl || '').trim());
  const url = new URL('/wiki/rest/api/user/current', base.origin);
  const response = await fetch(url.toString(), {
    headers: { Authorization: authHeader, Accept: 'application/json' }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Confluence verify failed: ${response.status}`);
  }
  return {
    accountId: data?.accountId || '',
    displayName: data?.displayName || '',
    email: data?.email || ''
  };
}

export async function startPersonalConfluenceSession({ confluenceBaseUrl, email, apiToken, requestedBy = {} }) {
  const baseUrl = String(confluenceBaseUrl || '').trim();
  if (!baseUrl) throw new Error('DS_CONFLUENCE_BASE_URL is not configured');
  const authHeader = buildBasicAuthHeader(email, apiToken);
  if (!authHeader) throw new Error('email and apiToken are required');

  const verified = await verifyWithConfluence({ baseUrl, authHeader });
  const sessionToken = randomToken('px');
  const store = readJson(sessionPath, { items: {} });
  store.items[sessionToken] = {
    sessionToken,
    createdAt: new Date().toISOString(),
    confluenceBaseUrl: new URL(baseUrl).origin,
    email: String(email || '').trim(),
    apiToken: String(apiToken || '').trim(),
    verified,
    requestedBy
  };
  writeJson(sessionPath, store);
  return { sessionToken, verified };
}

export function endPersonalConfluenceSession(sessionToken) {
  const token = String(sessionToken || '').trim();
  if (!token) return { ok: true, removed: false };
  const store = readJson(sessionPath, { items: {} });
  const existed = Boolean(store.items[token]);
  if (existed) {
    delete store.items[token];
    writeJson(sessionPath, store);
  }
  return { ok: true, removed: existed };
}

export function getPersonalConfluenceSessionFromAuthorizationHeader(authHeader) {
  const raw = String(authHeader || '').trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const token = m[1].trim();
  if (!token.startsWith('px_')) return null;
  const store = readJson(sessionPath, { items: {} });
  return store.items[token] || null;
}

export function buildPersonalConfluenceAuthHeaders(session) {
  if (!session) return null;
  const auth = buildBasicAuthHeader(session.email, session.apiToken);
  if (!auth) return null;
  return { Authorization: auth };
}

