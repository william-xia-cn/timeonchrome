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
          if(operation==='/readSharedQuotaState'){
            const scope=await request.json() as {accountId:string;childId:string;date:string};
            if(scope.childId!=='child-a')return Response.json({code:'CHILD_NOT_FOUND'},{status:404});
            const dayStart=Date.parse(`${scope.date}T00:00:00+08:00`);
            const monday=new Date(dayStart-((new Date(dayStart+28_800_000).getUTCDay()+6)%7)*86_400_000+28_800_000)
              .toISOString().slice(0,10);
            const state={schemaVersion:1,policyRevision:'profile-config:1',revision:'shadow-r1',computedAtMs:1790880000000,
              settledAtMs:null,complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],sources:[],
              day:{date:scope.date,usedMs:{study:1000,composite:2000,rest:3000},remainingMs:{study:4000,composite:3000,rest:2000},borrowedRestMs:0},
              week:{fromDate:monday,toDate:scope.date,complete:false,reasonCodes:['APPLICATION_COVERAGE_MISSING'],restUsedMs:3000,restRemainingMs:9000},offline:false};
            if(scope.date==='2026-10-03')Object.assign(state,{unexpected:'not-in-contract'});
            if(scope.date==='2026-10-04')state.day.date='2026-10-02';
            if(scope.date==='2026-10-05')state.week.toDate='2026-10-04';
            if(scope.date==='2026-10-06')state.computedAtMs=-1;
            if(scope.date==='2026-10-07')Object.assign(state,{settledAtMs:-1});
            if(scope.date==='2026-10-08')state.week.fromDate='2026-10-07';
            return Response.json({state});
          }
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
