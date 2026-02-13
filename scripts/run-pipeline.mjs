import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../lib/generator.mjs';
import { runPipeline } from '../lib/pipeline.mjs';
import { appendRunHistory } from '../lib/run-history.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const prompt = process.argv[2] || '예약 취소 팝업을 만들어줘. 취소 사유 선택 후 상세 입력 노출, 완료 시 토스트';
const dataSchema = process.argv[3] || '{"cancelReason":["고객요청","중복예약","기타"]}';
const outputName = process.argv[4] || `pipeline_${Date.now()}`;
const fidelity = process.argv[5] || 'prototype';

const registry = loadRegistry(path.join(root, 'ds-registry.json'));
const outputRoot = path.join(root, 'generated', 'exports');
const historyPath = path.join(root, 'generated', 'run-history', 'pipeline-runs.jsonl');

const result = runPipeline({ prompt, dataSchema, outputName, fidelity, registry, outputRoot });

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

appendRunHistory(historyPath, {
  id: `run_${Date.now()}`,
  at: new Date().toISOString(),
  title: result.plan.title,
  outputName: result.saved.outputName,
  outputDir: result.saved.outputDir,
  manifestPath: result.saved.manifestPath,
  fidelity,
  componentCount: result.plan.components.length
});

console.log(JSON.stringify({
  ok: true,
  outputName: result.saved.outputName,
  outputDir: result.saved.outputDir,
  manifestPath: result.saved.manifestPath,
  fidelity: result.plan.fidelity,
  files: result.saved.files
}, null, 2));
