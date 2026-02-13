import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.join(__dirname, '..');

const src = process.argv[2] || path.join(root, 'examples', 'storybook-sample.json');
const out = process.argv[3] || path.join(root, 'generated', 'ds-registry.generated.json');

const storybook = JSON.parse(fs.readFileSync(src, 'utf8'));

const registry = {
  rule_set_name: 'Yeo-Partner-Standard',
  version: '1.1.0-generated',
  source: path.basename(src),
  foundation_mapping: {
    spacing: '8px_base_system',
    color_token: 'yeo.token.color',
    typography: 'yeo.token.text_style'
  },
  components: storybook.components.map((component) => component.name),
  component_contracts: Object.fromEntries(
    storybook.components.map((component) => [component.name, component.props || {}])
  ),
  state_variants_required: ['normal', 'empty', 'loading', 'error', 'skeleton']
};

fs.writeFileSync(out, JSON.stringify(registry, null, 2));
console.log(`generated registry: ${out}`);
console.log(`components: ${registry.components.length}`);
