import { authenticateLifecycle, authenticateModule } from './auth';
import {
  createNativeMac,
  decideApplication,
  deleteNativeChild,
  ensureNativeChild,
  listApplications,
  listApplicationMerges,
  listNativeMacs,
  mergeApplication,
  revokeNativeMac,
  rotateEnrollment,
  unmergeApplication,
} from './repository';
import type { Env } from './types';

const APPLICATION_DECISION_RE = /^\/native\/v1\/applications\/([^/]+)\/decision$/;
const APPLICATION_MERGE_RE = /^\/native\/v1\/applications\/([^/]+)\/merge$/;
const APPLICATION_UNMERGE_RE = /^\/native\/v1\/applications\/([^/]+)\/unmerge$/;
const MAC_REVOKE_RE = /^\/native\/v1\/macs\/([^/]+)\/revoke$/;
const MAC_ROTATE_RE = /^\/native\/v1\/macs\/([^/]+)\/rotate-enrollment$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

async function bodyObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body)
      ? body as Record<string, unknown>
      : {};
  } catch {
    return {};
  }
}

export async function handleAdminRequest(request: Request, env: Env): Promise<Response | null> {
  const path = new URL(request.url).pathname;

  if (path === '/identity/v1/child-lifecycle') {
    if (request.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
    const claims = await authenticateLifecycle(request, env);
    if (!claims) return json({ error: 'unauthorized' }, 401);
    await deleteNativeChild(env, claims.account_id, claims.child_id);
    return json({ success: true });
  }

  if (!path.startsWith('/native/v1/')) return null;
  const auth = await authenticateModule(request, env);
  if (!auth) return json({ error: 'unauthorized' }, 401);
  const body = request.method === 'GET' ? {} : await bodyObject(request);
  await ensureNativeChild(
    env,
    auth,
    typeof body.childName === 'string' ? body.childName : auth.child_name
  );

  if (path === '/native/v1/child' && request.method === 'GET') {
    return json({ accountId: auth.account_id, childId: auth.child_id });
  }

  if (path === '/native/v1/macs' && request.method === 'GET') {
    return json({ data: await listNativeMacs(env, auth) });
  }

  if (path === '/native/v1/macs' && request.method === 'POST') {
    const displayName = String(body.displayName || '').trim();
    if (!displayName || displayName.length > 120) return json({ error: 'invalid_display_name' }, 400);
    return json({ data: await createNativeMac(env, auth, displayName) }, 201);
  }

  const revokeMatch = path.match(MAC_REVOKE_RE);
  if (revokeMatch && request.method === 'POST') {
    return await revokeNativeMac(env, auth, revokeMatch[1])
      ? json({ success: true })
      : json({ error: 'native_mac_not_found' }, 404);
  }

  const rotateMatch = path.match(MAC_ROTATE_RE);
  if (rotateMatch && request.method === 'POST') {
    const enrollment = await rotateEnrollment(env, auth, rotateMatch[1]);
    return enrollment ? json({ data: enrollment }) : json({ error: 'native_mac_not_found' }, 404);
  }

  if (path === '/native/v1/applications' && request.method === 'GET') {
    const state = new URL(request.url).searchParams.get('state') || undefined;
    return json({ data: await listApplications(env, auth, state) });
  }

  if (path === '/native/v1/application-merges' && request.method === 'GET') {
    return json({ data: await listApplicationMerges(env, auth) });
  }

  const decisionMatch = path.match(APPLICATION_DECISION_RE);
  if (decisionMatch && request.method === 'POST') {
    const action = String(body.action || '').toUpperCase();
    if (!['IGNORE', 'BLOCK', 'BLOCK_PUBLISHER'].includes(action)) {
      return json({ error: 'invalid_action' }, 400);
    }
    try {
      const changed = await decideApplication(
        env,
        auth,
        decisionMatch[1],
        action as 'IGNORE' | 'BLOCK' | 'BLOCK_PUBLISHER'
      );
      return changed ? json({ success: true }) : json({ error: 'application_not_found' }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'decision_failed' }, 409);
    }
  }

  const mergeMatch = path.match(APPLICATION_MERGE_RE);
  if (mergeMatch && request.method === 'POST') {
    const targetApplicationId = String(body.targetApplicationId || '');
    return await mergeApplication(env, auth, mergeMatch[1], targetApplicationId)
      ? json({ success: true })
      : json({ error: 'merge_not_allowed' }, 409);
  }

  const unmergeMatch = path.match(APPLICATION_UNMERGE_RE);
  if (unmergeMatch && request.method === 'POST') {
    return await unmergeApplication(env, auth, unmergeMatch[1])
      ? json({ success: true })
      : json({ error: 'unmerge_not_allowed' }, 409);
  }

  return json({ error: 'not_found' }, 404);
}
