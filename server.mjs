import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigmaEvents, buildPlan, loadRegistry, validatePlan } from './lib/generator.mjs';
import { irToReactCode, planToIR } from './lib/ir.mjs';
import { buildCodeBundle } from './lib/export-bundle.mjs';
import { createBundleArchive, inspectBundle, listBundles, saveBundle } from './lib/bundle-store.mjs';
import { runPipeline } from './lib/pipeline.mjs';
import { appendRunHistory, readRunHistory } from './lib/run-history.mjs';
import { evaluateCompliance } from './lib/compliance.mjs';
import {
  appendProjectRevision,
  buildProjectRunInput,
  createProject,
  getProject,
  listProjects,
  updateProject
} from './lib/project-store.mjs';
import { buildMatrixResult, resolveRankingContext } from './lib/ranking.mjs';
import { fetchSchemaFromUrl, resolveSchemaInput } from './lib/schema-source.mjs';
import { fetchContextFromUrl, mergeContextText, searchConfluenceDocuments } from './lib/context-source.mjs';
import {
  extractFigmaFileKeyFromUrl,
  fetchFigmaLibraryComponents,
  getLatestLibrarySync,
  mergeRegistryWithLibrary
} from './lib/library-sync.mjs';
import {
  approveRequest,
  cleanupOldApprovals,
  consumeByToken,
  createApprovalRequest,
  findByToken,
  getApproval,
  listApprovals,
  listExpiringApprovals
} from './lib/approval-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');
const registryPath = path.join(__dirname, 'ds-registry.json');
const registry = loadRegistry(registryPath);
const figmaEventsLog = [];
const bundleOutputRoot = path.join(__dirname, 'generated', 'exports');
const runHistoryPath = path.join(__dirname, 'generated', 'run-history', 'pipeline-runs.jsonl');
const projectsRoot = path.join(__dirname, 'generated', 'projects');
const approvalStorePath = path.join(__dirname, 'generated', 'approvals', 'requests.json');
const librarySyncRoot = path.join(__dirname, 'generated', 'library-sync');

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8'
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

function withCors(headers = {}) {
  return { ...corsHeaders, ...headers };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function sendJSON(res, statusCode, body) {
  res.writeHead(statusCode, withCors({ 'Content-Type': 'application/json; charset=utf-8' }));
  res.end(JSON.stringify(body, null, 2));
}

function evaluateStageCompliance(validation, stage, allowNew = true) {
  return evaluateCompliance({
    validation,
    stage,
    policy: registry.compliance_policy || {},
    allowNew
  });
}

function getMissingComponentKeys() {
  const components = registry.components || [];
  const keyMap = registry.component_keys || {};
  return components.filter((name) => !keyMap[name]);
}

function evaluateDeployGuard() {
  const guard = registry.deploy_guard || {};
  if (guard.enabled === false) {
    return { blocked: false, issues: [] };
  }

  const issues = [];
  if (guard.require_component_keys_on_deploy !== false) {
    const missing = getMissingComponentKeys();
    if (missing.length > 0) {
      issues.push({
        code: 'missing_component_keys',
        message: 'component_keys mapping is incomplete for deploy actions.',
        detail: { missing }
      });
    }
  }

  if (guard.require_storybook_src_dir !== false && !process.env.STORYBOOK_SRC_DIR) {
    issues.push({
      code: 'storybook_src_dir_required',
      message: 'STORYBOOK_SRC_DIR environment variable is required for deploy actions.'
    });
  }

  return {
    blocked: issues.length > 0,
    issues
  };
}


function resolveApprovalPolicy() {
  const policy = registry.approval_policy || {};
  return {
    enabled: policy.enabled !== false,
    stage: policy.stage || 'deploy',
    requireFor: Array.isArray(policy.require_for) ? policy.require_for : ['Major', 'Critical'],
    allowedRoles: Array.isArray(policy.allowed_roles) ? policy.allowed_roles : ['design_lead'],
    actionRoles: policy.action_roles || {},
    tokenTtlMinutes: Number(policy.token_ttl_minutes || 60),
    oneTimeToken: policy.one_time_token !== false
  };
}

function requiresApproval(validation = [], stage = 'deploy') {
  const policy = resolveApprovalPolicy();
  if (!policy.enabled || policy.stage !== stage) {
    return false;
  }
  return validation.some((item) => policy.requireFor.includes(item.severity));
}

function buildExpiryIso(ttlMinutes) {
  return new Date(Date.now() + Math.max(1, Number(ttlMinutes || 60)) * 60 * 1000).toISOString();
}

function isApprovalExpired(approval) {
  if (!approval) return true;
  if (approval.expiresAt) {
    return Date.now() > new Date(approval.expiresAt).getTime();
  }
  return false;
}

function ensureApproval({ approvalToken, validation, stage, action, scope, projectId, metadata }) {
  const approvalPolicy = resolveApprovalPolicy();
  if (!requiresApproval(validation, stage)) {
    return { ok: true, approval: null };
  }

  const approved = findByToken(approvalStorePath, approvalToken);
  if (approved) {
    const used = approved.tokenStatus === 'used';
    const expired = isApprovalExpired(approved);
    if (!used && !expired) {
      if (approvalPolicy.oneTimeToken) {
        const consumed = consumeByToken(approvalStorePath, approvalToken, action);
        return { ok: true, approval: consumed || approved };
      }
      return { ok: true, approval: approved };
    }
  }

  const request = createApprovalRequest(approvalStorePath, {
    action,
    stage,
    scope,
    projectId,
    reason: 'Policy requires approval for Major/Critical severity before deploy action.',
    requiredRoles: Array.isArray(approvalPolicy.actionRoles?.[action]) && approvalPolicy.actionRoles[action].length > 0
      ? approvalPolicy.actionRoles[action]
      : approvalPolicy.allowedRoles,
    expiresAt: buildExpiryIso(approvalPolicy.tokenTtlMinutes),
    summary: {
      severities: validation.reduce((acc, row) => {
        acc[row.severity] = (acc[row.severity] || 0) + 1;
        return acc;
      }, {})
    },
    metadata
  });

  return { ok: false, request };
}

function pushFigmaEvent(eventName, payload) {
  const entry = {
    id: `evt_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    eventName,
    at: new Date().toISOString(),
    payload
  };
  figmaEventsLog.unshift(entry);
  figmaEventsLog.splice(20);
  return entry;
}

async function resolveContextInput(body = {}) {
  const contextUrlRaw = String(body.contextUrl || '').trim();
  const contextTextInline = String(body.contextText || '').trim();
  let fetched = null;
  if (contextUrlRaw && !contextTextInline) {
    fetched = await fetchContextFromUrl(contextUrlRaw);
  }
  const contextText = contextTextInline || (fetched ? fetched.extractedText : '');
  const selectionContext = String(body.selectionContext || '').trim();
  const editInstruction = String(body.editInstruction || '').trim();
  const prompt = mergeContextText({
    prompt: body.prompt || '',
    contextText,
    selectionContext,
    editInstruction
  });
  return {
    prompt,
    contextUrl: fetched?.contextUrl || contextUrlRaw || null,
    contextText,
    contextSource: fetched ? 'url' : contextTextInline ? 'inline' : 'none',
    contextSignals: fetched?.signals || {},
    selectionContext,
    editInstruction
  };
}

function serveStatic(req, res) {
  const rawPath = req.url === '/' ? '/index.html' : req.url;
  const safePath = path.normalize(rawPath).replace(/^\.\.+/, '');
  const target = path.join(publicDir, safePath);

  if (!target.startsWith(publicDir)) {
    res.writeHead(403, withCors());
    res.end('Forbidden');
    return;
  }

  fs.readFile(target, (err, data) => {
    if (err) {
      res.writeHead(404, withCors());
      res.end('Not Found');
      return;
    }

    const ext = path.extname(target);
    res.writeHead(200, withCors({ 'Content-Type': mime[ext] || 'text/plain; charset=utf-8' }));
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, withCors());
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, 'http://localhost');
  const pathname = requestUrl.pathname;
  const pathSegments = pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && pathname === '/api/health') {
    sendJSON(res, 200, { ok: true, service: 'ds-copilot-demo' });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/registry') {
    sendJSON(res, 200, registry);
    return;
  }

  if (req.method === 'GET' && pathname === '/api/figma/library/status') {
    const latest = getLatestLibrarySync(librarySyncRoot);
    sendJSON(res, 200, {
      ok: true,
      latest,
      mappedCount: Object.values(registry.component_keys || {}).filter(Boolean).length,
      totalComponents: Array.isArray(registry.components) ? registry.components.length : 0
    });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/figma/library/sync') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const dryRun = body.dryRun !== false;
      let components = Array.isArray(body.components) ? body.components : [];
      let source = 'payload';
      const sourceUrls = Array.isArray(body.libraryUrls)
        ? body.libraryUrls.map((url) => String(url || '').trim()).filter(Boolean)
        : [];

      if (components.length === 0 && sourceUrls.length > 0) {
        const token = body.token || process.env.FIGMA_ACCESS_TOKEN || '';
        if (!token) {
          throw new Error('FIGMA_ACCESS_TOKEN is required for libraryUrls sync');
        }
        const keys = sourceUrls
          .map((url) => ({ url, key: extractFigmaFileKeyFromUrl(url) }))
          .filter((item) => item.key);
        if (keys.length === 0) {
          throw new Error('No valid Figma library URL found');
        }

        const merged = [];
        for (const entry of keys) {
          const rows = await fetchFigmaLibraryComponents({ fileKey: entry.key, token });
          merged.push(...rows.map((item) => ({ ...item, libraryUrl: entry.url, libraryFileKey: entry.key })));
        }
        components = merged;
        source = 'figma_api_multi';
      }

      if (components.length === 0) {
        const fileKey = body.fileKey || process.env.FIGMA_LIBRARY_FILE_KEY || '';
        const token = body.token || process.env.FIGMA_ACCESS_TOKEN || '';
        components = await fetchFigmaLibraryComponents({ fileKey, token });
        source = 'figma_api_single';
      }

      const report = mergeRegistryWithLibrary({
        registryPath,
        components,
        outputRoot: librarySyncRoot,
        source,
        dryRun
      });
      if (!dryRun) {
        Object.assign(registry, loadRegistry(registryPath));
      }

      sendJSON(res, 200, {
        ok: true,
        report,
        usage: {
          dryRun,
          source,
          libraryUrls: sourceUrls,
          applied: !dryRun
        }
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to sync Figma library', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/data-schema/fetch') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      if (!body.url) {
        sendJSON(res, 400, { error: 'url is required' });
        return;
      }
      const fetched = await fetchSchemaFromUrl(body.url);
      sendJSON(res, 200, { ok: true, ...fetched });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to fetch schema', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/context/fetch') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const context = await resolveContextInput(body);
      sendJSON(res, 200, {
        ok: true,
        contextUrl: context.contextUrl,
        contextText: context.contextText,
        contextSource: context.contextSource,
        contextSignals: context.contextSignals
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to fetch context', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/context/search') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const items = await searchConfluenceDocuments(body.query || '');
      sendJSON(res, 200, { ok: true, items, count: items.length });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to search Confluence', detail: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/approvals') {
    const status = requestUrl.searchParams.get('status') || '';
    const items = listApprovals(approvalStorePath, status);
    const summary = items.reduce((acc, item) => {
      const key = item.effectiveStatus || item.status || 'unknown';
      acc[key] = (acc[key] || 0) + 1;
      if (item.expiringSoon) {
        acc.expiringSoon = (acc.expiringSoon || 0) + 1;
      }
      return acc;
    }, {});
    sendJSON(res, 200, { items, summary });
    return;
  }

  if (req.method === 'GET' && pathname === '/api/approvals/alerts') {
    const minutes = Number(requestUrl.searchParams.get('minutes') || 10);
    const items = listExpiringApprovals(approvalStorePath, minutes);
    sendJSON(res, 200, { thresholdMinutes: minutes, count: items.length, items });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/approvals/cleanup') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const olderThanDays = Number(body.olderThanDays || 30);
      const result = cleanupOldApprovals(approvalStorePath, olderThanDays);
      sendJSON(res, 200, { ok: true, olderThanDays, ...result });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to cleanup approvals', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/approvals/request') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const request = createApprovalRequest(approvalStorePath, body);
      sendJSON(res, 201, { ok: true, request });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to request approval', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/approvals/approve') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      if (!body.requestId) {
        sendJSON(res, 400, { error: 'requestId is required' });
        return;
      }
      const current = getApproval(approvalStorePath, body.requestId);
      if (!current) {
        sendJSON(res, 404, { error: 'Approval request not found' });
        return;
      }
      const approverRole = body.approverRole || 'viewer';
      const requiredRoles = Array.isArray(current.requiredRoles) ? current.requiredRoles : [];
      if (requiredRoles.length > 0 && !requiredRoles.includes(approverRole)) {
        sendJSON(res, 403, {
          error: 'Approver role is not allowed',
          requiredRoles,
          approverRole
        });
        return;
      }
      const approved = approveRequest(
        approvalStorePath,
        body.requestId,
        body.approver || 'unknown',
        approverRole,
        body.comment || ''
      );
      sendJSON(res, 200, { ok: true, approved });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to approve request', detail: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/approvals/')) {
    const id = decodeURIComponent(pathname.replace('/api/approvals/', ''));
    const item = getApproval(approvalStorePath, id);
    if (!item) {
      sendJSON(res, 404, { error: 'Approval not found' });
      return;
    }
    sendJSON(res, 200, { item });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/compliance/check') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const stage = body.stage || 'validation';
      const allowNew = body.allowNew !== false;
      const fidelity = body.fidelity || 'prototype';
      const resolvedSchema = await resolveSchemaInput({
        dataSchema: body.dataSchema || '',
        dataSchemaUrl: body.dataSchemaUrl || ''
      });
      const validation = Array.isArray(body.validation)
        ? body.validation
        : validatePlan(buildPlan(body.prompt || '', resolvedSchema.dataSchema, registry, { fidelity }), registry);
      const result = evaluateStageCompliance(validation, stage, allowNew);

      sendJSON(res, 200, {
        ok: !result.blocked,
        stage,
        validation,
        compliance: result
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Invalid compliance request', detail: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/projects') {
    sendJSON(res, 200, { items: listProjects(projectsRoot) });
    return;
  }

  if (req.method === 'POST' && pathname === '/api/projects') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const project = createProject(projectsRoot, body);
      sendJSON(res, 201, { ok: true, project });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to create project', detail: error.message });
    }
    return;
  }

  if (pathSegments[0] === 'api' && pathSegments[1] === 'projects' && pathSegments[2]) {
    const projectId = decodeURIComponent(pathSegments[2]);

    if (req.method === 'GET' && pathSegments.length === 3) {
      try {
        sendJSON(res, 200, { project: getProject(projectsRoot, projectId) });
      } catch (error) {
        sendJSON(res, 404, { error: error.message });
      }
      return;
    }

    if (req.method === 'PATCH' && pathSegments.length === 3) {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const project = updateProject(projectsRoot, projectId, body);
        sendJSON(res, 200, { ok: true, project });
      } catch (error) {
        sendJSON(res, 400, { error: 'Failed to update project', detail: error.message });
      }
      return;
    }

    if (req.method === 'POST' && pathSegments[3] === 'generate') {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const context = await resolveContextInput(body);
        const guard = evaluateDeployGuard();
        if (guard.blocked) {
          sendJSON(res, 412, {
            error: 'Deploy guard blocked',
            deployGuard: guard
          });
          return;
        }
        const project = getProject(projectsRoot, projectId);
        const runInput = buildProjectRunInput(project, body);
        const effectivePrompt = context.prompt || runInput.prompt;
        const resolvedSchema = await resolveSchemaInput({
          dataSchema: runInput.dataSchema,
          dataSchemaUrl: runInput.dataSchemaUrl || body.dataSchemaUrl || project.dataSchemaUrl || ''
        });
        const prePlan = buildPlan(effectivePrompt, resolvedSchema.dataSchema, registry, {
          fidelity: runInput.fidelity,
          contextUrl: context.contextUrl,
          selectionContext: context.selectionContext,
          editInstruction: context.editInstruction,
          contextHints: context.contextSignals
        });
        const preValidation = validatePlan(prePlan, registry);
        const approvalCheck = ensureApproval({
          approvalToken: body.approvalToken,
          validation: preValidation,
          stage: 'deploy',
          action: 'project_generate',
          scope: 'project',
          projectId,
          metadata: { fidelity: runInput.fidelity }
        });
        if (!approvalCheck.ok) {
          sendJSON(res, 403, {
            error: 'Approval required',
            approvalRequired: true,
            request: approvalCheck.request
          });
          return;
        }

        const pipelineResult = runPipeline({
          prompt: effectivePrompt,
          dataSchema: resolvedSchema.dataSchema,
          fidelity: runInput.fidelity,
          outputName: body.outputName,
          registry,
          outputRoot: bundleOutputRoot
        });

        if (!pipelineResult.ok) {
          sendJSON(res, 400, pipelineResult);
          return;
        }

        const revision = appendProjectRevision(projectsRoot, projectId, {
          kind: 'generate',
          prompt: body.prompt || '',
          dataSchema: resolvedSchema.dataSchema,
          dataSchemaUrl: resolvedSchema.dataSchemaUrl,
          fidelity: runInput.fidelity,
          result: {
            outputName: pipelineResult.saved.outputName,
            outputDir: pipelineResult.saved.outputDir,
            manifestPath: pipelineResult.saved.manifestPath,
            componentCount: pipelineResult.plan.components.length,
            validationCount: pipelineResult.validation.length
          }
        });

        sendJSON(res, 200, {
          ok: true,
          projectId,
          revision,
          runInput: { ...runInput, prompt: effectivePrompt },
          dataSchemaSource: resolvedSchema.source,
          dataSchemaUrl: resolvedSchema.dataSchemaUrl,
          contextSource: context.contextSource,
          contextUrl: context.contextUrl,
          outputName: pipelineResult.saved.outputName,
          outputDir: pipelineResult.saved.outputDir,
          manifestPath: pipelineResult.saved.manifestPath,
          compliance: pipelineResult.compliance
        });
      } catch (error) {
        sendJSON(res, 400, { error: 'Project generation failed', detail: error.message });
      }
      return;
    }

    if (req.method === 'POST' && pathSegments[3] === 'generate-matrix') {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const project = getProject(projectsRoot, projectId);
        const context = await resolveContextInput({
          ...body,
          prompt: body.prompt || project.prd || project.onePager || ''
        });
        const prompt = context.prompt || '';
        const resolvedSchema = await resolveSchemaInput({
          dataSchema: body.dataSchema || project.dataSchema || '',
          dataSchemaUrl: body.dataSchemaUrl || project.dataSchemaUrl || ''
        });
        const rankingContext = resolveRankingContext({ body, project });
        const matrixResult = buildMatrixResult({
          prompt,
          dataSchema: resolvedSchema.dataSchema,
          registry,
          evaluateComplianceFn: evaluateStageCompliance,
          rankingContext,
          options: {
            contextUrl: context.contextUrl,
            selectionContext: context.selectionContext,
            editInstruction: context.editInstruction,
            contextHints: context.contextSignals
          }
        });

        sendJSON(res, 200, {
          inputSummary: {
            prompt,
            hasDataSchema: Boolean(resolvedSchema.dataSchema),
            dataSchemaSource: resolvedSchema.source,
            dataSchemaUrl: resolvedSchema.dataSchemaUrl,
            projectId,
            contextSource: context.contextSource,
            contextUrl: context.contextUrl
          },
          ranking: {
            preset: rankingContext.preset,
            policy: rankingContext.policy
          },
          recommendation: matrixResult.recommendation,
          componentKeys: registry.component_keys || {},
          componentLayouts: registry.component_layouts || {},
          layoutStrategy: registry.layout_strategy || {},
          patternStrategy: registry.pattern_strategy || {},
          matrix: matrixResult.ranked
        });
      } catch (error) {
        sendJSON(res, 400, { error: 'Project matrix generation failed', detail: error.message });
      }
      return;
    }
  }

  if (req.method === 'POST' && pathname === '/api/generate') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const context = await resolveContextInput(body);
      const prompt = context.prompt || '';
      const resolvedSchema = await resolveSchemaInput({
        dataSchema: body.dataSchema || '',
        dataSchemaUrl: body.dataSchemaUrl || ''
      });
      const fidelity = body.fidelity || 'prototype';
      const selection = body.selection || null;

      const plan = buildPlan(prompt, resolvedSchema.dataSchema, registry, {
        fidelity,
        contextUrl: context.contextUrl,
        selectionContext: context.selectionContext,
        editInstruction: context.editInstruction,
        contextHints: context.contextSignals
      });
      const issues = validatePlan(plan, registry);
      const compliance = evaluateStageCompliance(issues, 'generation', true);

      sendJSON(res, 200, {
        inputSummary: {
          prompt,
          hasDataSchema: Boolean(resolvedSchema.dataSchema),
          dataSchemaSource: resolvedSchema.source,
          dataSchemaUrl: resolvedSchema.dataSchemaUrl,
          fidelity,
          selection,
          contextSource: context.contextSource,
          contextUrl: context.contextUrl
        },
        plan,
        ir: planToIR(plan),
        componentKeys: registry.component_keys || {},
        componentLayouts: registry.component_layouts || {},
        layoutStrategy: registry.layout_strategy || {},
        patternStrategy: registry.pattern_strategy || {},
        validation: issues,
        compliance,
        figmaEvents: buildFigmaEvents(plan, registry)
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Invalid request', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/generate-matrix') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const context = await resolveContextInput(body);
      const prompt = context.prompt || '';
      const resolvedSchema = await resolveSchemaInput({
        dataSchema: body.dataSchema || '',
        dataSchemaUrl: body.dataSchemaUrl || ''
      });
      const projectId = body.projectId || '';
      const project = projectId ? getProject(projectsRoot, projectId) : null;
      const rankingContext = resolveRankingContext({ body, project });
      const matrixResult = buildMatrixResult({
        prompt,
        dataSchema: resolvedSchema.dataSchema,
        registry,
        evaluateComplianceFn: evaluateStageCompliance,
        rankingContext,
        options: {
          contextUrl: context.contextUrl,
          selectionContext: context.selectionContext,
          editInstruction: context.editInstruction,
          contextHints: context.contextSignals
        }
      });

      sendJSON(res, 200, {
        inputSummary: {
          prompt,
          hasDataSchema: Boolean(resolvedSchema.dataSchema),
          dataSchemaSource: resolvedSchema.source,
          dataSchemaUrl: resolvedSchema.dataSchemaUrl,
          projectId: project?.id || null,
          contextSource: context.contextSource,
          contextUrl: context.contextUrl
        },
        ranking: {
          preset: rankingContext.preset,
          policy: rankingContext.policy
        },
        recommendation: matrixResult.recommendation,
        componentKeys: registry.component_keys || {},
        componentLayouts: registry.component_layouts || {},
        layoutStrategy: registry.layout_strategy || {},
        patternStrategy: registry.pattern_strategy || {},
        matrix: matrixResult.ranked
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Invalid matrix request', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/code-export') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const prompt = body.prompt || '';
      const resolvedSchema = await resolveSchemaInput({
        dataSchema: body.dataSchema || '',
        dataSchemaUrl: body.dataSchemaUrl || ''
      });
      const fidelity = body.fidelity || body.plan?.fidelity || 'prototype';
      const plan = body.plan || buildPlan(prompt, resolvedSchema.dataSchema, registry, { fidelity });
      const ir = body.ir || planToIR(plan);
      const validation = validatePlan(plan, registry);
      const compliance = evaluateStageCompliance(validation, 'validation', true);

      if (compliance.blocked) {
        sendJSON(res, 400, {
          error: 'Validation compliance failed',
          blocked: compliance.blockedItems,
          compliance
        });
        return;
      }

      sendJSON(res, 200, {
        framework: 'react',
        styling: 'tailwind',
        dsPackage: '@yeo/ds-core',
        ir,
        compliance,
        code: irToReactCode(ir)
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Invalid request', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/code-export-bundle') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const prompt = body.prompt || '';
      const resolvedSchema = await resolveSchemaInput({
        dataSchema: body.dataSchema || '',
        dataSchemaUrl: body.dataSchemaUrl || ''
      });
      const fidelity = body.fidelity || body.plan?.fidelity || 'prototype';
      const plan = body.plan || buildPlan(prompt, resolvedSchema.dataSchema, registry, { fidelity });
      const ir = body.ir || planToIR(plan);
      const validation = validatePlan(plan, registry);
      const compliance = evaluateStageCompliance(validation, 'validation', true);

      if (compliance.blocked) {
        sendJSON(res, 400, {
          error: 'Validation compliance failed',
          blocked: compliance.blockedItems,
          compliance
        });
        return;
      }

      sendJSON(res, 200, {
        ir,
        compliance,
        bundle: buildCodeBundle(ir)
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Invalid request', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/code-export-bundle/save') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const guard = evaluateDeployGuard();
      if (guard.blocked) {
        sendJSON(res, 412, {
          error: 'Deploy guard blocked',
          deployGuard: guard
        });
        return;
      }
      const prompt = body.prompt || '';
      const resolvedSchema = await resolveSchemaInput({
        dataSchema: body.dataSchema || '',
        dataSchemaUrl: body.dataSchemaUrl || ''
      });
      const fidelity = body.fidelity || body.plan?.fidelity || 'prototype';
      const plan = body.plan || buildPlan(prompt, resolvedSchema.dataSchema, registry, { fidelity });
      const ir = body.ir || planToIR(plan);
      const validation = validatePlan(plan, registry);
      const compliance = evaluateStageCompliance(validation, 'deploy', true);

      if (compliance.blocked) {
        sendJSON(res, 400, {
          error: 'Deploy compliance failed',
          blocked: compliance.blockedItems,
          compliance
        });
        return;
      }

      const approvalCheck = ensureApproval({
        approvalToken: body.approvalToken,
        validation,
        stage: 'deploy',
        action: 'bundle_save',
        scope: 'global',
        projectId: body.projectId || null,
        metadata: { outputName: body.outputName || null }
      });
      if (!approvalCheck.ok) {
        sendJSON(res, 403, {
          error: 'Approval required',
          approvalRequired: true,
          request: approvalCheck.request
        });
        return;
      }

      const bundle = buildCodeBundle(ir);
      const saved = saveBundle(bundleOutputRoot, body.outputName, bundle);

      sendJSON(res, 200, {
        ok: true,
        compliance,
        outputName: saved.outputName,
        outputDir: saved.outputDir,
        files: saved.files
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to save bundle', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/pipeline/run') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const guard = evaluateDeployGuard();
      if (guard.blocked) {
        sendJSON(res, 412, {
          error: 'Deploy guard blocked',
          deployGuard: guard
        });
        return;
      }
      const resolvedSchema = await resolveSchemaInput({
        dataSchema: body.dataSchema || '',
        dataSchemaUrl: body.dataSchemaUrl || ''
      });
      const result = runPipeline({
        prompt: body.prompt || '',
        dataSchema: resolvedSchema.dataSchema,
        fidelity: body.fidelity || 'prototype',
        outputName: body.outputName,
        registry,
        outputRoot: bundleOutputRoot
      });

      if (!result.ok) {
        sendJSON(res, 400, result);
        return;
      }

      const approvalCheck = ensureApproval({
        approvalToken: body.approvalToken,
        validation: result.validation || [],
        stage: 'deploy',
        action: 'pipeline_run',
        scope: 'global',
        projectId: body.projectId || null,
        metadata: { outputName: body.outputName || null }
      });
      if (!approvalCheck.ok) {
        sendJSON(res, 403, {
          error: 'Approval required',
          approvalRequired: true,
          request: approvalCheck.request
        });
        return;
      }

      const runEntry = {
        id: `run_${Date.now()}`,
        at: new Date().toISOString(),
        title: result.plan.title,
        outputName: result.saved.outputName,
        outputDir: result.saved.outputDir,
        manifestPath: result.saved.manifestPath,
        criticalCount: result.compliance?.counts?.Critical || 0,
        componentCount: result.plan.components.length
      };
      appendRunHistory(runHistoryPath, runEntry);

      const autoEvents = [
        pushFigmaEvent('onDesignRequest', result.figmaEvents?.onDesignRequest || {}),
        pushFigmaEvent('onAssetValidation', result.figmaEvents?.onAssetValidation || {}),
        pushFigmaEvent('onCodeExport', result.figmaEvents?.onCodeExport || {})
      ];

      sendJSON(res, 200, {
        ok: true,
        outputName: result.saved.outputName,
        outputDir: result.saved.outputDir,
        manifestPath: result.saved.manifestPath,
        files: result.saved.files,
        compliance: result.compliance,
        runEntry,
        autoEvents
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Pipeline failed', detail: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/code-export-bundle/saved') {
    try {
      sendJSON(res, 200, { items: listBundles(bundleOutputRoot) });
    } catch (error) {
      sendJSON(res, 500, { error: 'Failed to list bundles', detail: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/code-export-bundle/saved/')) {
    try {
      const name = decodeURIComponent(pathname.replace('/api/code-export-bundle/saved/', ''));
      sendJSON(res, 200, inspectBundle(bundleOutputRoot, name));
    } catch (error) {
      if (error.message.includes('not found')) {
        sendJSON(res, 404, { error: error.message });
        return;
      }
      sendJSON(res, 500, { error: 'Failed to inspect bundle', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/code-export-bundle/archive') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      if (!body.name) {
        sendJSON(res, 400, { error: 'Bundle name is required' });
        return;
      }
      const archived = createBundleArchive(bundleOutputRoot, body.name);
      sendJSON(res, 200, {
        ok: true,
        name: archived.name,
        archiveFileName: archived.archiveFileName
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to create archive', detail: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/code-export-bundle/archive/')) {
    try {
      const name = decodeURIComponent(pathname.replace('/api/code-export-bundle/archive/', ''));
      const archived = createBundleArchive(bundleOutputRoot, name);
      res.writeHead(200, {
        'Content-Type': 'application/gzip',
        'Content-Disposition': `attachment; filename=\"${archived.archiveFileName}\"`
      });
      fs.createReadStream(archived.archivePath).pipe(res);
    } catch (error) {
      sendJSON(res, 400, { error: 'Failed to stream archive', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname === '/api/ir') {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const prompt = body.prompt || '';
      const dataSchema = body.dataSchema || '';
      const fidelity = body.fidelity || body.plan?.fidelity || 'prototype';
      const plan = body.plan || buildPlan(prompt, dataSchema, registry, { fidelity });
      sendJSON(res, 200, {
        ir: planToIR(plan)
      });
    } catch (error) {
      sendJSON(res, 400, { error: 'Invalid request', detail: error.message });
    }
    return;
  }

  if (req.method === 'POST' && pathname.startsWith('/api/figma/events/')) {
    try {
      const raw = await readBody(req);
      const body = JSON.parse(raw || '{}');
      const eventName = pathname.replace('/api/figma/events/', '');
      const accepted = ['onDesignRequest', 'onAssetValidation', 'onCodeExport'];

      if (!accepted.includes(eventName)) {
        sendJSON(res, 404, { error: 'Unknown event' });
        return;
      }

      const entry = pushFigmaEvent(eventName, body);

      sendJSON(res, 200, { ok: true, entry });
    } catch (error) {
      sendJSON(res, 400, { error: 'Invalid event payload', detail: error.message });
    }
    return;
  }

  if (req.method === 'GET' && pathname === '/api/figma/events') {
    sendJSON(res, 200, { items: figmaEventsLog });
    return;
  }

  if (req.method === 'GET' && pathname.startsWith('/api/pipeline/runs')) {
    const limit = Number(requestUrl.searchParams.get('limit') || 50);
    sendJSON(res, 200, { items: readRunHistory(runHistoryPath, limit) });
    return;
  }

  serveStatic(req, res);
});

const PORT = process.env.PORT || 4173;
const HOST = process.env.HOST || '0.0.0.0';
server.listen(PORT, HOST, () => {
  console.log(`DS Copilot demo is running at http://${HOST}:${PORT}`);
});
