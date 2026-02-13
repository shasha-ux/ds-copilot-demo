import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { buildFigmaEvents, buildPlan, buildReactCode, loadRegistry, validatePlan } from '../lib/generator.mjs';
import { planToIR } from '../lib/ir.mjs';
import { buildCodeBundle } from '../lib/export-bundle.mjs';
import { createBundleArchive, inspectBundle, listBundles, saveBundle } from '../lib/bundle-store.mjs';
import { runPipeline } from '../lib/pipeline.mjs';
import { appendRunHistory, readRunHistory } from '../lib/run-history.mjs';
import { evaluateCompliance } from '../lib/compliance.mjs';
import {
  appendProjectRevision,
  buildProjectRunInput,
  createProject,
  getProject,
  listProjects,
  updateProject
} from '../lib/project-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function run(command) {
  return execSync(command, { cwd: root, encoding: 'utf8' }).trim();
}

function verifyCoreGeneration() {
  const registry = loadRegistry(path.join(root, 'ds-registry.json'));
  const prompt = '예약 취소 팝업 생성, 사유 선택 후 상세입력 노출, 완료 시 토스트';
  const dataSchema = '{"cancelReason":["고객요청","중복예약","기타"]}';

  const plan = buildPlan(prompt, dataSchema, registry);
  assert(plan.title.includes('취소'), 'plan title mismatch');
  assert(plan.fidelity === 'prototype', 'default fidelity should be prototype');
  assert(plan.previewDensity === 'balanced', 'default preview density should be balanced');
  assert(plan.states.length === 5, 'state variants should be 5');
  assert(plan.components.includes('YEO_Button'), 'YEO_Button required in generated plan');
  assert(plan.componentProps && plan.componentProps.YEO_Button, 'componentProps missing for YEO_Button');
  assert(plan.sections && Array.isArray(plan.sections.body), 'plan.sections.body missing');
  assert(registry.component_layouts && registry.component_layouts.YEO_Button, 'component_layouts missing YEO_Button');
  assert(registry.layout_strategy && registry.layout_strategy.action_components, 'layout_strategy missing action_components');
  assert(registry.pattern_strategy && registry.pattern_strategy.modal_footer_actions === true, 'pattern_strategy missing modal_footer_actions');
  assert(registry.approval_policy && registry.approval_policy.enabled === true, 'approval_policy should be enabled');
  assert(registry.approval_policy.one_time_token === true, 'approval_policy one_time_token should be true');
  assert(Number(registry.approval_policy.token_ttl_minutes || 0) > 0, 'approval_policy token_ttl_minutes should be set');
  assert(Array.isArray(registry.approval_policy.allowed_roles), 'approval_policy allowed_roles missing');
  assert(registry.approval_policy.action_roles && registry.approval_policy.action_roles.pipeline_run, 'approval_policy action_roles missing');
  assert(registry.deploy_guard && registry.deploy_guard.enabled === true, 'deploy_guard should be enabled');
  assert(registry.deploy_guard.require_component_keys_on_deploy === true, 'deploy_guard component key requirement should be true');
  assert(registry.deploy_guard.require_storybook_src_dir === true, 'deploy_guard storybook requirement should be true');
  assert(registry.ranking_policy && registry.ranking_policy.severity_penalty, 'ranking_policy missing severity_penalty');

  const validation = validatePlan(plan, registry);
  const critical = validation.filter((item) => item.severity === 'Critical');
  assert(critical.length === 0, 'critical validation should be zero for sample prompt');

  const events = buildFigmaEvents(plan, registry);
  assert(events.onDesignRequest && events.onAssetValidation && events.onCodeExport, 'figma event payload incomplete');

  const ir = planToIR(plan);
  assert(ir.nodes.length === plan.components.length, 'IR nodes/components length mismatch');
  assert(ir.screen.sections, 'IR screen sections missing');
  assert(ir.screen.fidelity === 'prototype', 'IR fidelity should be preserved');

  const code = buildReactCode(plan);
  assert(code.includes('export default function GeneratedScreen'), 'generated code should export component');
  assert(code.includes('@yeo/ds-core'), 'generated code should import ds-core');
  assert(code.includes('<YEO_Modal open={open}'), 'sections-aware code should include modal wrapper for cancel flow');
  assert(code.includes('variant="secondary" onClick={() => setOpen(false)}'), 'sections-aware code should include footer close action');

  const bundle = buildCodeBundle(ir);
  const files = Object.keys(bundle.files);
  assert(files.includes('src/App.tsx'), 'bundle missing src/App.tsx');
  assert(files.includes('src/components/ScreenHeader.tsx'), 'bundle missing ScreenHeader component');
  assert(files.includes('src/components/ScreenBody.tsx'), 'bundle missing ScreenBody component');
  assert(files.includes('src/components/ScreenFooter.tsx'), 'bundle missing ScreenFooter component');
  assert(files.includes('src/types/generated.ts'), 'bundle missing shared generated types');
  assert(files.includes('src/mocks/handlers.ts'), 'bundle missing mocks handlers');
  assert(bundle.files['src/App.tsx'].includes('ScreenHeader'), 'split app should compose ScreenHeader');
  assert(bundle.files['src/components/ScreenHeader.tsx'].includes('import type { ScreenHeaderProps }'), 'ScreenHeader should import shared type');
  assert(bundle.files['src/components/ScreenFilterBar.tsx'].includes('import type { ScreenFilterBarProps }'), 'ScreenFilterBar should import shared type');
  assert(bundle.files['src/components/ScreenBody.tsx'].includes('import type { ScreenBodyProps }'), 'ScreenBody should import shared type');
  assert(bundle.files['src/components/ScreenFooter.tsx'].includes('import type { ScreenFooterProps }'), 'ScreenFooter should import shared type');
  assert(bundle.files['src/types/generated.ts'].includes('export interface ScreenHeaderProps'), 'shared types file missing ScreenHeaderProps');
  assert(bundle.files['src/types/generated.ts'].includes('export interface ScreenBodyProps'), 'shared types file missing ScreenBodyProps');
  assert(bundle.files['src/App.single.tsx'].includes('GeneratedScreen'), 'single app backup should include GeneratedScreen');
}

function verifySectionAwareCode() {
  const registry = loadRegistry(path.join(root, 'ds-registry.json'));
  const listPlan = buildPlan('예약 리스트 화면을 만들어줘. table 중심으로 필터가 필요해', '{"status":["pending","confirmed"]}', registry);
  const listCode = buildReactCode(listPlan);
  assert(listPlan.sections && Array.isArray(listPlan.sections.filterBar), 'list plan sections.filterBar missing');
  assert(listCode.includes('className="mb-3 flex gap-2"'), 'list flow code should include filter bar block');
  assert(listCode.includes('<YEO_Table data={tableRows} />'), 'list flow code should include table rendering');
}

function verifyFidelityProfiles() {
  const registry = loadRegistry(path.join(root, 'ds-registry.json'));
  const lowfi = buildPlan('예약 취소 팝업 생성', '{"cancelReason":["a","b"]}', registry, { fidelity: 'lowfi' });
  const hifi = buildPlan('예약 취소 팝업 생성', '{"cancelReason":["a","b"]}', registry, { fidelity: 'hifi' });

  assert(lowfi.fidelity === 'lowfi', 'lowfi fidelity should be set');
  assert(lowfi.previewDensity === 'coarse', 'lowfi density should be coarse');
  assert(!lowfi.components.includes('YEO_TextArea'), 'lowfi should exclude TextArea for cancel flow');
  assert(!lowfi.components.includes('YEO_Toast'), 'lowfi should exclude Toast for cancel flow');

  assert(hifi.fidelity === 'hifi', 'hifi fidelity should be set');
  assert(hifi.previewDensity === 'detailed', 'hifi density should be detailed');
  assert(hifi.components.includes('YEO_Table'), 'hifi should include table context');
  assert(hifi.components.includes('YEO_Badge'), 'hifi should include badge context');
}

function verifyDynamicBundleProps() {
  const registry = loadRegistry(path.join(root, 'ds-registry.json'));
  const plan = buildPlan(
    '예약 취소 팝업 생성',
    '{"cancelReason":["운영정책","재고부족","기타"]}',
    registry
  );
  plan.componentProps.YEO_Toast = { message: '테스트 토스트 문구' };
  const ir = planToIR(plan);
  const bundle = buildCodeBundle(ir);
  const app = bundle.files['src/App.tsx'];
  const body = bundle.files['src/components/ScreenBody.tsx'];

  assert(app.includes('["운영정책","재고부족","기타"]'), 'dynamic dropdown options were not reflected');
  assert(app.includes('테스트 토스트 문구'), 'dynamic toast message was not reflected');
  assert(body.includes('placeholder="상세 사유 입력"'), 'textarea placeholder should remain available');
}

function verifyBundleStore() {
  const registry = loadRegistry(path.join(root, 'ds-registry.json'));
  const plan = buildPlan('예약 취소 팝업', '{"cancelReason":["고객요청","기타"]}', registry);
  const ir = planToIR(plan);
  const bundle = buildCodeBundle(ir);

  const outputRoot = path.join(root, 'generated', 'verify-exports');
  const saved = saveBundle(outputRoot, 'verify_bundle', bundle);
  assert(fs.existsSync(saved.outputDir), 'saved bundle dir missing');

  const listed = listBundles(outputRoot);
  assert(listed.includes(saved.outputName), 'saved bundle not listed');

  const inspected = inspectBundle(outputRoot, saved.outputName);
  assert(inspected.files.includes('src/App.tsx'), 'inspect bundle missing src/App.tsx');
  assert(inspected.files.includes('src/components/ScreenHeader.tsx'), 'inspect bundle missing ScreenHeader');

  const archived = createBundleArchive(outputRoot, saved.outputName);
  assert(fs.existsSync(archived.archivePath), 'archive file missing');
}

function verifyPipelineRun() {
  const registry = loadRegistry(path.join(root, 'ds-registry.json'));
  const outputRoot = path.join(root, 'generated', 'verify-pipeline');
  const result = runPipeline({
    prompt: '예약 리스트 화면을 만들어줘',
    dataSchema: '{"status":["pending","confirmed"]}',
    outputName: 'verify_pipeline_bundle',
    fidelity: 'hifi',
    registry,
    outputRoot
  });

  assert(result.ok === true, 'pipeline run should succeed');
  assert(result.plan.fidelity === 'hifi', 'pipeline should apply fidelity');
  assert(result.saved.files.includes('src/App.tsx'), 'pipeline saved bundle missing App.tsx');
  assert(fs.existsSync(result.saved.manifestPath), 'pipeline manifest should exist');

  const manifest = JSON.parse(fs.readFileSync(result.saved.manifestPath, 'utf8'));
  assert(manifest.bundle.fileHashes['src/App.tsx'], 'pipeline manifest missing App.tsx hash');
  assert(manifest.summary.fidelity === 'hifi', 'pipeline manifest should include fidelity');
  assert(manifest.figmaEvents && manifest.figmaEvents.onDesignRequest, 'pipeline manifest missing figmaEvents');
}

function verifyRunHistory() {
  const historyFile = path.join(root, 'generated', 'verify-history', 'runs.jsonl');
  appendRunHistory(historyFile, { id: 'run_a', at: '2026-02-12T00:00:00.000Z' });
  appendRunHistory(historyFile, { id: 'run_b', at: '2026-02-12T00:00:01.000Z' });
  const rows = readRunHistory(historyFile, 2);
  assert(rows.length === 2, 'run history should return two rows');
  assert(rows[0].id === 'run_b', 'run history order should be latest first');
}

function verifyCompliancePolicy() {
  const validation = [
    { severity: 'New', item: 'YEO_NewWidget' },
    { severity: 'Major', item: 'action' },
    { severity: 'Critical', item: 'loading' }
  ];
  const policy = {
    generation: { block: ['Critical'], warn: ['Major', 'New'] },
    deploy: { block: ['Critical', 'Major'], warn: ['New'] }
  };

  const generation = evaluateCompliance({ validation, stage: 'generation', policy, allowNew: true });
  assert(generation.blocked === true, 'generation should be blocked by Critical');
  assert(generation.warningItems.some((item) => item.severity === 'New'), 'generation should warn New');

  const deploy = evaluateCompliance({ validation, stage: 'deploy', policy, allowNew: true });
  assert(deploy.blockedItems.some((item) => item.severity === 'Major'), 'deploy should block Major');
}

function verifyProjectStore() {
  const rootDir = path.join(root, 'generated', 'verify-projects');
  const project = createProject(rootDir, {
    name: '신사업 예약 취소',
    prd: '파트너가 예약 취소 요청을 처리한다.',
    onePager: '취소 사유 선택 후 완료 시 토스트 노출',
    dataSchema: '{"cancelReason":["고객요청","기타"]}',
    rankingPreset: 'hifi_first'
  });

  assert(project.id, 'project id should exist');
  assert(project.rankingPreset === 'hifi_first', 'project rankingPreset should persist on create');
  const listed = listProjects(rootDir);
  assert(listed.some((item) => item.id === project.id), 'created project should be listed');

  const updated = updateProject(rootDir, project.id, { name: '신사업 예약 취소 v2' });
  assert(updated.name.includes('v2'), 'project update should apply');
  const updatedPreset = updateProject(rootDir, project.id, { rankingPreset: 'speed_first' });
  assert(updatedPreset.rankingPreset === 'speed_first', 'project rankingPreset should update');

  const runInput = buildProjectRunInput(updated, { prompt: '하이파이로 생성', fidelity: 'hifi' });
  assert(runInput.prompt.includes('[PRD]'), 'run input should include PRD context');
  assert(runInput.prompt.includes('hifi'), 'run input should include fidelity');

  const revision = appendProjectRevision(rootDir, project.id, {
    kind: 'generate',
    prompt: '하이파이로 생성',
    fidelity: 'hifi',
    result: { outputName: 'project_run' }
  });
  assert(revision.id.startsWith('rev_'), 'revision id should be generated');

  const loaded = getProject(rootDir, project.id);
  assert(Array.isArray(loaded.revisions) && loaded.revisions.length >= 1, 'project revisions should persist');
}

function verifyStorybookExtractor() {
  run('npm run extract:stories');
  const generatedPath = path.join(root, 'generated', 'ds-registry.from-stories.json');
  assert(fs.existsSync(generatedPath), 'generated storybook registry file missing');

  const parsed = JSON.parse(fs.readFileSync(generatedPath, 'utf8'));
  assert(Array.isArray(parsed.components) && parsed.components.length >= 2, 'storybook extractor components too small');
  assert(parsed.component_keys && parsed.component_keys.YEO_Button, 'storybook extractor component_keys missing YEO_Button');
}

function verifyStaticSyntax() {
  run('node --check server.mjs');
  run('node --check figma-plugin/code.js');
  run('node --check public/app.js');
}

function verifyFileContracts() {
  const ui = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert(ui.includes('Bundle Save'), 'UI missing Bundle Save action');
  assert(ui.includes('Generate Trio'), 'UI missing Generate Trio action');
  assert(ui.includes('matrixOutput'), 'UI missing matrix output block');
  assert(ui.includes('rankingPreset'), 'UI missing rankingPreset input');
  assert(ui.includes('rankingPolicyOverride'), 'UI missing rankingPolicyOverride input');
  assert(ui.includes('Project Config Save'), 'UI missing Project Config Save action');
  assert(ui.includes('Approval Request ID'), 'UI missing approval request id input');
  assert(ui.includes('Approval Status Filter'), 'UI missing approval status filter');
  assert(ui.includes('Approval List'), 'UI missing approval list action');
  assert(ui.includes('Approval Alerts'), 'UI missing approval alerts action');
  assert(ui.includes('Approval Cleanup'), 'UI missing approval cleanup action');
  assert(ui.includes('Approval Approve'), 'UI missing approval approve action');
  assert(ui.includes('Approver Role'), 'UI missing approver role input');

  const pluginUi = fs.readFileSync(path.join(root, 'figma-plugin', 'ui.html'), 'utf8');
  assert(pluginUi.includes('피그마에 반영'), 'Figma plugin UI missing render action');
  assert(pluginUi.includes('3안 모두 반영'), 'Figma plugin UI missing render trio action');
  assert(pluginUi.includes('id="fidelity"'), 'Figma plugin UI missing fidelity input');
  assert(pluginUi.includes('id="projectId"'), 'Figma plugin UI missing projectId input');
  assert(pluginUi.includes('id="projectSelect"'), 'Figma plugin UI missing projectSelect input');
  assert(pluginUi.includes('loadProjectsBtn'), 'Figma plugin UI missing loadProjectsBtn');
  assert(pluginUi.includes('loadProjectBtn'), 'Figma plugin UI missing loadProjectBtn');
  assert(pluginUi.includes('id="rankingPreset"'), 'Figma plugin UI missing rankingPreset input');
  assert(pluginUi.includes('id="rankingPolicyOverride"'), 'Figma plugin UI missing rankingPolicyOverride input');
  assert(pluginUi.includes('saveProjectConfigBtn'), 'Figma plugin UI missing project config save button');
  assert(pluginUi.includes('generateTrioBtn'), 'Figma plugin UI missing generate trio button');
  assert(pluginUi.includes('renderTrioBtn'), 'Figma plugin UI missing render trio button id');
  assert(pluginUi.includes('/api/generate-matrix'), 'Figma plugin UI missing generate-matrix request');
  assert(pluginUi.includes('/api/projects/${encodeURIComponent(projectId)}/generate-matrix'), 'Figma plugin UI missing project generate-matrix request');
  assert(pluginUi.includes('/api/projects/${encodeURIComponent(projectId)}'), 'Figma plugin UI missing project patch request');
  assert(pluginUi.includes('/api/projects'), 'Figma plugin UI missing project list request');
  assert(pluginUi.includes('loadProjectDetail'), 'Figma plugin UI missing loadProjectDetail helper');
  assert(pluginUi.includes('syncFromMatrixByFidelity'), 'Figma plugin UI missing matrix fidelity sync');
  assert(pluginUi.includes('create-generated-matrix'), 'Figma plugin UI missing create-generated-matrix message');
  assert(pluginUi.includes('recommendation'), 'Figma plugin UI missing recommendation handling');
  assert(pluginUi.includes('item.rank?.score'), 'Figma plugin UI missing rank score rendering');
  assert(pluginUi.includes('item.rank?.breakdown?.policy'), 'Figma plugin UI missing rank policy rendering');
  assert(pluginUi.includes('componentLayouts'), 'Figma plugin UI missing componentLayouts payload');
  assert(pluginUi.includes('layoutStrategy'), 'Figma plugin UI missing layoutStrategy payload');
  assert(pluginUi.includes('patternStrategy'), 'Figma plugin UI missing patternStrategy payload');
  assert(pluginUi.includes('sections'), 'Figma plugin UI missing sections payload');
  assert(pluginUi.includes('previewDensity'), 'Figma plugin UI missing previewDensity payload');
  assert(pluginUi.includes('compliance'), 'Figma plugin UI missing compliance payload');

  const pluginCode = fs.readFileSync(path.join(root, 'figma-plugin', 'code.js'), 'utf8');
  assert(pluginCode.includes('applyLayoutRule'), 'Figma plugin code missing applyLayoutRule');
  assert(pluginCode.includes('buildStructuredNodes'), 'Figma plugin code missing buildStructuredNodes');
  assert(pluginCode.includes('buildFromSections'), 'Figma plugin code missing buildFromSections');
  assert(pluginCode.includes('profileForFidelity'), 'Figma plugin code missing fidelity profile');
  assert(pluginCode.includes('[Compliance]'), 'Figma plugin code missing compliance notes');
  assert(pluginCode.includes('normalizeFidelity'), 'Figma plugin code missing normalizeFidelity');
  assert(pluginCode.includes("msg.type === 'create-generated-matrix'"), 'Figma plugin code missing matrix render handler');
  assert(pluginCode.includes('Modal Footer'), 'Figma plugin code missing modal footer strategy');
  assert(pluginCode.includes('Filter Bar'), 'Figma plugin code missing table filter bar strategy');

  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert(readme.includes('/api/code-export-bundle/save'), 'README missing bundle save API docs');
  assert(readme.includes('/api/projects'), 'README missing projects API docs');
  assert(readme.includes('/api/compliance/check'), 'README missing compliance API docs');
  assert(readme.includes('/api/generate-matrix'), 'README missing generate-matrix API docs');
  assert(readme.includes('ranking_policy'), 'README missing ranking_policy docs');
  assert(readme.includes('/api/approvals'), 'README missing approvals API docs');
  assert(readme.includes('component-keys:template'), 'README missing component keys template docs');
  assert(readme.includes('.env.example'), 'README missing env example docs');
  assert(readme.includes('COMPONENT_KEYS_STANDARD.md'), 'README missing component keys standard doc');

  const server = fs.readFileSync(path.join(root, 'server.mjs'), 'utf8');
  assert(server.includes('/api/generate-matrix'), 'server missing generate-matrix route');
  assert(server.includes("pathSegments[3] === 'generate-matrix'"), 'server missing project generate-matrix route');
  assert(server.includes('/api/approvals'), 'server missing approvals routes');
  assert(server.includes('/api/approvals/alerts'), 'server missing approvals alerts route');
  assert(server.includes('/api/approvals/cleanup'), 'server missing approvals cleanup route');
  assert(server.includes('evaluateDeployGuard'), 'server missing deploy guard evaluation');
  assert(server.includes('Deploy guard blocked'), 'server missing deploy guard blocking response');
  assert(server.includes('ensureApproval'), 'server missing approval enforcement helper');
  assert(server.includes('Approval required'), 'server missing approval required response');
  assert(server.includes('approverRole'), 'server missing approverRole handling');
  assert(server.includes('requiredRoles'), 'server missing requiredRoles handling');
  assert(server.includes('tokenTtlMinutes'), 'server missing approval token ttl handling');
  assert(server.includes('oneTimeToken'), 'server missing one-time token handling');
  assert(server.includes('consumeByToken'), 'server missing token consume handling');
  assert(server.includes('expiringSoon'), 'server should include expiringSoon summary handling');
  assert(server.includes('componentLayouts: registry.component_layouts'), 'generate-matrix should include registry payload');
  assert(server.includes('recommendation'), 'generate-matrix should include recommendation');
  assert(server.includes('buildMatrixResult'), 'server should include matrix builder usage');
  assert(server.includes('resolveRankingContext'), 'server should include ranking context resolver');
  assert(server.includes("from './lib/ranking.mjs'"), 'server should import ranking library');

  const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
  assert(appJs.includes('recommendation'), 'web app matrix output should include recommendation');
  assert(appJs.includes('item.rank?.score'), 'web app matrix output should include rank score');
  assert(appJs.includes('saveProjectConfig'), 'web app should include project config save action');
  assert(appJs.includes('rankingPolicyOverrideEl'), 'web app should bind rankingPolicyOverride input');
  assert(appJs.includes('approvalToken'), 'web app should include approval token flow');
  assert(appJs.includes('approveRequestAction'), 'web app should include approve request action');
  assert(appJs.includes('approverRoleEl'), 'web app should include approver role binding');
  assert(appJs.includes('approvalStatusFilterEl'), 'web app should include approval status filter binding');
  assert(appJs.includes('effectiveStatus'), 'web app should include effectiveStatus rendering');
  assert(appJs.includes('summary: data.summary'), 'web app should include approval summary rendering');
  assert(appJs.includes('alertApprovals'), 'web app should include alertApprovals action');
  assert(appJs.includes('cleanupApprovals'), 'web app should include cleanupApprovals action');

  const approvalStore = fs.readFileSync(path.join(root, 'lib', 'approval-store.mjs'), 'utf8');
  assert(approvalStore.includes('expiresAt'), 'approval store should include expiresAt');
  assert(approvalStore.includes('tokenStatus'), 'approval store should include tokenStatus');
  assert(approvalStore.includes('consumeByToken'), 'approval store should include consumeByToken');
  assert(approvalStore.includes('effectiveStatus'), 'approval store should include effectiveStatus');
  assert(approvalStore.includes('cleanupExpired'), 'approval store should include cleanupExpired');
  assert(approvalStore.includes('cleanupOldApprovals'), 'approval store should include cleanupOldApprovals');
  assert(approvalStore.includes('listExpiringApprovals'), 'approval store should include listExpiringApprovals');
  assert(approvalStore.includes('expiringSoon'), 'approval store should include expiringSoon field');

  const rankingLib = fs.readFileSync(path.join(root, 'lib', 'ranking.mjs'), 'utf8');
  assert(rankingLib.includes('scoreMatrixItem'), 'ranking library should include scoreMatrixItem');
  assert(rankingLib.includes('resolveRankingPolicy'), 'ranking library should include resolveRankingPolicy');

  const readiness = fs.readFileSync(path.join(root, 'scripts', 'ds-readiness.mjs'), 'utf8');
  assert(readiness.includes('--strict'), 'readiness script should support strict mode');
  assert(readiness.includes('[STRICT] readiness failed'), 'readiness script should fail in strict mode');

  const keyTemplateScript = fs.readFileSync(path.join(root, 'scripts', 'export-component-key-template.mjs'), 'utf8');
  assert(keyTemplateScript.includes('component-keys.template.json'), 'component key template script should generate template file');
  assert(keyTemplateScript.includes('component-keys.request-form.md'), 'component key template script should generate request form file');
  const keyUpdateScript = fs.readFileSync(path.join(root, 'scripts', 'update-component-keys.mjs'), 'utf8');
  assert(keyUpdateScript.includes('component_keys'), 'component key update script should handle component_keys');

  const keyStandard = fs.readFileSync(path.join(root, 'docs', 'COMPONENT_KEYS_STANDARD.md'), 'utf8');
  assert(keyStandard.includes('입력 포맷 표준'), 'component keys standard doc should include input format standard');
  assert(keyStandard.includes('실행 순서'), 'component keys standard doc should include execution order');
}

try {
  verifyCoreGeneration();
  verifyStorybookExtractor();
  verifyBundleStore();
  verifyPipelineRun();
  verifyRunHistory();
  verifyCompliancePolicy();
  verifyProjectStore();
  verifyFidelityProfiles();
  verifySectionAwareCode();
  verifyDynamicBundleProps();
  verifyStaticSyntax();
  verifyFileContracts();

  console.log('[verify] all checks passed');
} catch (error) {
  console.error(`[verify] failed: ${error.message}`);
  process.exit(1);
}
