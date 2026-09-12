import { QUOTA_AUDIT_KEYS, buildQuotaAuditSnapshot, validateQuotaAuditRequest } from '../core/quota-audit.js';
import { budgetedLocalSet } from './storage-budget.js';
import { budgetedSessionSet } from './session-storage-budget.js';

const BUFFER = 'quota_audit_buffer_v1';
const MARKERS = 'quota_audit_requests_v1';
const allowed = (policy, deviceId, now) => policy?.uploadEnabled === true &&
  (!policy.expiresAt || policy.expiresAt > now) &&
  (!policy.targetDeviceIds?.length || policy.targetDeviceIds.includes(deviceId));

async function finishAudit(buffer, request) {
  const latest = (await chrome.storage.local.get(MARKERS))[MARKERS] || [];
  const saved = await budgetedLocalSet({ [MARKERS]: latest.map(m => m.requestId === request.requestId
    ? { ...m, complete: true, evidenceComplete: !buffer.failed } : m) }, { priority: 'diagnostic', source: 'quota_audit' });
  if (saved?.ok === false) return { error: 'audit_completion_write_failed' };
  await chrome.storage.session.remove(BUFFER);
  return { complete: !buffer.failed, failed: buffer.failed };
}

// One bounded batch per ordinary sync; this never mutates an accounting key.
export async function pumpQuotaAudit(upload, now = Date.now()) {
  try {
    const config = await chrome.storage.local.get(['guardian_config', 'cloud_device_id', MARKERS]);
    const policy = config.guardian_config?.clientLoggingPolicyV1;
    const request = policy?.quotaAuditRequest;
    if (!request || !allowed(policy, config.cloud_device_id, now) || request.deviceId !== config.cloud_device_id ||
        !validateQuotaAuditRequest(request, now)) {
      await chrome.storage.session.remove(BUFFER);
      return { skipped: 'not_authorized' };
    }
    let buffer = (await chrome.storage.session.get(BUFFER))[BUFFER];
    const markers = Array.isArray(config[MARKERS]) ? config[MARKERS] : [];
    const marked = markers.find(m => m.requestId === request.requestId);
    if (!buffer || buffer.requestId !== request.requestId) {
      if (marked?.complete) return { complete: marked.evidenceComplete === true };
      if (marked) {
        // Never silently replace a lost snapshot with a different cutoff.
        buffer = { requestId: request.requestId, packets: [{ kind: 'failure', requestId: request.requestId,
          snapshotId: marked.snapshotId, reason: 'audit_buffer_lost', cutoff: marked.cutoff }], next: 0, failed: true };
      } else {
        const snapshotId = crypto.randomUUID();
        const marker = { requestId: request.requestId, snapshotId, cutoff: now, complete: false };
        const saved = await budgetedLocalSet({ [MARKERS]: [...markers.filter(m => now - m.cutoff < 86400000), marker].slice(-20) },
          { priority: 'diagnostic', source: 'quota_audit' });
        if (saved?.ok === false) return { error: 'audit_marker_write_failed' };
        let packets;
        try {
          const data = await chrome.storage.local.get(QUOTA_AUDIT_KEYS);
          packets = await buildQuotaAuditSnapshot(data, request, Date.now(), snapshotId);
        } catch (error) {
          const reason = ['audit_snapshot_too_large', 'audit_invalid_segment_identity', 'audit_invalid_pending_identity'].includes(error?.message)
            ? error.message : 'audit_snapshot_read_failed';
          packets = [{ kind: 'failure', requestId: request.requestId, snapshotId, cutoff: now, reason }];
        }
        buffer = { requestId: request.requestId, packets, next: 0, failed: packets[0].kind === 'failure' };
      }
      const saved = await budgetedSessionSet({ [BUFFER]: buffer }, { priority: 'diagnostic', source: 'quota_audit' });
      if (!saved.ok) return { error: 'audit_buffer_write_failed' };
    }
    // Recheck consent immediately before transport; config can change during snapshot creation.
    const current = (await chrome.storage.local.get('guardian_config')).guardian_config?.clientLoggingPolicyV1;
    if (!allowed(current, config.cloud_device_id, Date.now()) || current?.quotaAuditRequest?.requestId !== request.requestId || request.expiresAt <= Date.now()) return { skipped: 'authorization_changed' };
    if (buffer.next === buffer.packets.length) return await finishAudit(buffer, request);
    const batch = buffer.packets.slice(buffer.next, buffer.next + 10);
    const logs = batch.map((packet, i) => ({ id: `qa_${packet.snapshotId}_${buffer.next + i}`, timestamp: now,
      level: 'info', category: 'cloud', eventCode: 'quota_audit_packet', message: 'Read-only quota audit',
      extensionVersion: chrome.runtime.getManifest().version, details: packet }));
    const response = await upload('/device/client-logs/v1', { method: 'POST', body: JSON.stringify({ logs }) });
    const accepted = new Set(response?.acceptedIds || []);
    // Only move a contiguous ACK prefix; replay uses stable log IDs (INSERT OR IGNORE).
    let count = 0;
    while (count < logs.length && accepted.has(logs[count].id)) count++;
    buffer.next += count;
    const saved = await budgetedSessionSet({ [BUFFER]: buffer }, { priority: 'diagnostic', source: 'quota_audit' });
    if (!saved.ok) return { error: 'audit_progress_write_failed' };
    if (buffer.next === buffer.packets.length) {
      return await finishAudit(buffer, request);
    }
    return { pendingPackets: buffer.packets.length - buffer.next, missingAck: count < logs.length };
  } catch (_) {
    return { error: 'audit_transport_or_storage_failed' };
  }
}
