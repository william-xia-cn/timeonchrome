import type { Env } from '../db/middleware';

export class ProfileConfigVersionConflictError extends Error {
  code = 'PROFILE_CONFIG_VERSION_CONFLICT';

  constructor() {
    super('Profile config changed during update');
  }
}

type MutationOptions = {
  profileId: string;
  sourceAction: string;
  updatedByAccountId?: string | null;
  requestId?: string | null;
  maxAttempts?: number;
};

export async function mutateProfileConfig(
  env: Env,
  options: MutationOptions,
  mutate: (config: Record<string, any>) => void,
): Promise<{ config: Record<string, any>; version: number; changed: boolean }> {
  const maxAttempts = Math.max(1, Math.min(5, options.maxAttempts || 3));
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const row = await env.DB.prepare(
      `SELECT config, version, updated_at FROM profiles WHERE id = ?`
    ).bind(options.profileId).first<{ config: string; version: number; updated_at: number }>();
    if (!row) throw new Error('Profile not found');

    const config = row.config ? JSON.parse(row.config) : {};
    const before = JSON.stringify(config);
    mutate(config);
    const after = JSON.stringify(config);
    if (after === before) return { config, version: Number(row.version || 0), changed: false };

    const currentVersion = Number(row.version || 0);
    const nextVersion = currentVersion + 1;
    const now = Date.now();
    const update = await env.DB.prepare(
      `UPDATE profiles SET config = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?`
    ).bind(after, nextVersion, now, options.profileId, currentVersion).run();
    if (Number((update as any)?.meta?.changes || 0) !== 1) continue;

    await env.DB.prepare(
      `UPDATE profile_config_history_v1
          SET updated_by_account_id = ?, source_action = ?, request_id = ?
        WHERE profile_id = ? AND version = ?`
    ).bind(
      options.updatedByAccountId || null,
      options.sourceAction.slice(0, 64),
      options.requestId?.slice(0, 128) || null,
      options.profileId,
      nextVersion,
    ).run();
    return { config, version: nextVersion, changed: true };
  }
  throw new ProfileConfigVersionConflictError();
}
