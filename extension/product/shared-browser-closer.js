import { readDeploymentProfile, readNativeHostDevelopmentMarker } from '../core/deployment-mode.js';

export async function readSharedBrowserCloseCapability({ runtime = chrome.runtime,
  permissions = chrome.permissions, readMarker = readDeploymentProfile,
  isDevelopment = readNativeHostDevelopmentMarker } = {}) {
  try {
    const marker = await readMarker();
    if (marker?.sharedBrowserCloseDevelopment !== true || !await isDevelopment()
      || !runtime.getManifest().permissions?.includes('debugger')
      || !await permissions?.contains({ permissions: ['debugger'] })) {
      return { available: false, errorCode: 'shared_browser_close_permission_unavailable' };
    }
    return { available: true };
  } catch (_) { return { available: false, errorCode: 'shared_browser_close_permission_unavailable' }; }
}

// Removal events, not CDP command success, prove the target really ended.
export function createSharedBrowserCloser({ tabs = chrome.tabs, debuggerApi = chrome.debugger,
  timeoutMs = 15000, readCapability = readSharedBrowserCloseCapability } = {}) {
  return { async close(target, effect, isCurrent) {
    const capability = await readCapability();
    if (!capability.available) return { outcome: 'failed', reason: capability.errorCode };
    if (!debuggerApi || !['request-normal-close', 'force-close'].includes(effect)) return { outcome: 'failed', reason: 'debugger_unavailable' };
    let removed = false, canceled = false, attached = false, finished = false, closeRequested = false,
      closingDialog = false, timer, finish;
    const debuggee = { tabId: target.id };
    const result = new Promise(resolve => { finish = resolve; timer = setTimeout(() => resolve('failed'), timeoutMs); });
    const bounded = operation => Promise.race([Promise.resolve().then(operation),
      result.then(() => { throw Error('target_close_deadline'); })]);
    const onRemoved = id => { if (id === target.id) { removed = true; finish('completed'); } };
    const onEvent = (source, method, params) => {
      if (source.tabId !== target.id) return;
      if (method === 'Page.javascriptDialogOpening') closingDialog = closeRequested && params.type === 'beforeunload';
      if (closingDialog && method === 'Page.javascriptDialogClosed' && params.result === false
        && effect === 'request-normal-close') { canceled = true; finish('canceled'); }
    };
    const matches = async () => {
      const tab = await bounded(() => tabs.get(target.id));
      return tab.id === target.id && tab.windowId === target.windowId && tab.url === target.url
        && await bounded(isCurrent);
    };
    tabs.onRemoved.addListener(onRemoved); debuggerApi.onEvent.addListener(onEvent);
    try {
      if (!await matches()) return { outcome: 'stale' };
      await bounded(async () => {
        await debuggerApi.attach(debuggee, '1.3');
        if (finished) { void debuggerApi.detach(debuggee).catch(() => {}); return; }
        attached = true;
      });
      await bounded(() => debuggerApi.sendCommand(debuggee, 'Page.enable'));
      const targets = effect === 'force-close' ? await bounded(() => debuggerApi.getTargets()) : null;
      const exactTarget = targets?.find(t => t.tabId === target.id && t.type === 'page' && t.url === target.url);
      if (!await matches() || effect === 'force-close' && !exactTarget) return { outcome: 'stale' };
      // The promise may reject when the target is destroyed. Wait for the real event in either case.
      closeRequested = true;
      Promise.resolve(debuggerApi.sendCommand(debuggee, effect === 'force-close' ? 'Target.closeTarget' : 'Page.close',
        effect === 'force-close' ? { targetId: exactTarget.id } : {})).catch(() => {});
      const observed = await result;
      return { outcome: removed ? 'completed' : canceled ? 'canceled' : observed };
    } catch (_) { return { outcome: removed ? 'completed' : 'failed', reason: 'target_close_unverified' }; }
    finally {
      finished = true;
      clearTimeout(timer); tabs.onRemoved.removeListener(onRemoved); debuggerApi.onEvent.removeListener(onEvent);
      if (attached && !removed) void debuggerApi.detach(debuggee).catch(() => {});
    }
  } };
}
