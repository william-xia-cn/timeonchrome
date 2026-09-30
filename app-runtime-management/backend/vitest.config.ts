import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const migrations = await readD1Migrations(
  fileURLToPath(new URL('./migrations', import.meta.url)),
);

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        // Explicit Guardian ownership fixture, independent of legacy Runtime
        // pairing. Never resolve a unit test to a production Worker.
        serviceBindings: { GUARDIAN_COMPUTER_USAGE: async (request:Request) => {
          if(new URL(request.url).pathname!=='/verifyChildAccess')return new Response('Fixture service unavailable',{status:503});
          const scope=await request.json() as {accountId:string;childId:string};
          if(scope.accountId==='scope-unavailable')return Response.json({code:'APPLICATION_SCOPE_UNAVAILABLE'},{status:503});
          const children=[['rpc-boundary-account','rpc-boundary-child'],['rpc-account','rpc-child'],['empty-account','empty-child']];
          return Response.json({owned:children.some(([account,child])=>scope.accountId===account&&scope.childId===child)});
        } },
        bindings: {
          GUARDIAN_RUNTIME_PUBLIC_JWK: '{"kty":"EC","x":"BOtK86WkXpgT2fjHLsDh-Xa-K2BkdyhPzRq_OPyINqE","y":"5EbyiSiB1mvklK2VrO_MdOf9IhPlQ-A3dw1vnJvHbOA","crv":"P-256"}',
          GUARDIAN_RUNTIME_SSO_PUBLIC_JWK: '{"kty":"EC","x":"BOtK86WkXpgT2fjHLsDh-Xa-K2BkdyhPzRq_OPyINqE","y":"5EbyiSiB1mvklK2VrO_MdOf9IhPlQ-A3dw1vnJvHbOA","crv":"P-256"}',
          GUARDIAN_RUNTIME_ISSUER: 'guardian-api',
          TEST_MIGRATIONS: migrations,
        },
      },
    }),
  ],
  test: {
    setupFiles: ['./test/setup.ts'],
  },
});
