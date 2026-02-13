import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const sourceDir = process.argv[2] || process.env.STORYBOOK_SRC_DIR || path.join(root, 'examples', 'storybook-src');
const extractedPath = path.join(root, 'generated', 'readiness', 'component-keys.from-stories.json');
const registryPath = path.join(root, 'ds-registry.json');

if (!fs.existsSync(sourceDir)) {
  console.error(`storybook source dir not found: ${sourceDir}`);
  process.exit(1);
}

execFileSync('node', ['scripts/extract-registry-from-stories.mjs', sourceDir, extractedPath], {
  cwd: root,
  stdio: 'inherit'
});

const extracted = JSON.parse(fs.readFileSync(extractedPath, 'utf8'));
const keyMap = extracted.component_keys || {};
if (Object.keys(keyMap).length === 0) {
  console.error('no component_keys found from stories');
  process.exit(2);
}

const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
registry.component_keys = {
  ...(registry.component_keys || {}),
  ...keyMap
};
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

const components = registry.components || [];
const missing = components.filter((name) => !registry.component_keys[name]);

console.log(`synced component_keys from stories: ${Object.keys(keyMap).length}`);
console.log(`coverage: ${components.length - missing.length}/${components.length}`);
if (missing.length > 0) {
  console.log(`missing: ${missing.join(', ')}`);
}
