import { handleAdminRequest } from './admin';
import { handleSantaRequest } from './santa';
import type { Env } from './types';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': 'https://timeonchrome-console.pages.dev',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
    try {
      const santa = await handleSantaRequest(request, env);
      if (santa) return santa;
      const admin = await handleAdminRequest(request, env);
      if (admin) return withCors(admin);
      if (new URL(request.url).pathname === '/health') {
        return withCors(new Response(JSON.stringify({ ok: true, service: 'native-app-control' }), {
          headers: { 'Content-Type': 'application/json' },
        }));
      }
      return withCors(new Response(JSON.stringify({ error: 'not_found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      }));
    } catch (error) {
      console.error('[native-app-control] request failed', error);
      return withCors(new Response(JSON.stringify({ error: 'internal_error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
  },
};
