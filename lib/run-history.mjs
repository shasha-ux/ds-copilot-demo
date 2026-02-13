import fs from 'node:fs';
import path from 'node:path';

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

export function appendRunHistory(historyFilePath, entry) {
  ensureDir(historyFilePath);
  fs.appendFileSync(historyFilePath, `${JSON.stringify(entry)}\n`);
}

export function readRunHistory(historyFilePath, limit = 50) {
  if (!fs.existsSync(historyFilePath)) {
    return [];
  }

  const raw = fs.readFileSync(historyFilePath, 'utf8').trim();
  if (!raw) return [];

  const rows = raw
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  return rows.slice(-limit).reverse();
}
