import fs from 'node:fs';
import path from 'node:path';

function now() {
  return new Date().toISOString();
}

function slugify(text) {
  return String(text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeId(projectId) {
  return String(projectId || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

function projectDir(rootDir, projectId) {
  const id = safeId(projectId);
  if (!id) {
    throw new Error('Invalid project id');
  }
  return path.join(rootDir, id);
}

function projectFile(rootDir, projectId) {
  return path.join(projectDir(rootDir, projectId), 'project.json');
}

function readProjectFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error('Project not found');
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveProjectFile(filePath, data) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function createProject(rootDir, input = {}) {
  ensureDir(rootDir);
  const base = slugify(input.name) || 'project';
  const timestamp = Date.now().toString(36);
  const id = `${base}-${timestamp}`;
  const at = now();
  const project = {
    id,
    name: input.name || 'Untitled Project',
    prd: input.prd || '',
    onePager: input.onePager || '',
    dataSchema: input.dataSchema || '',
    dataSchemaUrl: input.dataSchemaUrl || '',
    rankingPreset: input.rankingPreset || 'balanced',
    rankingPolicyOverride: input.rankingPolicyOverride || {},
    tags: Array.isArray(input.tags) ? input.tags : [],
    createdAt: at,
    updatedAt: at,
    revisions: []
  };

  saveProjectFile(projectFile(rootDir, id), project);
  return project;
}

export function listProjects(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  return fs
    .readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const filePath = path.join(rootDir, entry.name, 'project.json');
      if (!fs.existsSync(filePath)) return null;
      const project = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return {
        id: project.id,
        name: project.name,
        hasDataSchemaUrl: Boolean(project.dataSchemaUrl),
        rankingPreset: project.rankingPreset || 'balanced',
        tags: project.tags || [],
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        revisionCount: Array.isArray(project.revisions) ? project.revisions.length : 0
      };
    })
    .filter(Boolean)
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

export function getProject(rootDir, projectId) {
  return readProjectFile(projectFile(rootDir, projectId));
}

export function updateProject(rootDir, projectId, patch = {}) {
  const filePath = projectFile(rootDir, projectId);
  const project = readProjectFile(filePath);

  if (typeof patch.name === 'string') project.name = patch.name;
  if (typeof patch.prd === 'string') project.prd = patch.prd;
  if (typeof patch.onePager === 'string') project.onePager = patch.onePager;
  if (typeof patch.dataSchema === 'string') project.dataSchema = patch.dataSchema;
  if (typeof patch.dataSchemaUrl === 'string') project.dataSchemaUrl = patch.dataSchemaUrl;
  if (typeof patch.rankingPreset === 'string') project.rankingPreset = patch.rankingPreset;
  if (patch.rankingPolicyOverride && typeof patch.rankingPolicyOverride === 'object') {
    project.rankingPolicyOverride = patch.rankingPolicyOverride;
  }
  if (Array.isArray(patch.tags)) project.tags = patch.tags;
  project.updatedAt = now();

  saveProjectFile(filePath, project);
  return project;
}

export function appendProjectRevision(rootDir, projectId, revision = {}) {
  const filePath = projectFile(rootDir, projectId);
  const project = readProjectFile(filePath);
  const entry = {
    id: `rev_${Date.now()}`,
    at: now(),
    kind: revision.kind || 'generate',
    prompt: revision.prompt || '',
    fidelity: revision.fidelity || 'prototype',
    dataSchema: revision.dataSchema || '',
    result: revision.result || {}
  };

  if (!Array.isArray(project.revisions)) {
    project.revisions = [];
  }
  project.revisions.unshift(entry);
  project.revisions = project.revisions.slice(0, 100);
  project.updatedAt = now();

  saveProjectFile(filePath, project);
  return entry;
}

export function buildProjectRunInput(project, request = {}) {
  const fidelity = request.fidelity || 'prototype';
  const focusPrompt = request.prompt || '';
  const mergedPrompt = [
    `[프로젝트명] ${project.name}`,
    project.prd ? `[PRD]\n${project.prd}` : '',
    project.onePager ? `[ONE_PAGER]\n${project.onePager}` : '',
    focusPrompt ? `[요청]\n${focusPrompt}` : '[요청]\n신규 화면을 생성해줘',
    `[목표 Fidelity] ${fidelity}`
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    prompt: mergedPrompt,
    dataSchema: request.dataSchema || project.dataSchema || '',
    dataSchemaUrl: request.dataSchemaUrl || project.dataSchemaUrl || '',
    fidelity
  };
}
