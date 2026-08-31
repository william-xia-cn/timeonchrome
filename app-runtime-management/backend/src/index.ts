import { requireAdmin, requireDevice } from './auth';
import { errorResponse, HttpError, jsonResponse, methodNotAllowed, readJsonBody } from './http';
import { createEnrollmentCode, enrollDevice, persistSegments } from './repository';
import {
  parseCreateEnrollmentCode,
  parseEnrollDevice,
  parseUploadRequest,
  validateSegment,
} from './validation';

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const nowMs = Date.now();

  if (url.pathname === '/v1/health') {
    return request.method === 'GET'
      ? jsonResponse({ status: 'ok', service: 'app-runtime', schemaVersion: 1 })
      : methodNotAllowed('GET');
  }

  if (url.pathname === '/v1/admin/enrollment-codes') {
    if (request.method !== 'POST') {
      return methodNotAllowed('POST');
    }
    await requireAdmin(request, env.ADMIN_API_KEY);
    const input = parseCreateEnrollmentCode(await readJsonBody(request));
    const result = await createEnrollmentCode(
      env.RUNTIME_DB,
      input.subjectId,
      input.ttlSeconds ?? 600,
      nowMs,
    );
    return jsonResponse(result, { status: 201 });
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
      return await route(request, env);
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
