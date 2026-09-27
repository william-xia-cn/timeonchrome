// Generic host for optional runtime modules. The base extension remains functional with no modules installed.

const modules = new Map();
const moduleDiagnostics = new Map();

function recordModuleDiagnostic(runtime, hook, error) {
  const id = String(runtime?.id || 'unknown-module');
  const previous = moduleDiagnostics.get(id) || {};
  const diagnostic = {
    id,
    hook,
    errorCount: Math.max(0, Number(previous.errorCount || 0)) + 1,
    lastErrorAt: Date.now(),
    lastError: String(error?.message || error || 'optional_module_error').slice(0, 500),
  };
  moduleDiagnostics.set(id, diagnostic);
  console.warn(`[OptionalModuleHost] ${id}.${hook} failed:`, diagnostic.lastError);
  return diagnostic;
}

function normalizeModule(runtime) {
  if (!runtime || typeof runtime !== 'object') return null;
  const id = String(runtime.id || '').trim();
  if (!id) return null;
  return { ...runtime, id };
}

export function registerOptionalModule(runtime) {
  const normalized = normalizeModule(runtime);
  if (!normalized) throw new Error('Optional module must provide an id');
  modules.set(normalized.id, normalized);
  return () => modules.delete(normalized.id);
}

export async function activateOptionalModule(runtime) {
  let unregister = null;
  try {
    unregister = registerOptionalModule(runtime);
    await runtime?.start?.();
    return { ok: true, id: runtime.id, unregister };
  } catch (error) {
    unregister?.();
    recordModuleDiagnostic(runtime, 'start', error);
    return { ok: false, skipped: true, reason: 'module_activation_failed' };
  }
}

export async function beforeAccess(context = {}) {
  for (const runtime of modules.values()) {
    try {
      const result = await runtime.beforeAccess?.(context);
      if (result?.handled === true) return { ...result, optionalModuleId: runtime.id };
    } catch (error) {
      recordModuleDiagnostic(runtime, 'beforeAccess', error);
    }
  }
  return { handled: false };
}

export async function dispatchOptionalModuleMessage(message, sender) {
  const requestedId = String(message?.optionalModuleId || '').trim();
  const candidates = requestedId ? [modules.get(requestedId)].filter(Boolean) : [...modules.values()];
  for (const runtime of candidates) {
    try {
      const result = await runtime.handleMessage?.(message, sender);
      if (result?.handled === true) return { ...result, optionalModuleId: runtime.id };
    } catch (error) {
      recordModuleDiagnostic(runtime, 'handleMessage', error);
      if (requestedId) {
        return {
          handled: true,
          optionalModuleId: runtime.id,
          response: { ok: false, code: 'OPTIONAL_MODULE_ERROR', error: '扩展模块暂时不可用' },
        };
      }
    }
  }
  return { handled: false };
}

export async function dispatchOptionalModuleAlarm(alarm) {
  const handledBy = [];
  for (const runtime of modules.values()) {
    try {
      const result = await runtime.handleAlarm?.(alarm);
      if (result?.handled === true) handledBy.push(runtime.id);
    } catch (error) {
      recordModuleDiagnostic(runtime, 'handleAlarm', error);
    }
  }
  return { handled: handledBy.length > 0, handledBy };
}

export async function notifyOptionalModules(event, payload = {}) {
  for (const runtime of modules.values()) {
    try {
      await runtime.handleLifecycle?.(event, payload);
    } catch (error) {
      recordModuleDiagnostic(runtime, 'handleLifecycle', error);
    }
  }
}

export function getOptionalModuleEntries() {
  return [...modules.values()]
    .map((runtime) => ({ ...(runtime.entry || {}), id: runtime.id }))
    .filter((entry) => entry.href || entry.inlineScript);
}

export function getOptionalModuleDiagnostics(id = null) {
  if (id != null) return moduleDiagnostics.get(String(id)) || null;
  return [...moduleDiagnostics.values()].map((item) => ({ ...item }));
}

export function resetOptionalModulesForTest() {
  modules.clear();
  moduleDiagnostics.clear();
}
