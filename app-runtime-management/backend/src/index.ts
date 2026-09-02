import { requireDevice, requireLifecycle, requireModule } from './auth';
import { errorResponse, HttpError, jsonResponse, methodNotAllowed, readJsonBody } from './http';
import {
  createModulePairingCode, deleteRuntimeChild, enrollDevice, listModuleDevices,
  persistSegments, queryModuleUsage, recordHeartbeat, revokeModuleDevice,
} from './repository';
import {
  parseEnrollDevice,
  parseUploadRequest,
  validateSegment,
} from './validation';
import { routeV2 } from './v2Routes';
import { deleteRuntimeChildV2 } from './v2Repository';

interface WindowsV2ReleaseManifest {
  version: string;
  platform: string;
  architecture: string;
  bootstrapperPath: string;
  bootstrapperSha256: string;
  bootstrapperSizeBytes: number;
}

interface WindowsInstallerRelease {
  object: R2ObjectBody;
  fileName: string;
  contentType: string;
  sha256?: string;
}

async function getWindowsInstallerRelease(env: Env, version: string): Promise<WindowsInstallerRelease | null> {
  const majorVersion = Number.parseInt(version.split('.')[0] ?? '', 10);
  if (majorVersion < 2) {
    const fileName = `TimeOnChrome-AppRuntime-win-x64-${version}.msi`;
    const object = await env.RELEASES.get(`windows/x64/${version}/${fileName}`);
    return object ? { object, fileName, contentType: 'application/x-msi' } : null;
  }

  const versionPrefix = `windows/x64/${version}/`;
  const expectedFileName = `TimeOnChrome-AppRuntime-Setup-win-x64-${version}.exe`;
  const expectedPath = `${versionPrefix}${expectedFileName}`;
  const manifestObject = await env.RELEASES.get(`${versionPrefix}manifest.json`);
  if (!manifestObject) return null;

  const manifest = await manifestObject.json<WindowsV2ReleaseManifest>().catch(() => null);
  if (!manifest
      || manifest.version !== version
      || manifest.platform !== 'windows'
      || manifest.architecture !== 'x64'
      || manifest.bootstrapperPath !== expectedPath
      || !/^[a-f0-9]{64}$/u.test(manifest.bootstrapperSha256)
      || !Number.isSafeInteger(manifest.bootstrapperSizeBytes)
      || manifest.bootstrapperSizeBytes <= 0) {
    return null;
  }

  const object = await env.RELEASES.get(expectedPath);
  if (!object || object.size !== manifest.bootstrapperSizeBytes) return null;
  return {
    object,
    fileName: expectedFileName,
    contentType: 'application/octet-stream',
    sha256: manifest.bootstrapperSha256,
  };
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const nowMs = Date.now();

  const v2 = await routeV2(request, env, nowMs);
  if (v2) return v2;

  if (url.pathname === '/v1/health') {
    return request.method === 'GET'
      ? jsonResponse({ status: 'ok', service: 'app-runtime', schemaVersion: 1 })
      : methodNotAllowed('GET');
  }

  if (url.pathname === '/v1/releases/windows/x64/latest') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const object = await env.RELEASES.get('windows/x64/latest.json');
    if (!object) return errorResponse(404, 'RELEASE_NOT_FOUND', 'Windows installer is not available.');
    const response = new Response(object.body, { headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
      etag: object.httpEtag,
    } });
    return response;
  }

  const installerMatch = url.pathname.match(/^\/v1\/releases\/windows\/x64\/([0-9]+\.[0-9]+\.[0-9]+)\/installer$/);
  if (installerMatch) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const version = installerMatch[1]!;
    const release = await getWindowsInstallerRelease(env, version);
    if (!release) return errorResponse(404, 'RELEASE_NOT_FOUND', 'Windows installer is not available.');
    const headers = new Headers({
      'content-type': release.contentType,
      'content-length': String(release.object.size),
      'content-disposition': `attachment; filename="${release.fileName}"`,
      'cache-control': 'public, max-age=31536000, immutable',
      etag: release.object.httpEtag,
      'x-content-type-options': 'nosniff',
    });
    if (release.sha256) headers.set('x-release-sha256', release.sha256);
    return new Response(release.object.body, { headers });
  }

  if (url.pathname.startsWith('/v1/module/')) {
    const module = await requireModule(request, env, nowMs);
    const owner = { account_id: module.account_id, child_id: module.child_id, child_name: module.child_name, jti: module.jti };
    if (url.pathname === '/v1/module/pairing-codes') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      return jsonResponse(await createModulePairingCode(env.RUNTIME_DB, owner, nowMs), { status: 201 });
    }
    if (url.pathname === '/v1/module/devices') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return jsonResponse(await listModuleDevices(env.RUNTIME_DB, module.account_id, module.child_id, nowMs));
    }
    const deviceAction = url.pathname.match(/^\/v1\/module\/devices\/([^/]+)\/(revoke|replace-pairing)$/);
    if (deviceAction) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const deviceId = decodeURIComponent(deviceAction[1]!);
      if (deviceAction[2] === 'revoke') {
        return await revokeModuleDevice(env.RUNTIME_DB, module.account_id, module.child_id, deviceId, nowMs)
          ? jsonResponse({ success: true }) : errorResponse(404, 'DEVICE_NOT_FOUND', 'Device was not found.');
      }
      try {
        return jsonResponse(await createModulePairingCode(env.RUNTIME_DB, owner, nowMs, deviceId), { status: 201 });
      } catch {
        return errorResponse(404, 'DEVICE_NOT_FOUND', 'Device was not found.');
      }
    }
    if (url.pathname === '/v1/module/usage') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const fromMs = Number(url.searchParams.get('fromMs'));
      const toMs = Number(url.searchParams.get('toMs'));
      const deviceId = url.searchParams.get('deviceId') || undefined;
      if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs < 0 || toMs <= fromMs || toMs - fromMs > 31 * 86_400_000) {
        throw new HttpError(400, 'INVALID_RANGE', 'Usage range is invalid.');
      }
      return jsonResponse(await queryModuleUsage(env.RUNTIME_DB, module.account_id, module.child_id, fromMs, toMs, deviceId));
    }
    return errorResponse(404, 'NOT_FOUND', 'Route was not found.');
  }

  if (url.pathname === '/v1/identity/child-lifecycle') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const claims = await requireLifecycle(request, env, nowMs);
    await deleteRuntimeChild(env.RUNTIME_DB, String(claims.account_id), String(claims.child_id));
    await deleteRuntimeChildV2(env.RUNTIME_DB, String(claims.account_id), String(claims.child_id));
    return jsonResponse({ success: true });
  }

  if (url.pathname === '/v1/devices/enroll') {
    if (request.method !== 'POST') {
      return methodNotAllowed('POST');
    }
    const input = parseEnrollDevice(await readJsonBody(request));
    const result = await enrollDevice(env.RUNTIME_DB, input, nowMs);
    return result === null
      ? errorResponse(401, 'ENROLLMENT_INVALID', 'Enrollment code is invalid, expired, or consumed.')
      : jsonResponse(result, { status: 201 });
  }

  if (url.pathname === '/v1/devices/self') {
    if (request.method !== 'GET') {
      return methodNotAllowed('GET');
    }
    return jsonResponse(await requireDevice(request, env.RUNTIME_DB, nowMs));
  }

  if (url.pathname === '/v1/devices/heartbeat') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const device = await requireDevice(request, env.RUNTIME_DB, nowMs);
    const body = await readJsonBody(request, 8_192);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'INVALID_REQUEST', 'Heartbeat is invalid.');
    const value = body as Record<string, unknown>;
    const fields = ['agentVersion', 'windowsVersion', 'architecture'] as const;
    for (const field of fields) {
      if (typeof value[field] !== 'string' || value[field].length < 1 || value[field].length > 128) {
        throw new HttpError(400, 'INVALID_REQUEST', `${field} is invalid.`);
      }
    }
    await recordHeartbeat(env.RUNTIME_DB, device.deviceId, value as { agentVersion: string; windowsVersion: string; architecture: string }, nowMs);
    return jsonResponse({ success: true, status: 'active', nextHeartbeatSeconds: 300 });
  }

  if (url.pathname === '/v1/segments:upload') {
    if (request.method !== 'POST') {
      return methodNotAllowed('POST');
    }
    const device = await requireDevice(request, env.RUNTIME_DB, nowMs);
    const upload = parseUploadRequest(await readJsonBody(request));
    const validations = upload.rawSegments.map((segment, index) =>
      validateSegment(segment, device.platform, index));
    return jsonResponse(await persistSegments(env.RUNTIME_DB, device, validations, nowMs));
  }

  return errorResponse(404, 'NOT_FOUND', 'Route was not found.');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      const origin = request.headers.get('origin');
      const allowedOrigin = env.PAGES_ORIGIN || 'https://timeonchrome-console.pages.dev';
      if (request.method === 'OPTIONS') {
        if (origin !== allowedOrigin) return errorResponse(403, 'ORIGIN_DENIED', 'Origin is not allowed.');
        return new Response(null, { status: 204, headers: {
          'access-control-allow-origin': allowedOrigin,
          'access-control-allow-methods': 'GET, POST, PUT, PATCH, OPTIONS',
          'access-control-allow-headers': 'authorization, content-type',
          'access-control-max-age': '86400',
        } });
      }
      const response = await route(request, env);
      if (origin === allowedOrigin) {
        const withCors = new Response(response.body, response);
        withCors.headers.set('access-control-allow-origin', allowedOrigin);
        withCors.headers.set('vary', 'Origin');
        return withCors;
      }
      return response;
    } catch (error) {
      if (error instanceof HttpError) {
        return errorResponse(error.status, error.code, error.message);
      }
      console.error(JSON.stringify({
        message: 'runtime_request_failed',
        path: new URL(request.url).pathname,
        error: error instanceof Error ? error.message : 'unknown_error',
      }));
      return errorResponse(500, 'INTERNAL_ERROR', 'Request failed.');
    }
  },
} satisfies ExportedHandler<Env>;
