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
        bindings: {
          GUARDIAN_RUNTIME_PUBLIC_JWK: '{"kty":"EC","x":"BOtK86WkXpgT2fjHLsDh-Xa-K2BkdyhPzRq_OPyINqE","y":"5EbyiSiB1mvklK2VrO_MdOf9IhPlQ-A3dw1vnJvHbOA","crv":"P-256"}',
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
