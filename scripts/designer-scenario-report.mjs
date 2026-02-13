import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../lib/generator.mjs';
import { evaluateCompliance } from '../lib/compliance.mjs';
import { buildMatrixResult, resolveRankingContext } from '../lib/ranking.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const prompt = process.argv[2] || '예약 취소 팝업 생성';
const dataSchema = process.argv[3] || '{"cancelReason":["고객요청","중복예약","기타"]}';
const rankingPreset = process.argv[4] || 'balanced';
const outputName = process.argv[5] || `scenario-${Date.now()}`;

const registry = loadRegistry(path.join(root, 'ds-registry.json'));
const rankingContext = resolveRankingContext({
  registry,
  body: { rankingPreset }
});

const { ranked, recommendation } = buildMatrixResult({
  prompt,
  dataSchema,
  registry,
  rankingContext,
  evaluateComplianceFn: (validation, stage, allowNew) =>
    evaluateCompliance({
      validation,
      stage,
      allowNew,
      policy: registry.compliance_policy || {}
    })
});

function formatValidationSummary(item) {
  const counts = item?.compliance?.counts || {};
  const critical = counts.Critical || 0;
  const major = counts.Major || 0;
  const fresh = counts.New || 0;
  return `Critical ${critical} / Major ${major} / New ${fresh}`;
}

function formatStates(plan) {
  const states = Array.isArray(plan?.states) ? plan.states : [];
  const required = Array.isArray(registry.state_variants_required) ? registry.state_variants_required : [];
  const missing = required.filter((state) => !states.includes(state));
  return {
    states,
    missing
  };
}

const lines = [];
lines.push('# Designer Scenario Report');
lines.push('');
lines.push(`- prompt: ${prompt}`);
lines.push(`- rankingPreset: ${rankingPreset}`);
lines.push(`- generatedAt: ${new Date().toISOString()}`);
lines.push(`- recommendation: ${recommendation ? `${recommendation.fidelity} (score ${recommendation.score})` : 'none'}`);
lines.push('');
lines.push('## Trio Summary');
lines.push('');
for (const item of ranked) {
  const states = formatStates(item.plan);
  lines.push(`### ${item.fidelity.toUpperCase()} (rank ${item.rank?.order || '-'}, score ${item.rank?.score || '-'})`);
  lines.push(`- title: ${item.plan?.title || '-'}`);
  lines.push(`- components: ${(item.plan?.components || []).join(', ')}`);
  lines.push(`- violations: ${formatValidationSummary(item)}`);
  lines.push(`- compliance blocked: ${item.compliance?.blocked ? 'yes' : 'no'}`);
  lines.push(`- states: ${states.states.join(', ')}`);
  lines.push(`- missing states: ${states.missing.length > 0 ? states.missing.join(', ') : '(none)'}`);
  lines.push(`- reasoning: ${(item.plan?.reasoning || []).join(' ')}`);
  lines.push('');
}

lines.push('## Designer QA Checklist');
lines.push('');
lines.push('- [ ] 선택한 추천 fidelity가 실제 기획 의도와 일치하는지 확인');
lines.push('- [ ] Empty/Loading/Error/Skeleton 상태의 문구와 액션이 맞는지 확인');
lines.push('- [ ] 데이터 필드명이 실제 API 스키마와 동일한지 확인');
lines.push('- [ ] 신규 컴포넌트(New) 발생 시 DS 등록 요청 여부 확인');
lines.push('- [ ] 피그마 반영 후 Auto-layout/Hug/Fill 깨짐 여부 확인');
lines.push('');

const outPath = path.join(root, 'generated', 'reports', `${outputName}.md`);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${lines.join('\n')}\n`);

console.log(`scenario report generated: ${outPath}`);
