import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';
import { configDefaults, defineConfig } from 'vitest/config';
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
          const operation=new URL(request.url).pathname;
          if(operation!=='/verifyChildAccess')return new Response('Fixture service unavailable',{status:503});
          const scope=await request.json() as {accountId:string;childId:string};
          if(scope.accountId==='scope-unavailable')return Response.json({code:'APPLICATION_SCOPE_UNAVAILABLE'},{status:503});
          const children=[['rpc-boundary-account','rpc-boundary-child'],['rpc-account','rpc-child'],['empty-account','empty-child'],
            ['persistent-account','persistent-child'],['seconds-source-account','seconds-source-child'],
            ['seconds-cache-account','seconds-cache-child'],
            ['seconds-transport-windows','seconds-transport-child-windows'],
            ['seconds-transport-macos','seconds-transport-child-macos'],
            // 合成v3生产者的固定家庭/孩子；非通配许可，跨家庭仍拒绝。
            ['child-native-transport-windows','synthetic-child-a'],
            ['child-native-transport-windows','child-a']];
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
    // 该脚本使用Node SQLite，由npm test单独执行，不在workerd中构造。
    exclude: [...configDefaults.exclude, 'test/program-instance-storage.test.mjs'],
    setupFiles: ['./test/setup.ts'],
  },
});
