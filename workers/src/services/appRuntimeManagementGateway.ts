import { json } from '../db/middleware';
import { handleAppRuntimeAccountToken } from './appRuntimeIdentityBridge';

const PREFIX = '/app-runtime/manage/v1/';
type GatewayEnv = Parameters<typeof handleAppRuntimeAccountToken>[1];
const resources: Record<string, { methods: readonly string[]; query: readonly string[] }> = {
  'application-knowledge': { methods: ['GET', 'PUT'], query: [] },
  'application-knowledge/operations': { methods: ['POST'], query: [] },
  'application-knowledge/import-preview': { methods: ['POST'], query: [] },
  'application-knowledge/import-approve': { methods: ['POST'], query: [] },
  'application-inventory': { methods: ['GET'], query: [] },
  'app-policy': { methods: ['GET', 'PUT'], query: ['childId'] },
  'shared-access-policy': { methods: ['GET'], query: ['childId'] },
  'app-catalog': { methods: ['GET'], query: ['childId', 'platform'] },
  'app-classification-records': { methods: ['GET'], query: ['childId', 'platform'] },
  'machines': { methods: ['GET'], query: [] },
  'pairing-codes': { methods: ['POST'], query: [] },
  'logging-policy': { methods: ['GET', 'PUT'], query: ['machineId'] },
  'runtime-logs': { methods: ['GET'], query: ['childId', 'fromMs', 'toMs', 'limit', 'cursor', 'machineId', 'level', 'category'] },
};

function route(resource: string): { methods: readonly string[]; query: readonly string[] } | null {
  if (Object.hasOwn(resources, resource)) return resources[resource];
  // Opaque machine/user keys only. No percent-encoded separators or arbitrary destination URL.
  if (/^machines\/[A-Za-z0-9_-]+\/users$/.test(resource)) return { methods: ['GET'], query: [] };
  if (/^machines\/[A-Za-z0-9_-]+\/(?:default-assignment|users\/[A-Za-z0-9_-]+)$/.test(resource))
    return { methods: ['PATCH'], query: [] };
  if (/^machines\/[A-Za-z0-9_-]+\/(?:revoke|uninstall-codes)$/.test(resource))
    return { methods: ['POST'], query: [] };
  return null;
}

function failure(code: string, status: number): Response {
  const response = json({ error: code, code }, status);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

/** Main-console transport, not another identity/configuration authority. */
export async function handleAppRuntimeManagement(request: Request, env: GatewayEnv): Promise<Response> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith(PREFIX)) return failure('RUNTIME_MANAGEMENT_NOT_FOUND', 404);
  const resource = url.pathname.slice(PREFIX.length);
  const allowed = route(resource);
  if (!allowed) return failure('RUNTIME_MANAGEMENT_NOT_FOUND', 404);
  if (!allowed.methods.includes(request.method)) {
    const response = failure('RUNTIME_MANAGEMENT_METHOD_NOT_ALLOWED', 405);
    response.headers.set('Allow', allowed.methods.join(', '));
    return response;
  }
  if ([...url.searchParams.keys()].some(key => !allowed.query.includes(key)
      || url.searchParams.getAll(key).length !== 1)) return failure('RUNTIME_MANAGEMENT_INVALID_QUERY', 400);
  try {
    // Only the existing Guardian session may issue the internal module credential.
    const issued = await handleAppRuntimeAccountToken(new Request('https://guardian.internal/app-runtime/account-token', {
      method: 'POST', headers: { Authorization: request.headers.get('Authorization') || '' },
    }), env);
    if (issued.status === 401) return failure('UNAUTHORIZED', 401);
    if (!issued.ok) return failure('RUNTIME_MANAGEMENT_IDENTITY_UNAVAILABLE', 503);
    if (!env.APP_RUNTIME_SERVICE) return failure('RUNTIME_MANAGEMENT_UNAVAILABLE', 503);
    const credential: unknown = await issued.json();
    if (!credential || typeof credential !== 'object' || !('token' in credential)
        || typeof credential.token !== 'string' || !credential.token)
      return failure('RUNTIME_MANAGEMENT_IDENTITY_UNAVAILABLE', 503);
    const headers = new Headers({ Authorization: `Bearer ${credential.token}` });
    for (const key of ['Content-Type', 'If-Match']) {
      const value = request.headers.get(key);
      if (value) headers.set(key, value);
    }
    const upstream = await env.APP_RUNTIME_SERVICE.fetch(`https://app-runtime.internal/v2/module/${resource}${url.search}`, {
      method: request.method, headers, body: request.body, redirect: 'manual', signal: request.signal,
    });
    if (upstream.status >= 300 && upstream.status < 400) {
      await upstream.body?.cancel();
      return failure('RUNTIME_MANAGEMENT_INVALID_RESPONSE', 502);
    }
    const responseHeaders = new Headers({ 'Cache-Control': 'no-store' });
    for (const key of ['Content-Type', 'ETag', 'Allow', 'Retry-After']) {
      const value = upstream.headers.get(key);
      if (value) responseHeaders.set(key, value);
    }
    // Runtime retains account/Child/machine authorization, ETag and validation semantics.
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  } catch {
    // Do not return exception text, internal addresses, JWTs or raw database failures.
    return failure('RUNTIME_MANAGEMENT_UNAVAILABLE', 503);
  }
}
