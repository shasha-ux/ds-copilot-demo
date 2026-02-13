import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const authDir = path.join(projectRoot, 'generated', 'auth');
const connectPath = path.join(authDir, 'connect.json');
const sessionPath = path.join(authDir, 'sessions.json');

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

function nowMs() {
  return Date.now();
}

function mustEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

function optionalEnv(name) {
  const value = String(process.env[name] || '').trim();
  return value || null;
}

export function getAtlassianOAuthConfig() {
  // Atlassian 3LO OAuth
  // https://developer.atlassian.com/cloud/jira/platform/oauth-2-3lo-apps/
  return {
    clientId: mustEnv('ATLASSIAN_CLIENT_ID'),
    clientSecret: mustEnv('ATLASSIAN_CLIENT_SECRET'),
    redirectUri: mustEnv('ATLASSIAN_REDIRECT_URI'),
    scopes: (optionalEnv('ATLASSIAN_SCOPES')
      || 'read:confluence-content.all read:confluence-content.summary read:confluence-space.summary search:confluence')
      .split(/\s+/)
      .filter(Boolean),
    confluenceBaseUrl: optionalEnv('DS_CONFLUENCE_BASE_URL')
  };
}

export function startAtlassianConnect({ requestedBy = {} } = {}) {
  const connectToken = randomToken('cx');
  const connectStore = readJson(connectPath, { items: {} });
  connectStore.items[connectToken] = {
    connectToken,
    createdAt: new Date().toISOString(),
    requestedBy
  };
  writeJson(connectPath, connectStore);

  const cfg = getAtlassianOAuthConfig();
  const authorize = new URL('https://auth.atlassian.com/authorize');
  authorize.searchParams.set('audience', 'api.atlassian.com');
  authorize.searchParams.set('client_id', cfg.clientId);
  authorize.searchParams.set('scope', cfg.scopes.join(' '));
  authorize.searchParams.set('redirect_uri', cfg.redirectUri);
  authorize.searchParams.set('state', connectToken);
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('prompt', 'consent');

  return { connectToken, url: authorize.toString() };
}

async function exchangeCodeForToken(code) {
  const cfg = getAtlassianOAuthConfig();
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      code,
      redirect_uri: cfg.redirectUri
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`token exchange failed: ${response.status} ${data?.error_description || data?.error || ''}`.trim());
  }
  return data;
}

async function fetchAccessibleResources(accessToken) {
  const response = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const data = await response.json().catch(() => ([]));
  if (!response.ok) {
    throw new Error(`accessible-resources failed: ${response.status}`);
  }
  return Array.isArray(data) ? data : [];
}

function pickConfluenceResource(resources, desiredBaseUrl) {
  const desiredOrigin = desiredBaseUrl ? new URL(desiredBaseUrl).origin : null;
  const withConfluence = resources.filter((r) =>
    Array.isArray(r.scopes) ? r.scopes.some((s) => String(s).includes('confluence')) : true
  );
  if (desiredOrigin) {
    const matched = withConfluence.find((r) => {
      try {
        return new URL(r.url).origin === desiredOrigin;
      } catch {
        return false;
      }
    });
    if (matched) return matched;
  }
  return withConfluence[0] || resources[0] || null;
}

export async function completeAtlassianConnect({ connectToken, code }) {
  if (!connectToken) throw new Error('connectToken is required');
  if (!code) throw new Error('code is required');

  const connectStore = readJson(connectPath, { items: {} });
  const connect = connectStore.items[connectToken];
  if (!connect) throw new Error('Unknown connectToken');

  const token = await exchangeCodeForToken(code);
  const accessToken = String(token.access_token || '').trim();
  const refreshToken = String(token.refresh_token || '').trim();
  const expiresIn = Number(token.expires_in || 3600);
  if (!accessToken) throw new Error('No access_token returned');

  const cfg = getAtlassianOAuthConfig();
  const resources = await fetchAccessibleResources(accessToken);
  const picked = pickConfluenceResource(resources, cfg.confluenceBaseUrl);
  if (!picked?.id) throw new Error('No accessible Confluence resource found');

  const sessionToken = randomToken('sx');
  const sessionStore = readJson(sessionPath, { items: {} });
  sessionStore.items[sessionToken] = {
    sessionToken,
    createdAt: new Date().toISOString(),
    accessToken,
    refreshToken: refreshToken || null,
    // store absolute ms so we can refresh without clock drift surprises
    accessTokenExpiresAt: nowMs() + Math.max(60, expiresIn - 30) * 1000,
    cloudId: picked.id,
    resourceUrl: picked.url,
    resourceName: picked.name || '',
    requestedBy: connect.requestedBy || {}
  };
  writeJson(sessionPath, sessionStore);

  connectStore.items[connectToken] = {
    ...connect,
    completedAt: new Date().toISOString(),
    sessionToken,
    cloudId: picked.id,
    resourceUrl: picked.url
  };
  writeJson(connectPath, connectStore);

  return { sessionToken, cloudId: picked.id, resourceUrl: picked.url, resourceName: picked.name || '' };
}

async function refreshAccessToken(refreshToken) {
  const cfg = getAtlassianOAuthConfig();
  const response = await fetch('https://auth.atlassian.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      refresh_token: refreshToken
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`token refresh failed: ${response.status} ${data?.error_description || data?.error || ''}`.trim());
  }
  return data;
}

export function getConnectStatus(connectToken) {
  const connectStore = readJson(connectPath, { items: {} });
  const row = connectStore.items[String(connectToken || '').trim()];
  if (!row) return { ok: false, error: 'Unknown connectToken' };
  return {
    ok: true,
    connected: Boolean(row.sessionToken),
    sessionToken: row.sessionToken || null,
    resourceUrl: row.resourceUrl || null
  };
}

export async function getSessionFromAuthorizationHeader(authHeader) {
  const raw = String(authHeader || '').trim();
  if (!raw) return null;
  const m = raw.match(/^Bearer\s+(.+)$/i);
  if (!m) return null;
  const sessionToken = m[1].trim();
  const sessionStore = readJson(sessionPath, { items: {} });
  const session = sessionStore.items[sessionToken];
  if (!session) return null;

  // Refresh if needed and possible.
  const expiresAt = Number(session.accessTokenExpiresAt || 0);
  const isExpired = !expiresAt || nowMs() > expiresAt;
  if (isExpired && session.refreshToken) {
    const refreshed = await refreshAccessToken(session.refreshToken);
    const accessToken = String(refreshed.access_token || '').trim();
    const refreshToken = String(refreshed.refresh_token || '').trim() || session.refreshToken;
    const expiresIn = Number(refreshed.expires_in || 3600);
    if (accessToken) {
      const updated = {
        ...session,
        accessToken,
        refreshToken,
        accessTokenExpiresAt: nowMs() + Math.max(60, expiresIn - 30) * 1000
      };
      sessionStore.items[sessionToken] = updated;
      writeJson(sessionPath, sessionStore);
      return updated;
    }
  }

  return session;
}

