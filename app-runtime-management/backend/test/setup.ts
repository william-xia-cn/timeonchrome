import { env } from 'cloudflare:workers';
import { applyD1Migrations } from 'cloudflare:test';
import type { D1Migration } from '@cloudflare/vitest-plugin';

if (!hasTestMigrations(env)) {
  throw new Error('TEST_MIGRATIONS binding is missing.');
}
await applyD1Migrations(env.RUNTIME_DB, env.TEST_MIGRATIONS);

function hasTestMigrations(
  value: Cloudflare.Env,
): value is Cloudflare.Env & { TEST_MIGRATIONS: D1Migration[] } {
  return 'TEST_MIGRATIONS' in value && Array.isArray(value.TEST_MIGRATIONS);
}
