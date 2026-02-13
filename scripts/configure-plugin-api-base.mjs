import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const uiPath = path.join(projectRoot, 'figma-plugin', 'ui.html');
const manifestPath = path.join(projectRoot, 'figma-plugin', 'manifest.json');

const rawBase = process.argv[2];
if (!rawBase) {
  console.error('usage: npm run plugin:configure-api -- https://your-service.onrender.com');
  process.exit(1);
}

let apiBase;
try {
  apiBase = new URL(rawBase).toString().replace(/\/$/, '');
} catch (error) {
  console.error('invalid api base url:', rawBase);
  process.exit(1);
}

const uiHtml = fs.readFileSync(uiPath, 'utf8');
const updatedUi = uiHtml.replace(
  /(<input id="apiBase" value=")[^"]*("\s*\/>)/,
  `$1${apiBase}$2`
);

if (updatedUi === uiHtml) {
  console.error('failed to update apiBase input in ui.html');
  process.exit(1);
}

fs.writeFileSync(uiPath, updatedUi, 'utf8');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const origin = new URL(apiBase).origin;
manifest.networkAccess = manifest.networkAccess || {};
manifest.networkAccess.allowedDomains = [origin];
manifest.networkAccess.reasoning =
  'Team deployment: plugin calls shared DS Copilot API endpoint.';
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log(`updated plugin api base: ${apiBase}`);
console.log(`updated allowedDomains: ${origin}`);
