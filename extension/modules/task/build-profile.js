const DEVELOPMENT_PROFILE = Object.freeze({
  mode: 'development',
  production: false,
  taskLocalDebugEnabled: true,
  source: 'unpacked_default',
});

let profilePromise = null;

async function loadTaskBuildProfile() {
  const runtime = globalThis.chrome?.runtime;
  if (!runtime?.getURL || typeof globalThis.fetch !== 'function') return { ...DEVELOPMENT_PROFILE };
  try {
    const response = await globalThis.fetch(runtime.getURL('deployment-profile.json'), { cache: 'no-store' });
    if (!response?.ok) return { ...DEVELOPMENT_PROFILE };
    const raw = await response.json();
    const production = raw?.production === true;
    return {
      mode: String(raw?.mode || (production ? 'production' : 'development')),
      production,
      taskLocalDebugEnabled: production
        ? raw?.taskLocalDebugEnabled === true
        : raw?.taskLocalDebugEnabled !== false,
      source: 'deployment_profile',
    };
  } catch {
    return { ...DEVELOPMENT_PROFILE };
  }
}

export function getTaskBuildProfile() {
  if (!profilePromise) profilePromise = loadTaskBuildProfile();
  return profilePromise;
}

export async function isTaskLocalDebugEnabled() {
  return (await getTaskBuildProfile()).taskLocalDebugEnabled === true;
}

export function resetTaskBuildProfileForTest() {
  profilePromise = null;
}