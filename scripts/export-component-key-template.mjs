import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../lib/generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const registry = loadRegistry(path.join(root, 'ds-registry.json'));
const outPath = path.join(root, 'generated', 'readiness', 'component-keys.template.json');
const requestDocPath = path.join(root, 'generated', 'readiness', 'component-keys.request-form.md');
const template = Object.fromEntries((registry.components || []).map((name) => [name, '']));

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify({ component_keys: template }, null, 2)}\n`);
console.log(`template generated: ${outPath}`);

const lines = [];
lines.push('# Component Key Request Form');
lines.push('');
lines.push('아래 표에 Figma Component Key를 입력한 뒤, `component-keys.template.json`에도 동일하게 반영하세요.');
lines.push('');
lines.push('| Component | Figma Key | Owner | Status |');
lines.push('| --- | --- | --- | --- |');
for (const name of registry.components || []) {
  lines.push(`| ${name} |  |  | TODO |`);
}
lines.push('');
lines.push('## 적용 절차');
lines.push('1. `component-keys.template.json`에 key 값을 채웁니다.');
lines.push('2. `npm run component-keys:update -- generated/readiness/component-keys.template.json` 실행');
lines.push('3. `npm run readiness:strict` 실행');

fs.writeFileSync(requestDocPath, `${lines.join('\n')}\n`);
console.log(`request form generated: ${requestDocPath}`);
