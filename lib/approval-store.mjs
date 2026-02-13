import fs from 'node:fs';
import path from 'node:path';

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function readAll(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  try {
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

function writeAll(filePath, rows) {
  ensureDir(filePath);
  fs.writeFileSync(filePath, JSON.stringify(rows, null, 2));
}

function now() {
  return new Date().toISOString();
}

function isExpired(item) {
  if (!item?.expiresAt) return false;
  return Date.now() > new Date(item.expiresAt).getTime();
}

function minutesToExpiry(item) {
  if (!item?.expiresAt) return null;
  const diffMs = new Date(item.expiresAt).getTime() - Date.now();
  return Math.floor(diffMs / 60000);
}

function effectiveStatus(item) {
  if (!item) return 'unknown';
  if (item.status === 'pending') return 'pending';
  if (item.status === 'approved') {
    if (item.tokenStatus === 'used') return 'used';
    if (isExpired(item)) return 'expired';
    return 'approved';
  }
  return item.status || 'unknown';
}

function addDerivedFields(item) {
  const mins = minutesToExpiry(item);
  return {
    ...item,
    effectiveStatus: effectiveStatus(item),
    minutesToExpiry: mins,
    expiringSoon: mins !== null && mins >= 0 && mins <= 10
  };
}

function cleanupExpired(rows) {
  return rows.map((item) => {
    if (item.status === 'approved' && item.tokenStatus === 'unused' && isExpired(item)) {
      return {
        ...item,
        tokenStatus: 'expired'
      };
    }
    return item;
  });
}

function olderThanDays(item, days) {
  const base = item?.approvedAt || item?.createdAt;
  if (!base) return false;
  const ageMs = Date.now() - new Date(base).getTime();
  return ageMs > Math.max(1, Number(days || 30)) * 24 * 60 * 60 * 1000;
}

export function createApprovalRequest(filePath, input = {}) {
  const rows = readAll(filePath);
  const id = `apr_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  const entry = {
    id,
    status: 'pending',
    action: input.action || 'deploy',
    stage: input.stage || 'deploy',
    scope: input.scope || 'global',
    projectId: input.projectId || null,
    reason: input.reason || 'Approval required by policy',
    summary: input.summary || {},
    metadata: input.metadata || {},
    requiredRoles: Array.isArray(input.requiredRoles) ? input.requiredRoles : [],
    expiresAt: input.expiresAt || null,
    createdAt: now(),
    approvedAt: null,
    approver: null,
    approverRole: null,
    comment: null,
    approvalToken: null,
    tokenStatus: 'none',
    tokenUsedAt: null,
    tokenUsedByAction: null
  };
  rows.unshift(entry);
  writeAll(filePath, rows);
  return entry;
}

export function approveRequest(filePath, requestId, approver, approverRole = 'viewer', comment = '') {
  const rows = readAll(filePath);
  const idx = rows.findIndex((item) => item.id === requestId);
  if (idx < 0) {
    throw new Error('Approval request not found');
  }
  rows[idx] = {
    ...rows[idx],
    status: 'approved',
    approvedAt: now(),
    approver: approver || 'unknown',
    approverRole: approverRole || 'viewer',
    comment,
    approvalToken: `token_${requestId}`,
    tokenStatus: 'unused',
    tokenUsedAt: null,
    tokenUsedByAction: null
  };
  writeAll(filePath, rows);
  return rows[idx];
}

export function listApprovals(filePath, status = '') {
  const rows = cleanupExpired(readAll(filePath));
  writeAll(filePath, rows);
  const mapped = rows.map((item) => addDerivedFields(item));
  if (!status) return mapped;
  return mapped.filter((item) => item.effectiveStatus === status || item.status === status);
}

export function getApproval(filePath, requestId) {
  const rows = cleanupExpired(readAll(filePath));
  writeAll(filePath, rows);
  const found = rows.find((item) => item.id === requestId);
  if (!found) return null;
  return addDerivedFields(found);
}

export function findByToken(filePath, token) {
  if (!token) return null;
  const rows = cleanupExpired(readAll(filePath));
  writeAll(filePath, rows);
  return rows.find((item) => item.approvalToken === token && item.status === 'approved') || null;
}

export function consumeByToken(filePath, token, action = '') {
  if (!token) return null;
  const rows = readAll(filePath);
  const idx = rows.findIndex((item) => item.approvalToken === token && item.status === 'approved');
  if (idx < 0) return null;
  rows[idx] = {
    ...rows[idx],
    tokenStatus: 'used',
    tokenUsedAt: now(),
    tokenUsedByAction: action || null
  };
  writeAll(filePath, rows);
  return rows[idx];
}

export function listExpiringApprovals(filePath, minutes = 10) {
  const rows = cleanupExpired(readAll(filePath));
  writeAll(filePath, rows);
  const threshold = Math.max(1, Number(minutes || 10));
  return rows
    .map((item) => addDerivedFields(item))
    .filter((item) => item.effectiveStatus === 'approved' && item.minutesToExpiry !== null && item.minutesToExpiry <= threshold);
}

export function cleanupOldApprovals(filePath, olderThan = 30) {
  const rows = cleanupExpired(readAll(filePath));
  const before = rows.length;
  const kept = rows.filter((item) => {
    const status = effectiveStatus(item);
    if (!['used', 'expired'].includes(status)) return true;
    return !olderThanDays(item, olderThan);
  });
  writeAll(filePath, kept);
  return {
    before,
    after: kept.length,
    removed: before - kept.length
  };
}
