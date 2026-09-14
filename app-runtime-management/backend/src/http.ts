import type { ApiErrorResponse } from './contracts';

const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
  'x-content-type-options': 'nosniff',
};

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function jsonResponse(value: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [name, headerValue] of Object.entries(jsonHeaders)) {
    headers.set(name, headerValue);
  }
  return new Response(JSON.stringify(value), { ...init, headers });
}

export function errorResponse(status: number, code: string, message: string): Response {
  const body: ApiErrorResponse = { error: { code, message } };
  return jsonResponse(body, { status });
}

export async function readJsonBody(request: Request, maxBytes = 262_144): Promise<unknown> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new HttpError(415, 'CONTENT_TYPE_REQUIRED', 'Content-Type must be application/json.');
  }

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
  }
  if (request.body === null) {
    throw new HttpError(400, 'BODY_REQUIRED', 'Request body is required.');
  }

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }
    total += result.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('body limit exceeded');
      throw new HttpError(413, 'BODY_TOO_LARGE', 'Request body is too large.');
    }
    chunks.push(result.value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new HttpError(400, 'INVALID_JSON', 'Request body is not valid JSON.');
  }
}

export function methodNotAllowed(allowed: string): Response {
  const response = errorResponse(405, 'METHOD_NOT_ALLOWED', 'Method is not allowed.');
  response.headers.set('allow', allowed);
  return response;
}
