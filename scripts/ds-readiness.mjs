import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../lib/generator.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const registry = loadRegistry(path.join(root, 'ds-registry.json'));
const strictMode = process.argv.includes('--strict');

function print(status, message) {
  const mark = status ? 'OK' : 'WARN';
  console.log(`[${mark}] ${message}`);
}

const keyMap = registry.component_keys || {};
const registered = registry.components || [];
const missingKeys = registered.filter((name) => !keyMap[name]);

print(missingKeys.length === 0, `component_keys mapped: ${registered.length - missingKeys.length}/${registered.length}`);
if (missingKeys.length > 0) {
  console.log(`  missing: ${missingKeys.join(', ')}`);
  console.log('  next: npm run component-keys:sync:stories');
  console.log('  next: npm run component-keys:template');
}

print(Boolean(registry.ranking_policy), 'ranking_policy exists');
print(Boolean(registry.ranking_presets), 'ranking_presets exists');
print(Boolean(registry.approval_policy), 'approval_policy exists');
print(Boolean(registry.deploy_guard), 'deploy_guard exists');

const storybookDir = process.env.STORYBOOK_SRC_DIR || '(not set)';
print(Boolean(process.env.STORYBOOK_SRC_DIR), `STORYBOOK_SRC_DIR=${storybookDir}`);
if (!process.env.STORYBOOK_SRC_DIR) {
  console.log('  next: STORYBOOK_SRC_DIR=/absolute/path/to/storybook npm run readiness:strict');
}

const summary = {
  componentCount: registered.length,
  missingComponentKeys: missingKeys.length,
  hasRankingPolicy: Boolean(registry.ranking_policy),
  hasRankingPresets: Boolean(registry.ranking_presets),
  hasApprovalPolicy: Boolean(registry.approval_policy),
  storybookSrcDir: storybookDir,
  strictMode
};

const outPath = path.join(root, 'generated', 'readiness', 'summary.json');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
console.log(`readiness summary: ${outPath}`);

if (strictMode) {
  const guard = registry.deploy_guard || {};
  const strictErrors = [];
  if (guard.require_component_keys_on_deploy !== false && missingKeys.length > 0) {
    strictErrors.push(`missing component_keys: ${missingKeys.join(', ')}`);
  }
  if (guard.require_storybook_src_dir !== false && !process.env.STORYBOOK_SRC_DIR) {
    strictErrors.push('STORYBOOK_SRC_DIR is required');
  }

  if (strictErrors.length > 0) {
    console.error(`[STRICT] readiness failed:\n- ${strictErrors.join('\n- ')}`);
    process.exit(1);
  }
  console.log('[STRICT] readiness passed');
}
