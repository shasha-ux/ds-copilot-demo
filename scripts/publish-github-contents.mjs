import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function mustEnv(name) {
  const v = String(process.env[name] || '').trim();
  if (!v) {
    console.error(`missing env: ${name}`);
    process.exit(1);
  }
  // undici (fetch) expects header values to be ByteString (ASCII). If users paste placeholders
  // like "(네 GitHub PAT 실제값)" the request will fail with a confusing ByteString error.
  if (name === 'GITHUB_TOKEN') {
    if (/\s/.test(v)) {
      console.error('GITHUB_TOKEN must not contain spaces/newlines. Paste the raw token value.');
      process.exit(1);
    }
    for (let i = 0; i < v.length; i += 1) {
      const code = v.charCodeAt(i);
      if (code < 0x21 || code > 0x7e) {
        console.error(
          'GITHUB_TOKEN contains non-ASCII characters. Paste the real GitHub PAT (looks like ghp_... or github_pat_...)'
        );
        process.exit(1);
      }
    }
    if (!/^(ghp_|github_pat_|gho_)/.test(v)) {
      console.error(
        'GITHUB_TOKEN does not look like a GitHub Personal Access Token. Paste the real token value (starts with ghp_... or github_pat_...).'
      );
      process.exit(1);
    }
  }
  return v;
}

const token = mustEnv('GITHUB_TOKEN');
const repo = mustEnv('GITHUB_REPO'); // e.g. shasha-ux/ds-copilot-demo
const branch = String(process.env.GITHUB_BRANCH || 'main').trim();

function run(cmd) {
  return execSync(cmd, { stdio: ['ignore', 'pipe', 'inherit'] }).toString('utf8');
}

function api(pathname, { method = 'GET', body } = {}) {
  const url = `https://api.github.com${pathname}`;
  const res = fetch(url, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ds-copilot-demo-publisher',
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  return res;
}

function isIgnored(p) {
  const normalized = p.replace(/\\/g, '/');
  if (normalized === '.env') return true;
  if (normalized.startsWith('node_modules/')) return true;
  if (normalized.startsWith('generated/')) return true;
  if (normalized.endsWith('.DS_Store')) return true;
  if (normalized.endsWith('.log')) return true;
  return false;
}

function parseStatusZ(raw) {
  // Porcelain -z lines are NUL-separated. Each record begins with 2 status chars + space + path.
  const parts = raw.split('\0').filter(Boolean);
  const entries = [];
  for (const part of parts) {
    // Example: " M figma-plugin/ui.html" or "?? newfile"
    const status = part.slice(0, 2);
    const file = part.slice(3);
    if (!file) continue;
    entries.push({ status, file });
  }
  return entries;
}

function base64File(filePath) {
  const buf = fs.readFileSync(filePath);
  return buf.toString('base64');
}

async function getRemoteSha(filePath) {
  const encPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
  const res = await api(`/repos/${repo}/contents/${encPath}?ref=${encodeURIComponent(branch)}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`GET sha failed for ${filePath}: ${res.status} ${t}`);
  }
  const json = await res.json();
  return json && json.sha ? json.sha : null;
}

async function putFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  const content = base64File(abs);
  const sha = await getRemoteSha(filePath);
  const encPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
  const body = {
    message: `chore: sync ${filePath}`,
    content,
    branch
  };
  if (sha) body.sha = sha;
  const res = await api(`/repos/${repo}/contents/${encPath}`, { method: 'PUT', body });
  const text = await res.text();
  if (!res.ok) throw new Error(`PUT failed for ${filePath}: ${res.status} ${text}`);
}

async function deleteFile(filePath) {
  const sha = await getRemoteSha(filePath);
  if (!sha) return; // already gone
  const encPath = encodeURIComponent(filePath).replace(/%2F/g, '/');
  const body = {
    message: `chore: delete ${filePath}`,
    sha,
    branch
  };
  const res = await api(`/repos/${repo}/contents/${encPath}`, { method: 'DELETE', body });
  const text = await res.text();
  if (!res.ok) throw new Error(`DELETE failed for ${filePath}: ${res.status} ${text}`);
}

async function main() {
  // Ensure we're in a git repo.
  try {
    run('git rev-parse --is-inside-work-tree');
  } catch {
    console.error('not a git repository (git rev-parse failed)');
    process.exit(1);
  }

  const raw = run('git status --porcelain=v1 -z');
  const entries = parseStatusZ(raw);
  const changed = entries
    .map((e) => e.file)
    .filter((f, idx, arr) => arr.indexOf(f) === idx)
    .filter((f) => !isIgnored(f));

  if (changed.length === 0) {
    console.log('no changed files to publish');
    return;
  }

  const deletions = entries
    .filter((e) => e.status.includes('D'))
    .map((e) => e.file)
    .filter((f) => !isIgnored(f));

  const uploads = changed.filter((f) => !deletions.includes(f));

  console.log(`repo: ${repo} (branch: ${branch})`);
  console.log(`upload: ${uploads.length} files, delete: ${deletions.length} files`);

  for (const f of uploads) {
    process.stdout.write(`PUT ${f} ... `);
    await putFile(f);
    process.stdout.write('ok\n');
  }

  for (const f of deletions) {
    process.stdout.write(`DEL ${f} ... `);
    await deleteFile(f);
    process.stdout.write('ok\n');
  }

  console.log('done');
}

main().catch((err) => {
  console.error(String(err && err.stack ? err.stack : err));
  process.exit(1);
});
