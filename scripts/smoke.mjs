import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildFigmaEvents, buildPlan, buildReactCode, loadRegistry, validatePlan } from '../lib/generator.mjs';
import { planToIR } from '../lib/ir.mjs';
import { buildCodeBundle } from '../lib/export-bundle.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const registry = loadRegistry(path.join(__dirname, '..', 'ds-registry.json'));

const input = {
  prompt: '예약 취소 팝업을 만들어줘. 취소 사유 선택 후 상세 입력 노출, 완료 시 토스트',
  dataSchema: '{"cancelReason":["고객요청","중복예약","기타"]}'
};

const plan = buildPlan(input.prompt, input.dataSchema, registry);
const validation = validatePlan(plan, registry);
const figmaEvents = buildFigmaEvents(plan, registry);
const code = buildReactCode(plan);
const ir = planToIR(plan);
const bundle = buildCodeBundle(ir);

console.log(JSON.stringify({
  input,
  plan,
  validation,
  figmaEvents,
  codePreview: code.slice(0, 300),
  bundleFiles: Object.keys(bundle.files)
}, null, 2));
