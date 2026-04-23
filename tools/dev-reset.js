export const RESET_PHRASE = 'RESET';

const STATS_PREFIXES = ['stats_', 'undetermined_stats_'];
const SESSION_KEYS = ['guardian_session', 'guardian_sessions', 'visit_sessions'];
const CONFIG_KEY = 'guardian_config';

export function hasDevResetFlag(search) {
  const params = new URLSearchParams(search || '');
  return params.get('dev_reset') === '1';
}

export function canExecuteDevReset(installType, search) {
  return installType === 'development' && hasDevResetFlag(search);
}

export async function getInstallType(chromeLike = globalThis.chrome) {
  if (!chromeLike?.management?.getSelf) return 'unknown';
  return new Promise((resolve) => {
    chromeLike.management.getSelf((self) => resolve(self?.installType || 'unknown'));
  });
}

function baseResult(action) {
  return {
    success: true,
    scope: 'LOCAL ONLY',
    action,
    cleaned: [],
    skipped: [],
    errors: []
  };
}

export async function clearLocalStats(storageArea) {
  const result = baseResult('clear_local_stats');
  try {
    const all = await storageArea.get(null);
    const keys = Object.keys(all || {}).filter((k) => STATS_PREFIXES.some((p) => k.startsWith(p)));
    if (keys.length === 0) {
      result.skipped.push({ item: 'stats_* / undetermined_stats_*', reason: 'not_found' });
      return result;
    }
    await storageArea.remove(keys);
    result.cleaned.push({ item: 'stats_* / undetermined_stats_*', removed: keys.length });
    return result;
  } catch (e) {
    result.success = false;
    result.errors.push({ item: 'stats_* / undetermined_stats_*', message: e?.message || String(e) });
    return result;
  }
}

export async function clearLocalSessions(storageArea) {
  const result = baseResult('clear_local_sessions');
  try {
    const found = await storageArea.get(SESSION_KEYS);
    const keys = SESSION_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(found || {}, k));
    if (keys.length === 0) {
      result.skipped.push({ item: SESSION_KEYS.join(', '), reason: 'not_found' });
      return result;
    }
    await storageArea.remove(keys);
    result.cleaned.push({ item: SESSION_KEYS.join(', '), removed: keys.length });
    return result;
  } catch (e) {
    result.success = false;
    result.errors.push({ item: SESSION_KEYS.join(', '), message: e?.message || String(e) });
    return result;
  }
}

export async function clearLocalLocks(storageArea) {
  const result = baseResult('clear_local_locks');
  try {
    const found = await storageArea.get([CONFIG_KEY]);
    const config = found?.[CONFIG_KEY];
    if (!config || typeof config !== 'object') {
      result.skipped.push({ item: 'guardian_config', reason: 'not_found' });
      return result;
    }

    const next = { ...config };
    let removed = 0;

    const beforeLocked = Array.isArray(next.lockedDomains) ? next.lockedDomains.length : 0;
    if (beforeLocked > 0) removed += beforeLocked;
    next.lockedDomains = [];

    const qs = next.quotaState || {};
    const lockKeys = ['onlineLocked', 'studyLocked', 'restLocked', 'undeterminedLocked'];
    let changedFlags = 0;
    for (const k of lockKeys) {
      if (qs[k]) changedFlags++;
    }
    if (changedFlags > 0) removed += changedFlags;
    next.quotaState = { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false };

    await storageArea.set({ [CONFIG_KEY]: next });
    result.cleaned.push({ item: 'guardian_config.lockedDomains + guardian_config.quotaState', removed });
    return result;
  } catch (e) {
    result.success = false;
    result.errors.push({ item: 'guardian_config.lockedDomains/quotaState', message: e?.message || String(e) });
    return result;
  }
}

export async function requireDangerConfirm(confirmFn, promptFn) {
  const ok1 = !!confirmFn('危险操作：将执行本地数据清理。是否继续？');
  if (!ok1) return false;
  const phrase = String(promptFn('请输入 RESET 以确认执行：') || '').trim();
  return phrase === RESET_PHRASE;
}

function renderResult(panel, payload) {
  panel.textContent = JSON.stringify(payload, null, 2);
}

function setDisabledState(alertEl, actionsEl, reason) {
  alertEl.hidden = false;
  alertEl.textContent = reason;
  actionsEl.querySelectorAll('button').forEach((btn) => { btn.disabled = true; });
}

async function bindAction(btn, panel, storageArea, actionName, actionFn) {
  btn.addEventListener('click', async () => {
    const confirmed = await requireDangerConfirm(window.confirm.bind(window), window.prompt.bind(window));
    if (!confirmed) {
      renderResult(panel, {
        success: true,
        scope: 'LOCAL ONLY',
        action: actionName,
        cleaned: [],
        skipped: [{ item: actionName, reason: 'user_cancelled' }],
        errors: []
      });
      return;
    }
    const result = await actionFn(storageArea);
    renderResult(panel, result);
  });
}

export async function initDevResetPage(doc = document, chromeLike = globalThis.chrome, loc = window.location) {
  const panel = doc.getElementById('result-panel');
  const disabledAlert = doc.getElementById('disabled-alert');
  const localActions = doc.getElementById('local-actions');
  const btnStats = doc.getElementById('btn-clear-stats');
  const btnSessions = doc.getElementById('btn-clear-sessions');
  const btnLocks = doc.getElementById('btn-clear-locks');

  const installType = await getInstallType(chromeLike);
  if (!canExecuteDevReset(installType, loc.search)) {
    const reason = `已禁用：仅 development 且 URL 含 ?dev_reset=1 可执行。当前 installType=${installType || 'unknown'}。`;
    setDisabledState(disabledAlert, localActions, reason);
    renderResult(panel, {
      success: false,
      scope: 'LOCAL ONLY',
      action: 'init',
      cleaned: [],
      skipped: [{ item: 'all_actions', reason: 'dev_guard_not_passed' }],
      errors: []
    });
    return;
  }

  const storageArea = chromeLike.storage.local;
  await bindAction(btnStats, panel, storageArea, 'clear_local_stats', clearLocalStats);
  await bindAction(btnSessions, panel, storageArea, 'clear_local_sessions', clearLocalSessions);
  await bindAction(btnLocks, panel, storageArea, 'clear_local_locks', clearLocalLocks);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  initDevResetPage().catch((e) => {
    const panel = document.getElementById('result-panel');
    if (panel) {
      panel.textContent = JSON.stringify({
        success: false,
        scope: 'LOCAL ONLY',
        action: 'init',
        cleaned: [],
        skipped: [],
        errors: [{ item: 'init', message: e?.message || String(e) }]
      }, null, 2);
    }
  });
}
