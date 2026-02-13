import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../lib/generator.mjs';
import { evaluateCompliance } from '../lib/compliance.mjs';
import { buildMatrixResult, resolveRankingContext } from '../lib/ranking.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const registry = loadRegistry(path.join(root, 'ds-registry.json'));

const prompt = process.argv[2] || '신사업 파트너센터 예약 취소 플로우 화면을 만들어줘';
const dataSchema = process.argv[3] || '{"cancelReason":["고객요청","중복예약","기타"],"status":["pending","confirmed","canceled"]}';
const rankingPreset = process.argv[4] || 'balanced';

const rankingContext = resolveRankingContext({
  registry,
  body: { rankingPreset }
});

function evalCompliance(validation, stage, allowNew) {
  return evaluateCompliance({
    validation,
    stage,
    policy: registry.compliance_policy || {},
    allowNew
  });
}

const matrix = buildMatrixResult({
  prompt,
  dataSchema,
  registry,
  evaluateComplianceFn: evalCompliance,
  rankingContext
});

const lines = [];
lines.push('# Pilot Report');
lines.push('');
lines.push(`- prompt: ${prompt}`);
lines.push(`- rankingPreset: ${rankingContext.preset}`);
lines.push(`- recommendation: ${matrix.recommendation?.fidelity || 'n/a'} (score ${matrix.recommendation?.score || 0})`);
lines.push('');
lines.push('## Candidates');
for (const item of matrix.ranked) {
  lines.push(`- ${item.rank?.order}. ${item.fidelity} / score=${item.rank?.score || 0} / components=${item.plan.components.length} / blocked=${item.compliance.blocked ? 'yes' : 'no'}`);
}
lines.push('');
lines.push('## Next');
lines.push('- Pick recommended fidelity and generate Figma frame.');
lines.push('- Run approval workflow if deploy-stage action is blocked.');
lines.push('- Export bundle and validate in dev runtime.');

const outDir = path.join(root, 'generated', 'pilot');
const outPath = path.join(outDir, 'pilot-report.md');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`);
console.log(`pilot report: ${outPath}`);
