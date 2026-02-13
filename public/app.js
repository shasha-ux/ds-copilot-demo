const promptEl = document.getElementById('prompt');
const schemaUrlEl = document.getElementById('schemaUrl');
const schemaEl = document.getElementById('schema');
const fidelityEl = document.getElementById('fidelity');
const generateBtn = document.getElementById('generateBtn');
const generateMatrixBtn = document.getElementById('generateMatrixBtn');
const runAllBtn = document.getElementById('runAllBtn');
const codeExportBtn = document.getElementById('codeExportBtn');
const bundleExportBtn = document.getElementById('bundleExportBtn');
const bundleSaveBtn = document.getElementById('bundleSaveBtn');
const bundleArchiveBtn = document.getElementById('bundleArchiveBtn');
const projectNameEl = document.getElementById('projectName');
const rankingPresetEl = document.getElementById('rankingPreset');
const rankingPolicyOverrideEl = document.getElementById('rankingPolicyOverride');
const createProjectBtn = document.getElementById('createProjectBtn');
const saveProjectConfigBtn = document.getElementById('saveProjectConfigBtn');
const runProjectBtn = document.getElementById('runProjectBtn');
const listProjectsBtn = document.getElementById('listProjectsBtn');
const approvalRequestIdEl = document.getElementById('approvalRequestId');
const approverNameEl = document.getElementById('approverName');
const approverRoleEl = document.getElementById('approverRole');
const approvalStatusFilterEl = document.getElementById('approvalStatusFilter');
const listApprovalsBtn = document.getElementById('listApprovalsBtn');
const alertApprovalsBtn = document.getElementById('alertApprovalsBtn');
const cleanupApprovalsBtn = document.getElementById('cleanupApprovalsBtn');
const approveRequestBtn = document.getElementById('approveRequestBtn');
const tplCancelBtn = document.getElementById('tplCancelBtn');
const tplListBtn = document.getElementById('tplListBtn');
const tplNewBizBtn = document.getElementById('tplNewBizBtn');
const loadDataSampleBtn = document.getElementById('loadDataSampleBtn');
const loadSwaggerSampleBtn = document.getElementById('loadSwaggerSampleBtn');
const loadSchemaUrlBtn = document.getElementById('loadSchemaUrlBtn');
const clearSchemaBtn = document.getElementById('clearSchemaBtn');
const copyCodeBtn = document.getElementById('copyCodeBtn');
const copyBundleBtn = document.getElementById('copyBundleBtn');

const workflowStatusEl = document.getElementById('workflowStatus');
const projectStatusEl = document.getElementById('projectStatus');
const approvalStatusEl = document.getElementById('approvalStatus');
const kpiBarEl = document.getElementById('kpiBar');
const summaryEl = document.getElementById('summary');
const stateTabsEl = document.getElementById('stateTabs');
const previewEl = document.getElementById('preview');
const validationEl = document.getElementById('validation');
const matrixOutputEl = document.getElementById('matrixOutput');
const figmaPayloadEl = document.getElementById('figmaPayload');
const codeExportEl = document.getElementById('codeExport');
const bundleExportEl = document.getElementById('bundleExport');
const savedBundlesEl = document.getElementById('savedBundles');
const bundleArchiveEl = document.getElementById('bundleArchive');
const projectOutputEl = document.getElementById('projectOutput');
const approvalOutputEl = document.getElementById('approvalOutput');

const SAMPLE_PROMPTS = {
  cancel: '예약 취소 팝업을 만들어줘. 취소 사유를 선택하면 하단 상세 입력창이 나오고 완료 시 토스트 메시지가 떠야 해.',
  list: '예약 리스트 화면을 만들어줘. 상태 필터, 검색, 대량 선택 액션이 필요해.',
  newbiz: '신사업 신규 온보딩 화면을 만들어줘. 단계별 입력, 유효성 검사, 저장 후 확인 토스트가 필요해.'
};

const SAMPLE_SCHEMA_JSON = `{
  "rows": [
    {
      "reservationId": "R-240211-001",
      "partnerName": "강남점",
      "status": "pending",
      "cancelReason": "고객요청"
    },
    {
      "reservationId": "R-240211-002",
      "partnerName": "홍대점",
      "status": "confirmed",
      "cancelReason": "중복예약"
    }
  ]
}`;

const SAMPLE_SCHEMA_SWAGGER = `{
  "openapi": "3.0.0",
  "paths": {
    "/api/partners/reservations": {
      "get": {
        "responses": {
          "200": { "description": "OK" }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "Reservation": {
        "type": "object",
        "properties": {
          "reservationId": { "type": "string" },
          "partnerName": { "type": "string" },
          "status": { "type": "string", "enum": ["pending", "confirmed", "canceled"] },
          "cancelReason": { "type": "string", "enum": ["고객요청", "중복예약", "기타"] }
        }
      }
    }
  }
}`;

let latest = null;
let currentState = 'normal';
let currentProjectId = '';
let approvalToken = '';
const DRAFT_STORAGE_KEY = 'ds-copilot-designer-draft-v1';

function parseJSON(text, fallback = {}) {
  try {
    return text ? JSON.parse(text) : fallback;
  } catch {
    return fallback;
  }
}

function saveDraft() {
  const payload = {
    prompt: promptEl.value,
    schemaUrl: schemaUrlEl.value,
    schema: schemaEl.value,
    fidelity: fidelityEl.value,
    projectName: projectNameEl.value,
    rankingPreset: rankingPresetEl.value,
    rankingPolicyOverride: rankingPolicyOverrideEl.value
  };
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
}

function loadDraft() {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
  if (!raw) return;
  const draft = parseJSON(raw, null);
  if (!draft) return;
  if (typeof draft.prompt === 'string') promptEl.value = draft.prompt;
  if (typeof draft.schemaUrl === 'string') schemaUrlEl.value = draft.schemaUrl;
  if (typeof draft.schema === 'string') schemaEl.value = draft.schema;
  if (typeof draft.fidelity === 'string') fidelityEl.value = draft.fidelity;
  if (typeof draft.projectName === 'string') projectNameEl.value = draft.projectName;
  if (typeof draft.rankingPreset === 'string') rankingPresetEl.value = draft.rankingPreset;
  if (typeof draft.rankingPolicyOverride === 'string') rankingPolicyOverrideEl.value = draft.rankingPolicyOverride;
}

function escapeHTML(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function setStatus(flowText) {
  workflowStatusEl.textContent = `Flow: ${flowText}`;
  projectStatusEl.textContent = `Project: ${currentProjectId || 'none'}`;
  approvalStatusEl.textContent = `Approval: ${approvalToken ? 'approved token active' : 'none'}`;
}

function renderTabs(states) {
  stateTabsEl.innerHTML = (states || [])
    .map((state) => {
      const active = state === currentState ? 'active' : '';
      return `<button class="state-tab ${active}" data-state="${state}">${state}</button>`;
    })
    .join('');

  stateTabsEl.querySelectorAll('.state-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      currentState = tab.dataset.state;
      renderOutput();
    });
  });
}

function renderKpi(plan, validation = []) {
  const dataContext = plan?.dataContext || {};
  const items = [
    { label: 'Components', value: plan?.components?.length || 0 },
    { label: 'Violations', value: validation.length || 0 },
    { label: 'States', value: plan?.states?.length || 0 },
    { label: 'Data Fields', value: dataContext?.fields?.length || 0 }
  ];
  kpiBarEl.innerHTML = items
    .map((item) => `<div class="kpi"><div class="k">${item.label}</div><div class="v">${item.value}</div></div>`)
    .join('');
}

function buildPreviewTable(rows = []) {
  if (!rows.length) return '<p>표시할 데이터가 없습니다.</p>';
  const first = rows[0] || {};
  const headers = Object.keys(first);
  const thead = headers.map((h) => `<th>${escapeHTML(h)}</th>`).join('');
  const bodyRows = rows.slice(0, 3).map((row) => {
    const tds = headers.map((h) => `<td>${escapeHTML(row[h] ?? '-')}</td>`).join('');
    return `<tr>${tds}</tr>`;
  }).join('');
  return `<table class="preview-table"><thead><tr>${thead}</tr></thead><tbody>${bodyRows}</tbody></table>`;
}

function renderPreview(plan, state) {
  const dataContext = plan?.dataContext || {};
  const reasonOptions = dataContext?.options?.cancelReason || ['고객요청', '중복예약', '기타'];
  const statusOptions = dataContext?.options?.status || ['pending', 'confirmed', 'canceled'];
  const rows = dataContext?.tableRows || [];
  const isListFlow = plan.components.includes('YEO_Table');

  const header = `
    <div class="preview-title">
      <h3>${escapeHTML(plan.title)}</h3>
      <span class="chip">${escapeHTML(state)}</span>
    </div>
    <p>${escapeHTML((plan.reasoning || []).join(' '))}</p>
  `;

  if (state === 'loading') {
    return `
      <div class="preview-card">
        ${header}
        <div class="modal">
          <p>Loading...</p>
          <div class="chip">Skeleton Line</div>
          <div class="chip">Skeleton Card</div>
          <div class="chip">Skeleton Button</div>
        </div>
      </div>
    `;
  }

  if (state === 'empty') {
    return `
      <div class="preview-card">
        ${header}
        <div class="modal">
          <p>데이터가 아직 없습니다. 필터 조건을 조정하거나 다시 조회하세요.</p>
          <button>재조회</button>
        </div>
      </div>
    `;
  }

  if (state === 'error') {
    return `
      <div class="preview-card">
        ${header}
        <div class="modal">
          <p>요청 처리 중 오류가 발생했습니다.</p>
          <div class="row">
            <button>재시도</button>
            <button>닫기</button>
          </div>
        </div>
      </div>
    `;
  }

  if (state === 'skeleton') {
    return `
      <div class="preview-card">
        ${header}
        <div class="modal">
          <div class="row"><div class="chip">Skeleton Filter</div><div class="chip">Skeleton Selector</div></div>
          <div class="row"><div class="chip">Skeleton Content</div></div>
          <div class="row"><div class="chip">Skeleton Action</div></div>
        </div>
      </div>
    `;
  }

  if (isListFlow) {
    return `
      <div class="preview-card">
        ${header}
        <div class="modal">
          <p>상태 필터</p>
          <div class="row">
            ${statusOptions.map((s) => `<span class="chip">${escapeHTML(s)}</span>`).join('')}
            <button>검색</button>
          </div>
          ${buildPreviewTable(rows)}
        </div>
      </div>
    `;
  }

  return `
    <div class="preview-card">
      ${header}
      <div class="modal">
        <p>취소 사유를 선택하세요.</p>
        <div class="row">
          ${reasonOptions.map((reason) => `<span class="chip">${escapeHTML(reason)}</span>`).join('')}
        </div>
        <div class="row">
          <textarea rows="3" placeholder="상세 사유 입력"></textarea>
        </div>
        <div class="row">
          <button>완료</button>
          <button>닫기</button>
        </div>
      </div>
    </div>
  `;
}

function renderOutput() {
  if (!latest) return;

  const { inputSummary, plan, validation, figmaEvents, compliance } = latest;
  renderKpi(plan, validation);

  summaryEl.innerHTML = `
    <h3>${escapeHTML(plan.title)}</h3>
    <p>Fidelity: <span class="chip">${escapeHTML(plan.fidelity || 'prototype')}</span> / Density: <span class="chip">${escapeHTML(plan.previewDensity || 'balanced')}</span></p>
    <p>컴포넌트: ${plan.components.map((component) => `<span class="chip">${escapeHTML(component)}</span>`).join('')}</p>
    <p>스키마 포함: ${inputSummary.hasDataSchema ? 'Yes' : 'No'} / 데이터 소스: ${escapeHTML(plan?.dataContext?.sourceType || 'none')}</p>
    <p>엔드포인트: <span class="chip">${escapeHTML(plan?.dataContext?.endpoint || '-')}</span></p>
    <p>${plan.reasoning.map((line) => `<span>${escapeHTML(line)}</span>`).join(' ')}</p>
    <div>${validation.map((item) => `<span class="badge ${item.severity}">${item.severity}</span>`).join('')}</div>
    <p>컴플라이언스(${escapeHTML(compliance?.stage || 'generation')}): ${compliance?.blocked ? 'BLOCKED' : 'PASS'}</p>
  `;

  renderTabs(plan.states || []);
  previewEl.innerHTML = renderPreview(plan, currentState);
  validationEl.textContent = JSON.stringify(validation, null, 2);
  figmaPayloadEl.textContent = JSON.stringify(figmaEvents, null, 2);
}

function setBusy(button, busyText, isBusy) {
  if (!button) return;
  if (!button.dataset.idleLabel) {
    button.dataset.idleLabel = button.textContent;
  }
  button.disabled = isBusy;
  button.textContent = isBusy ? busyText : button.dataset.idleLabel;
}

async function generate() {
  setBusy(generateBtn, 'Generating...', true);
  setStatus('generating');

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptEl.value,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value,
        fidelity: fidelityEl.value
      })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || 'Failed to generate');

    latest = data;
    currentState = 'normal';
    renderOutput();
    setStatus('generated');
  } catch (error) {
    summaryEl.innerHTML = `<p>오류: ${escapeHTML(error.message)}</p>`;
    setStatus('generate error');
  } finally {
    setBusy(generateBtn, 'Generating...', false);
  }
}

async function generateMatrix() {
  setBusy(generateMatrixBtn, 'Generating...', true);
  setStatus('matrix generating');
  try {
    const response = await fetch('/api/generate-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptEl.value,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value,
        projectId: currentProjectId || undefined,
        rankingPreset: rankingPresetEl.value,
        rankingPolicyOverride: parseJSON(rankingPolicyOverrideEl.value, {})
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to generate matrix');

    matrixOutputEl.textContent = JSON.stringify(
      {
        recommendation: data.recommendation || null,
        ranking: data.ranking || null,
        items: (data.matrix || []).map((item) => ({
          fidelity: item.fidelity,
          rankOrder: item.rank?.order || null,
          score: item.rank?.score || null,
          policy: item.rank?.breakdown?.policy || null,
          title: item.plan?.title,
          previewDensity: item.plan?.previewDensity,
          components: item.plan?.components || [],
          blocked: item.compliance?.blocked || false
        }))
      },
      null,
      2
    );
    setStatus('matrix ready');
  } catch (error) {
    matrixOutputEl.textContent = `Error: ${error.message}`;
    setStatus('matrix error');
  } finally {
    setBusy(generateMatrixBtn, 'Generating...', false);
  }
}

async function exportCode() {
  setBusy(codeExportBtn, 'Exporting...', true);
  setStatus('code exporting');
  try {
    if (!latest) await generate();
    const response = await fetch('/api/code-export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptEl.value,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value,
        fidelity: fidelityEl.value,
        plan: latest?.plan,
        ir: latest?.ir
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Code export failed');
    codeExportEl.textContent = data.code;
    setStatus('code ready');
  } catch (error) {
    codeExportEl.textContent = `Error: ${error.message}`;
    setStatus('code export error');
  } finally {
    setBusy(codeExportBtn, 'Exporting...', false);
  }
}

async function exportBundle() {
  setBusy(bundleExportBtn, 'Exporting...', true);
  setStatus('bundle exporting');
  try {
    if (!latest) await generate();
    const response = await fetch('/api/code-export-bundle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptEl.value,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value,
        fidelity: fidelityEl.value,
        plan: latest?.plan,
        ir: latest?.ir
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Bundle export failed');

    const files = data?.bundle?.files || {};
    const preview = Object.entries(files).reduce((acc, [name, content]) => {
      acc[name] = String(content).slice(0, 180);
      return acc;
    }, {});
    bundleExportEl.textContent = JSON.stringify(
      {
        framework: data?.bundle?.framework,
        styling: data?.bundle?.styling,
        fileCount: Object.keys(files).length,
        preview
      },
      null,
      2
    );
    setStatus('bundle ready');
  } catch (error) {
    bundleExportEl.textContent = `Error: ${error.message}`;
    setStatus('bundle export error');
  } finally {
    setBusy(bundleExportBtn, 'Exporting...', false);
  }
}

async function refreshSavedBundles() {
  try {
    const response = await fetch('/api/code-export-bundle/saved');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to load saved bundles');
    const first = data?.items?.[0];
    if (!first) {
      savedBundlesEl.textContent = JSON.stringify(data, null, 2);
      return;
    }
    const detailResp = await fetch(`/api/code-export-bundle/saved/${encodeURIComponent(first)}`);
    const detailData = await detailResp.json();
    savedBundlesEl.textContent = JSON.stringify({ list: data.items, latest: detailData }, null, 2);
  } catch (error) {
    savedBundlesEl.textContent = `Error: ${error.message}`;
  }
}

async function saveBundle() {
  setBusy(bundleSaveBtn, 'Saving...', true);
  setStatus('bundle saving');
  try {
    if (!latest) await generate();
    const response = await fetch('/api/code-export-bundle/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptEl.value,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value,
        fidelity: fidelityEl.value,
        plan: latest?.plan,
        ir: latest?.ir,
        projectId: currentProjectId || undefined,
        approvalToken: approvalToken || undefined
      })
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 403 && data.approvalRequired && data.request?.id) {
        approvalRequestIdEl.value = data.request.id;
        approvalOutputEl.textContent = JSON.stringify(data, null, 2);
        throw new Error('Approval required. 승인 후 다시 저장하세요.');
      }
      throw new Error(data.error || 'Failed to save bundle');
    }
    savedBundlesEl.textContent = JSON.stringify(data, null, 2);
    await refreshSavedBundles();
    setStatus('bundle saved');
  } catch (error) {
    savedBundlesEl.textContent = `Error: ${error.message}`;
    setStatus('bundle save error');
  } finally {
    setBusy(bundleSaveBtn, 'Saving...', false);
  }
}

async function archiveLatestBundle() {
  setBusy(bundleArchiveBtn, 'Archiving...', true);
  setStatus('archiving');
  try {
    const listResp = await fetch('/api/code-export-bundle/saved');
    const listData = await listResp.json();
    if (!listResp.ok) throw new Error(listData.error || 'Failed to load bundle list');
    const latestBundle = listData?.items?.[0];
    if (!latestBundle) throw new Error('No saved bundle found');

    const archiveResp = await fetch('/api/code-export-bundle/archive', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: latestBundle })
    });
    const archiveData = await archiveResp.json();
    if (!archiveResp.ok) throw new Error(archiveData.error || 'Archive failed');

    bundleArchiveEl.textContent = JSON.stringify(
      {
        latest: latestBundle,
        archiveFileName: archiveData.archiveFileName,
        downloadUrl: `/api/code-export-bundle/archive/${encodeURIComponent(latestBundle)}`
      },
      null,
      2
    );
    setStatus('archive ready');
  } catch (error) {
    bundleArchiveEl.textContent = `Error: ${error.message}`;
    setStatus('archive error');
  } finally {
    setBusy(bundleArchiveBtn, 'Archiving...', false);
  }
}

async function createProject() {
  setBusy(createProjectBtn, 'Creating...', true);
  setStatus('project creating');
  try {
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: projectNameEl.value || 'Untitled Project',
        prd: promptEl.value,
        onePager: promptEl.value,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value,
        rankingPreset: rankingPresetEl.value,
        rankingPolicyOverride: parseJSON(rankingPolicyOverrideEl.value, {})
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Project create failed');
    currentProjectId = data.project.id;
    projectOutputEl.textContent = JSON.stringify(
      {
        action: 'create',
        projectId: currentProjectId,
        name: data.project.name,
        rankingPreset: data.project.rankingPreset,
        rankingPolicyOverride: data.project.rankingPolicyOverride || {},
        dataSchemaUrl: data.project.dataSchemaUrl || ''
      },
      null,
      2
    );
    setStatus('project ready');
  } catch (error) {
    projectOutputEl.textContent = `Error: ${error.message}`;
    setStatus('project error');
  } finally {
    setBusy(createProjectBtn, 'Creating...', false);
  }
}

async function listProjectItems() {
  setBusy(listProjectsBtn, 'Listing...', true);
  setStatus('project listing');
  try {
    const response = await fetch('/api/projects');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Project list failed');
    if (!currentProjectId && data.items?.[0]?.id) {
      currentProjectId = data.items[0].id;
      if (data.items[0].rankingPreset) rankingPresetEl.value = data.items[0].rankingPreset;
    }

    if (currentProjectId) {
      const detailResp = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}`);
      const detailData = await detailResp.json();
        if (detailResp.ok && detailData.project) {
          if (detailData.project.rankingPreset) rankingPresetEl.value = detailData.project.rankingPreset;
          rankingPolicyOverrideEl.value = JSON.stringify(detailData.project.rankingPolicyOverride || {}, null, 2);
          schemaUrlEl.value = detailData.project.dataSchemaUrl || schemaUrlEl.value;
          schemaEl.value = detailData.project.dataSchema || schemaEl.value;
        }
    }

    projectOutputEl.textContent = JSON.stringify({ currentProjectId, projects: data.items || [] }, null, 2);
    setStatus('project listed');
  } catch (error) {
    projectOutputEl.textContent = `Error: ${error.message}`;
    setStatus('project list error');
  } finally {
    setBusy(listProjectsBtn, 'Listing...', false);
  }
}

async function runProjectGeneration() {
  setBusy(runProjectBtn, 'Generating...', true);
  setStatus('project generating');
  try {
    if (!currentProjectId) await createProject();
    if (!currentProjectId) throw new Error('Project id not found');

    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: promptEl.value,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value,
        fidelity: fidelityEl.value,
        rankingPreset: rankingPresetEl.value,
        approvalToken: approvalToken || undefined
      })
    });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 403 && data.approvalRequired && data.request?.id) {
        approvalRequestIdEl.value = data.request.id;
        approvalOutputEl.textContent = JSON.stringify(data, null, 2);
        throw new Error('Approval required. 승인 후 다시 실행하세요.');
      }
      throw new Error(data.error || 'Project generate failed');
    }
    projectOutputEl.textContent = JSON.stringify(data, null, 2);
    setStatus('project generated');
  } catch (error) {
    projectOutputEl.textContent = `Error: ${error.message}`;
    setStatus('project generate error');
  } finally {
    setBusy(runProjectBtn, 'Generating...', false);
  }
}

async function saveProjectConfig() {
  setBusy(saveProjectConfigBtn, 'Saving...', true);
  setStatus('project config saving');
  try {
    if (!currentProjectId) await createProject();
    if (!currentProjectId) throw new Error('Project id not found');

    const override = parseJSON(rankingPolicyOverrideEl.value, null);
    if (override === null) throw new Error('rankingPolicyOverride JSON이 유효하지 않습니다.');

    const response = await fetch(`/api/projects/${encodeURIComponent(currentProjectId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rankingPreset: rankingPresetEl.value,
        rankingPolicyOverride: override,
        dataSchemaUrl: schemaUrlEl.value,
        dataSchema: schemaEl.value
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Project config save failed');
    projectOutputEl.textContent = JSON.stringify(
      {
        action: 'config_save',
        projectId: currentProjectId,
        rankingPreset: data.project?.rankingPreset,
        rankingPolicyOverride: data.project?.rankingPolicyOverride || {},
        dataSchemaUrl: data.project?.dataSchemaUrl || ''
      },
      null,
      2
    );
    setStatus('project config saved');
  } catch (error) {
    projectOutputEl.textContent = `Error: ${error.message}`;
    setStatus('project config error');
  } finally {
    setBusy(saveProjectConfigBtn, 'Saving...', false);
  }
}

async function listApprovals() {
  setBusy(listApprovalsBtn, 'Loading...', true);
  setStatus('approval listing');
  try {
    const status = approvalStatusFilterEl.value;
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const response = await fetch(`/api/approvals${query}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Approval list failed');
    if (data.items?.[0]?.id) approvalRequestIdEl.value = data.items[0].id;
    approvalOutputEl.textContent = JSON.stringify(
      {
        filter: status || 'all',
        summary: data.summary || {},
        items: (data.items || []).map((item) => ({
          ...item,
          effectiveStatus: item.effectiveStatus || item.status || 'unknown'
        }))
      },
      null,
      2
    );
    setStatus('approval listed');
  } catch (error) {
    approvalOutputEl.textContent = `Error: ${error.message}`;
    setStatus('approval list error');
  } finally {
    setBusy(listApprovalsBtn, 'Loading...', false);
  }
}

async function approveRequestAction() {
  setBusy(approveRequestBtn, 'Approving...', true);
  setStatus('approval approving');
  try {
    const requestId = approvalRequestIdEl.value.trim();
    if (!requestId) throw new Error('Approval Request ID가 필요합니다.');
    const response = await fetch('/api/approvals/approve', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestId,
        approver: approverNameEl.value || 'design-lead',
        approverRole: approverRoleEl.value || 'design_lead',
        comment: 'approved from demo UI'
      })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Approval approve failed');
    approvalToken = data.approved?.approvalToken || '';
    approvalOutputEl.textContent = JSON.stringify({ ...data, activeApprovalToken: approvalToken || null }, null, 2);
    setStatus('approval granted');
  } catch (error) {
    approvalOutputEl.textContent = `Error: ${error.message}`;
    setStatus('approval error');
  } finally {
    setBusy(approveRequestBtn, 'Approving...', false);
  }
}

async function alertApprovals() {
  setBusy(alertApprovalsBtn, 'Loading...', true);
  setStatus('approval alerts');
  try {
    const response = await fetch('/api/approvals/alerts?minutes=10');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Approval alerts failed');
    approvalOutputEl.textContent = JSON.stringify(data, null, 2);
    setStatus('approval alerts ready');
  } catch (error) {
    approvalOutputEl.textContent = `Error: ${error.message}`;
    setStatus('approval alerts error');
  } finally {
    setBusy(alertApprovalsBtn, 'Loading...', false);
  }
}

async function cleanupApprovals() {
  setBusy(cleanupApprovalsBtn, 'Cleaning...', true);
  setStatus('approval cleanup');
  try {
    const response = await fetch('/api/approvals/cleanup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ olderThanDays: 30 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Approval cleanup failed');
    approvalOutputEl.textContent = JSON.stringify(data, null, 2);
    setStatus('approval cleanup done');
  } catch (error) {
    approvalOutputEl.textContent = `Error: ${error.message}`;
    setStatus('approval cleanup error');
  } finally {
    setBusy(cleanupApprovalsBtn, 'Cleaning...', false);
  }
}

async function runAll() {
  setBusy(runAllBtn, 'Running...', true);
  setStatus('one-click run');
  try {
    await generate();
    await exportBundle();
    await saveBundle();
    await exportCode();
    setStatus('one-click complete');
  } catch (error) {
    setStatus(`one-click error: ${error.message}`);
  } finally {
    setBusy(runAllBtn, 'Running...', false);
  }
}

function useTemplate(name) {
  if (name === 'cancel') {
    promptEl.value = SAMPLE_PROMPTS.cancel;
    fidelityEl.value = 'prototype';
  } else if (name === 'list') {
    promptEl.value = SAMPLE_PROMPTS.list;
    fidelityEl.value = 'hifi';
  } else {
    promptEl.value = SAMPLE_PROMPTS.newbiz;
    fidelityEl.value = 'prototype';
  }
  setStatus(`template: ${name}`);
}

async function copyText(sourceEl, label) {
  const text = sourceEl?.textContent || '';
  if (!text.trim()) {
    setStatus(`${label} empty`);
    return;
  }
  try {
    await navigator.clipboard.writeText(text);
    setStatus(`${label} copied`);
  } catch {
    setStatus(`${label} copy failed`);
  }
}

generateBtn.addEventListener('click', generate);
generateMatrixBtn.addEventListener('click', generateMatrix);
runAllBtn.addEventListener('click', runAll);
codeExportBtn.addEventListener('click', exportCode);
bundleExportBtn.addEventListener('click', exportBundle);
bundleSaveBtn.addEventListener('click', saveBundle);
bundleArchiveBtn.addEventListener('click', archiveLatestBundle);

createProjectBtn.addEventListener('click', createProject);
saveProjectConfigBtn.addEventListener('click', saveProjectConfig);
runProjectBtn.addEventListener('click', runProjectGeneration);
listProjectsBtn.addEventListener('click', listProjectItems);
listApprovalsBtn.addEventListener('click', listApprovals);
alertApprovalsBtn.addEventListener('click', alertApprovals);
cleanupApprovalsBtn.addEventListener('click', cleanupApprovals);
approveRequestBtn.addEventListener('click', approveRequestAction);

tplCancelBtn.addEventListener('click', () => useTemplate('cancel'));
tplListBtn.addEventListener('click', () => useTemplate('list'));
tplNewBizBtn.addEventListener('click', () => useTemplate('newbiz'));
loadDataSampleBtn.addEventListener('click', () => {
  schemaEl.value = SAMPLE_SCHEMA_JSON;
  setStatus('sample json loaded');
});
loadSwaggerSampleBtn.addEventListener('click', () => {
  schemaEl.value = SAMPLE_SCHEMA_SWAGGER;
  setStatus('sample swagger loaded');
});
loadSchemaUrlBtn.addEventListener('click', async () => {
  try {
    if (!schemaUrlEl.value.trim()) throw new Error('schema URL을 입력하세요.');
    const response = await fetch('/api/data-schema/fetch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: schemaUrlEl.value.trim() })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || data.detail || 'schema fetch failed');
    schemaEl.value = data.dataSchema || '';
    setStatus('schema url loaded');
    saveDraft();
  } catch (error) {
    setStatus(`schema url error: ${error.message}`);
  }
});
clearSchemaBtn.addEventListener('click', () => {
  schemaEl.value = '';
  setStatus('schema cleared');
});
copyCodeBtn.addEventListener('click', () => copyText(codeExportEl, 'code'));
copyBundleBtn.addEventListener('click', () => copyText(bundleExportEl, 'bundle'));

setStatus('idle');
loadDraft();

[
  promptEl,
  schemaUrlEl,
  schemaEl,
  fidelityEl,
  projectNameEl,
  rankingPresetEl,
  rankingPolicyOverrideEl
].forEach((el) => el.addEventListener('input', saveDraft));

document.addEventListener('keydown', (event) => {
  const isCmdOrCtrl = event.metaKey || event.ctrlKey;
  if (isCmdOrCtrl && event.key === 'Enter') {
    event.preventDefault();
    generate();
  }
});

generate();
refreshSavedBundles();
