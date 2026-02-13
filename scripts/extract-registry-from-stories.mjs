import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const sourceDir = process.argv[2] || process.env.STORYBOOK_SRC_DIR || path.join(root, 'examples', 'storybook-src');
const out = process.argv[3] || path.join(root, 'generated', 'ds-registry.from-stories.json');

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
    } else if (/\.stories\.(t|j)sx?$/.test(entry.name)) {
      files.push(full);
    }
  }
  return files;
}

function extractComponentName(content) {
  const direct = content.match(/component\s*:\s*([A-Za-z0-9_]+)/);
  if (direct) return direct[1];
  const importLine = content.match(/import\s*\{\s*([^}]+)\s*\}\s*from\s*['"]@yeo\/ds-core['"]/);
  if (!importLine) return null;
  const names = importLine[1].split(',').map((v) => v.trim()).filter(Boolean);
  return names.find((name) => name.startsWith('YEO_')) || names[0] || null;
}

function extractArgTypes(content) {
  const start = content.indexOf('argTypes');
  if (start === -1) return {};
  const firstBrace = content.indexOf('{', start);
  if (firstBrace === -1) return {};

  let depth = 0;
  let end = -1;
  for (let i = firstBrace; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return {};

  const block = content.slice(firstBrace + 1, end);
  const result = {};
  const keyMatches = block.matchAll(/([A-Za-z0-9_]+)\s*:\s*\{/g);
  for (const match of keyMatches) {
    result[match[1]] = { type: 'unknown' };
  }
  return result;
}

function extractFigmaKey(content) {
  const keyFromParam = content.match(/figmaKey\s*:\s*['"]([^'"]+)['"]/);
  if (keyFromParam) return keyFromParam[1];

  const keyFromComment = content.match(/figma-key\s*:\s*([A-Za-z0-9:_-]+)/i);
  if (keyFromComment) return keyFromComment[1];

  return null;
}

if (!fs.existsSync(sourceDir)) {
  console.error(`source dir not found: ${sourceDir}`);
  process.exit(1);
}

const storyFiles = walk(sourceDir);
const components = [];
const contracts = {};
const componentKeys = {};

for (const file of storyFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const component = extractComponentName(content);
  if (!component) continue;
  if (!components.includes(component)) components.push(component);
  contracts[component] = {
    ...(contracts[component] || {}),
    ...extractArgTypes(content)
  };
  const figmaKey = extractFigmaKey(content);
  if (figmaKey) {
    componentKeys[component] = figmaKey;
  }
}

const registry = {
  rule_set_name: 'Yeo-Partner-Standard',
  version: '1.1.0-from-stories',
  sourceDir,
  foundation_mapping: {
    spacing: '8px_base_system',
    color_token: 'yeo.token.color',
    typography: 'yeo.token.text_style'
  },
  components,
  component_keys: componentKeys,
  component_contracts: contracts,
  state_variants_required: ['normal', 'empty', 'loading', 'error', 'skeleton']
};

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(registry, null, 2));
console.log(`scanned files: ${storyFiles.length}`);
console.log(`generated registry: ${out}`);
console.log(`components: ${components.length}`);
