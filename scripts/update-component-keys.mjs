import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');
const registryPath = path.join(root, 'ds-registry.json');

function usage() {
  console.log('Usage: node scripts/update-component-keys.mjs <source-json-path>');
  console.log('source json can be:');
  console.log('- {"YEO_Button":"<figma-key>", ...}');
  console.log('- {"component_keys":{"YEO_Button":"<figma-key>", ...}}');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function normalizeKeyMap(input) {
  if (!input) return {};
  if (input.component_keys && typeof input.component_keys === 'object') {
    return input.component_keys;
  }
  return input;
}

const sourcePath = process.argv[2];
if (!sourcePath) {
  usage();
  process.exit(1);
}

const resolvedSource = path.isAbsolute(sourcePath) ? sourcePath : path.join(root, sourcePath);
if (!fs.existsSync(resolvedSource)) {
  console.error(`source file not found: ${resolvedSource}`);
  process.exit(1);
}

const sourceRaw = readJson(resolvedSource);
const keyMap = normalizeKeyMap(sourceRaw);
if (!keyMap || typeof keyMap !== 'object') {
  console.error('invalid source json');
  process.exit(1);
}

const registry = readJson(registryPath);
registry.component_keys = {
  ...(registry.component_keys || {}),
  ...keyMap
};

const components = registry.components || [];
const missing = components.filter((name) => !registry.component_keys[name]);
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

console.log(`updated component_keys from: ${resolvedSource}`);
console.log(`mapped: ${components.length - missing.length}/${components.length}`);
if (missing.length > 0) {
  console.log(`missing: ${missing.join(', ')}`);
  process.exit(2);
}
console.log('all component_keys mapped');
