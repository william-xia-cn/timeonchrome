// Health-only macOS transport. It never negotiates Native business capabilities.
export const MAC_GUARDIAN_HOST = 'com.timeonchrome.guardian';
export const MAC_GUARDIAN_ALARM = 'timeonchromeMacGuardianHeartbeat';
export const MAC_GUARDIAN_STATUS_KEY = 'mac_guardian_health_status_v1';

export function createMacGuardianHealthClient({ runtime, alarms, enabled, readContext, saveStatus,
  now = Date.now, timers = globalThis }) {
  let port = null, interval = null, pending = null, active = null, queuedProbe = false, queuedHeartbeat = null;
  let lastAttempt = null, lastProbe = null, failures = 0, lastSuccess = null;
  const statuses = new Set(['booting', 'active', 'degraded', 'disabled_by_policy', 'privacy_consent_required']);
  const persist = async (errorCode, trigger) => {
    try {
      await saveStatus({ lastAttemptAt: lastAttempt, lastSuccessAt: lastSuccess,
        lastErrorCode: errorCode, consecutiveFailures: failures, portConnected: port !== null, lastTrigger: trigger });
    } catch (_) { /* Diagnostics never affect monitoring or another transport. */ }
  };
  const disconnect = () => {
    const old = port;
    port = null;
    if (interval !== null) timers.clearInterval(interval);
    interval = null;
    try { old?.disconnect(); } catch (_) { /* Best effort. */ }
  };
  const reject = code => {
    if (!pending) return;
    const request = pending;
    pending = null;
    timers.clearTimeout(request.timeout);
    request.reject(new Error(code));
  };
  function connect() {
    if (port) return port;
    let next;
    try { next = runtime.connectNative(MAC_GUARDIAN_HOST); }
    catch (_) { throw new Error('guardian_host_unavailable'); }
    if (!next?.postMessage || !next?.onMessage?.addListener || !next?.onDisconnect?.addListener) {
      throw new Error('guardian_host_unavailable');
    }
    port = next;
    next.onMessage.addListener(response => {
      if (port !== next || !pending) return;
      if (response?.ok !== true || !Number.isFinite(response.receivedAt) || response.receivedAt <= 0) {
        reject('guardian_invalid_response');
        disconnect();
        return;
      }
      const request = pending;
      pending = null;
      timers.clearTimeout(request.timeout);
      request.resolve({ ok: true });
    });
    next.onDisconnect.addListener(() => {
      if (port !== next) return;
      const waiting = pending !== null;
      reject('guardian_port_disconnected');
      disconnect();
      if (!waiting) persist('guardian_port_disconnected', 'port_disconnect').catch(() => {});
    });
    interval = timers.setInterval(() => { request({ trigger: 'port_timer' }).catch(() => {}); }, 60_000);
    return next;
  }
  async function send(type, trigger) {
    try {
      const context = await readContext();
      if (!context || !statuses.has(context.monitoringStatus)
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(context.profile)) {
        throw new Error('guardian_health_unavailable');
      }
      const payload = { type, extensionId: runtime.id, profile: context.profile,
        version: runtime.getManifest().version, monitoringStatus: context.monitoringStatus,
        policyHash: /^[0-9a-f]{64}$/.test(context.policyHash) ? context.policyHash : null };
      const target = connect();
      await new Promise((resolve, rejectPromise) => {
        const timeout = timers.setTimeout(() => {
          if (pending?.timeout !== timeout) return;
          reject('guardian_response_timeout');
          disconnect();
        }, 3_000);
        pending = { resolve, reject: rejectPromise, timeout };
        try { target.postMessage(payload); }
        catch (_) { reject('guardian_post_failed'); disconnect(); }
      });
      failures = 0;
      lastSuccess = now();
      await persist(null, trigger);
      return { ok: true };
    } catch (error) {
      const codes = new Set(['guardian_host_unavailable', 'guardian_port_disconnected',
        'guardian_response_timeout', 'guardian_invalid_response', 'guardian_post_failed']);
      const code = codes.has(error?.message) ? error.message : 'guardian_health_unavailable';
      failures = Math.min(9999, failures + 1);
      await persist(code, trigger);
      return { ok: false, errorCode: code };
    }
  }
  function start(type, trigger) {
    const task = send(type, trigger);
    active = task;
    task.finally(() => {
      if (active === task) active = null;
      if (queuedProbe) {
        queuedProbe = false;
        lastAttempt = now();
        start('probe', 'queued_probe');
      } else if (queuedHeartbeat !== null) {
        const trigger = queuedHeartbeat;
        queuedHeartbeat = null;
        lastAttempt = now();
        start('heartbeat', trigger);
      }
    }).catch(() => {});
    return task;
  }
  async function request({ type = 'heartbeat', trigger = 'scheduled', force = false } = {}) {
    try {
      // Platform failure is a skip, not evidence that local monitoring has failed.
      if ((await runtime.getPlatformInfo())?.os !== 'mac' || !await enabled()) return { skipped: true };
    } catch (_) { return { skipped: true }; }
    const time = now();
    if (type === 'probe') {
      if (lastProbe !== null && time - lastProbe < 5_000) return { skipped: true };
      lastProbe = time;
      if (active) { queuedProbe = true; return { queued: true }; }
    } else if (active) {
      if (force) queuedHeartbeat = String(trigger).slice(0, 48);
      return { queued: force, skipped: !force };
    } else if (!force && lastAttempt !== null && time - lastAttempt < 55_000) {
      return { skipped: true };
    }
    lastAttempt = time;
    return start(type === 'probe' ? 'probe' : 'heartbeat', String(trigger).slice(0, 48));
  }
  alarms.onAlarm.addListener(alarm => {
    if (alarm?.name === MAC_GUARDIAN_ALARM) request({ trigger: 'alarm' }).catch(() => {});
  });
  runtime.onStartup.addListener(() => { request({ trigger: 'onStartup', force: true }).catch(() => {}); });
  runtime.onInstalled.addListener(() => { request({ trigger: 'onInstalled', force: true }).catch(() => {}); });
  runtime.onMessage.addListener((message, sender) => {
    if (['TIMEONCHROME_LOCAL_HEALTH_PROBE', 'TIMEONCHROME_LOCAL_HEALTH_RECHECK'].includes(message?.type)
      && sender?.id === runtime.id) {
      const page = message.type === 'TIMEONCHROME_LOCAL_HEALTH_PROBE' ? 'health-probe.html' : 'admin/admin.html';
      try {
        const actual = new URL(sender.url), expected = new URL(runtime.getURL(page));
        if (actual.origin === expected.origin && actual.pathname === expected.pathname) {
          request({ type: 'probe', trigger: 'health_probe', force: true }).catch(() => {});
        }
      } catch (_) { /* Reject untrusted senders without responding twice. */ }
    }
    return false;
  });
  Promise.resolve().then(async () => {
    if ((await runtime.getPlatformInfo())?.os !== 'mac' || !await enabled()) return;
    const alarm = await alarms.get(MAC_GUARDIAN_ALARM);
    if (alarm?.periodInMinutes !== 1) await alarms.create(MAC_GUARDIAN_ALARM, { periodInMinutes: 1 });
    await request({ trigger: 'service_worker_load', force: true });
  }).catch(() => {});
  return { request };
}
