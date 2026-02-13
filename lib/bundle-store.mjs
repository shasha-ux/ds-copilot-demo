import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function sanitizeName(name) {
  if (!name) return null;
  const safe = String(name).replace(/[^A-Za-z0-9._-]/g, '_');
  return safe.slice(0, 120) || null;
}

function ensureWithin(root, target) {
  if (!target.startsWith(root)) {
    throw new Error('Unsafe path detected');
  }
}

export function writeBundleFiles(bundle, outputDir) {
  const files = bundle.files || {};
  fs.mkdirSync(outputDir, { recursive: true });

  for (const [relativePath, content] of Object.entries(files)) {
    const normalized = path.normalize(relativePath).replace(/^([.][.](\/|\\|$))+/, '');
    const abs = path.join(outputDir, normalized);
    ensureWithin(outputDir, abs);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, content);
  }
}

export function listFilesRecursively(dir, rootDir = dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFilesRecursively(abs, rootDir));
    } else {
      results.push(path.relative(rootDir, abs));
    }
  }
  return results;
}

export function saveBundle(outputRoot, requestedName, bundle) {
  fs.mkdirSync(outputRoot, { recursive: true });
  const outputName = sanitizeName(requestedName) || `bundle_${Date.now()}`;
  const targetDir = path.join(outputRoot, outputName);
  ensureWithin(outputRoot, targetDir);
  writeBundleFiles(bundle, targetDir);
  return {
    outputName,
    outputDir: targetDir,
    files: Object.keys(bundle.files || {})
  };
}

export function listBundles(outputRoot) {
  fs.mkdirSync(outputRoot, { recursive: true });
  return fs.readdirSync(outputRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .reverse();
}

export function inspectBundle(outputRoot, name) {
  const safeName = sanitizeName(name);
  if (!safeName) {
    throw new Error('Invalid bundle name');
  }

  const targetDir = path.join(outputRoot, safeName);
  ensureWithin(outputRoot, targetDir);
  if (!fs.existsSync(targetDir)) {
    throw new Error('Bundle not found');
  }

  return {
    name: safeName,
    outputDir: targetDir,
    files: listFilesRecursively(targetDir)
  };
}

export function createBundleArchive(outputRoot, name) {
  const inspected = inspectBundle(outputRoot, name);
  const archivePath = path.join(outputRoot, `${inspected.name}.tar.gz`);
  ensureWithin(outputRoot, archivePath);

  execFileSync('tar', ['-czf', archivePath, '-C', inspected.outputDir, '.'], {
    env: { ...process.env, LC_ALL: 'C' }
  });
  return {
    ...inspected,
    archivePath,
    archiveFileName: path.basename(archivePath)
  };
}
