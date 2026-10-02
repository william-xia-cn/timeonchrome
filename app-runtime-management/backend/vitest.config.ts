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
          const operation=new URL(request.url).pathname;
          if(operation==='/readSharedQuotaState'){
            const scope=await request.json() as {accountId:string;childId:string;date:string};
            if(scope.childId!=='child-a')return Response.json({code:'CHILD_NOT_FOUND'},{status:404});
            const state={schemaVersion:1,policyRevision:'profile-config:1',revision:'shadow-r1',computedAtMs:1790880000000,
              settledAtMs:null,complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],sources:[],
              day:{date:scope.date,usedMs:{study:1000,composite:2000,rest:3000},remainingMs:{study:4000,composite:3000,rest:2000},borrowedRestMs:0},
              week:{fromDate:'2026-09-28',toDate:scope.date,complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],restUsedMs:3000,restRemainingMs:9000},offline:false};
            if(scope.date==='2026-10-03')Object.assign(state,{unexpected:'not-in-contract'});
            return Response.json({state});
          }
          if(operation!=='/verifyChildAccess')return new Response('Fixture service unavailable',{status:503});
          const scope=await request.json() as {accountId:string;childId:string};
          if(scope.accountId==='scope-unavailable')return Response.json({code:'APPLICATION_SCOPE_UNAVAILABLE'},{status:503});
          const children=[['rpc-boundary-account','rpc-boundary-child'],['rpc-account','rpc-child'],['empty-account','empty-child'],
            ['persistent-account','persistent-child']];
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
