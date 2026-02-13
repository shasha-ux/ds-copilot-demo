import fs from 'node:fs';
import path from 'node:path';

function normalizeName(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[/:.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function stripKnownPrefixes(value) {
  return String(value || '')
    .replace(/^YEO_/, '')
    .replace(/^DS_/, '')
    .replace(/^COMPONENT_/, '');
}

function tokenize(value) {
  return normalizeName(value)
    .split('_')
    .map((v) => v.trim())
    .filter(Boolean);
}

function jaccardScore(aTokens, bTokens) {
  const a = new Set(aTokens || []);
  const b = new Set(bTokens || []);
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const token of a) {
    if (b.has(token)) inter += 1;
  }
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

function safeReadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJson(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function buildNameCandidates(name) {
  const raw = String(name || '');
  const normalized = normalizeName(raw);
  const stripped = stripKnownPrefixes(normalized);
  const slashSplit = raw.split('/').map((v) => normalizeName(v)).filter(Boolean);
  const colonSplit = raw.split(':').map((v) => normalizeName(v)).filter(Boolean);
  const candidates = new Set([normalized, stripped, ...slashSplit, ...colonSplit]);
  return Array.from(candidates).filter(Boolean);
}

function indexLibraryComponents(components = []) {
  const index = new Map();
  const items = [];
  for (const component of components) {
    const candidates = buildNameCandidates(component.name);
    const tokens = tokenize(component.name);
    items.push({ ...component, candidates, tokens });
    for (const candidate of candidates) {
      if (!index.has(candidate)) {
        index.set(candidate, component);
      }
    }
  }
  return { index, items };
}

function resolveRegistryAliasCandidates(registry, componentName) {
  const aliases = registry?.component_aliases?.[componentName];
  if (!Array.isArray(aliases)) return [];
  return aliases.map((name) => normalizeName(name)).filter(Boolean);
}

function resolveLibraryComponentForRegistry({ componentName, registry, libraryIndex, libraryItems }) {
  const exactCandidates = new Set([
    ...buildNameCandidates(componentName),
    ...resolveRegistryAliasCandidates(registry, componentName)
  ]);

  for (const candidate of exactCandidates) {
    const exact = libraryIndex.get(candidate);
    if (exact && exact.key) {
      return { hit: exact, matchType: 'exact', score: 1, candidate };
    }
  }

  const targetTokens = tokenize(componentName);
  let best = null;
  for (const item of libraryItems) {
    if (!item.key) continue;
    const score = jaccardScore(targetTokens, item.tokens);
    if (!best || score > best.score) {
      best = { hit: item, matchType: 'fuzzy', score, candidate: item.name };
    }
  }

  if (best && best.score >= 0.5) {
    return best;
  }

  return null;
}

function suggestLibraryCandidates({ componentName, libraryItems }) {
  const targetTokens = tokenize(componentName);
  return [...libraryItems]
    .map((item) => ({
      name: item.name,
      key: item.key,
      score: jaccardScore(targetTokens, item.tokens)
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

export function mergeRegistryWithLibrary({ registryPath, components = [], outputRoot, source = 'payload', dryRun = false }) {
  const registry = safeReadJson(registryPath, {});
  const currentKeys = registry.component_keys || {};
  const indexed = indexLibraryComponents(components);
  const libraryIndex = indexed.index;
  const libraryItems = indexed.items;
  const registryComponents = Array.isArray(registry.components) ? registry.components : [];

  const matched = [];
  const unmatched = [];
  const updatedKeys = { ...currentKeys };

  for (const componentName of registryComponents) {
    const resolved = resolveLibraryComponentForRegistry({
      componentName,
      registry,
      libraryIndex,
      libraryItems
    });

    if (!resolved || !resolved.hit || !resolved.hit.key) {
      unmatched.push({
        component: componentName,
        suggestions: suggestLibraryCandidates({ componentName, libraryItems })
      });
      continue;
    }
    updatedKeys[componentName] = resolved.hit.key;
    matched.push({
      component: componentName,
      key: resolved.hit.key,
      sourceName: resolved.hit.name,
      matchType: resolved.matchType,
      matchScore: Number(resolved.score.toFixed(3)),
      candidate: resolved.candidate
    });
  }

  const report = {
    at: new Date().toISOString(),
    source,
    dryRun: Boolean(dryRun),
    inputCount: components.length,
    registryComponentCount: registryComponents.length,
    matchedCount: matched.length,
    unmatchedCount: unmatched.length,
    matched,
    unmatched
  };

  if (!dryRun) {
    registry.component_keys = updatedKeys;
    saveJson(registryPath, registry);
  }

  const ts = Date.now();
  saveJson(path.join(outputRoot, `report-${ts}.json`), report);
  saveJson(path.join(outputRoot, 'latest.json'), report);

  return report;
}

export function getLatestLibrarySync(outputRoot) {
  return safeReadJson(path.join(outputRoot, 'latest.json'), null);
}

export async function fetchFigmaLibraryComponents({ fileKey, token }) {
  if (!fileKey) throw new Error('fileKey is required');
  if (!token) throw new Error('figma token is required');

  const response = await fetch(`https://api.figma.com/v1/files/${encodeURIComponent(fileKey)}`, {
    headers: { 'X-Figma-Token': token }
  });
  if (!response.ok) {
    throw new Error(`Figma file fetch failed: ${response.status}`);
  }

  const json = await response.json();
  const componentMap = json?.components && typeof json.components === 'object' ? json.components : {};
  const components = Object.values(componentMap).map((item) => ({
    key: item.key,
    name: item.name,
    nodeId: item.node_id || '',
    componentSetId: item.componentSetId || '',
    description: item.description || ''
  }));

  return components;
}

export function extractFigmaFileKeyFromUrl(rawUrl) {
  if (!rawUrl) return null;
  let parsed = null;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    return null;
  }

  const host = String(parsed.hostname || '').toLowerCase();
  if (!host.includes('figma.com')) return null;

  const segments = parsed.pathname.split('/').filter(Boolean);
  if (segments.length < 2) return null;

  const marker = segments[0];
  if (marker !== 'design' && marker !== 'file') return null;
  return segments[1] || null;
}
