import { describe, expect, it } from 'vitest';
import { buildWeekReclassification, correctUsageRows, loadUsageCorrections } from '../src/applicationUsageCorrections';
import { env } from 'cloudflare:workers';

const monday = Date.parse('2026-09-21T00:00:00+08:00');
const week = 7 * 86_400_000;
const entry = (runtimeIdentity: string, classification: 'study' | 'unclassified' | 'composite') =>
  ({ platform: 'windows' as const, runtimeIdentity, classification });

describe('current-week application attribution', () => {
  it('pages immutable history with the same latest week/identity attribution as complete history', async () => {
    const account = 'paged-correction-fixture';
    const versions = Array.from({ length: 25 }, (_, i) => ({ version: i + 1,
      fromMs: i < 3 ? monday - week : monday, toMs: i < 3 ? monday : monday + week,
      applications: [entry('A', i % 2 ? 'study' : 'composite'),
        ...(i === 3 ? [entry('older-only', 'study')] : []),
        { ...entry('A', 'unclassified'), platform: 'macos' as const }],
    }));
    await env.RUNTIME_DB.batch(versions.map(value => env.RUNTIME_DB.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
      (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms) VALUES (?1,'child',?2,?3,'fixture',0,0)`)
      .bind(account, value.version, JSON.stringify({ ignoredLargeField: 'x'.repeat(20000), weekReclassification: value }))));
    const actual = await loadUsageCorrections(env.RUNTIME_DB, account, 'child', monday - week, monday + week);
    const rows = [entry('A', 'unclassified'), entry('older-only', 'unclassified'),
      { ...entry('A', 'unclassified'), platform: 'macos' }].map(app => ({ platform: app.platform,
        runtime_identity: app.runtimeIdentity, classification: app.classification,
        start_wall_time_ms: monday - 1501, end_wall_time_ms: monday + 2501 }));
    expect(correctUsageRows(rows, actual, monday - week, monday + week))
      .toEqual(correctUsageRows(rows, versions, monday - week, monday + week));
    expect(actual.reduce((sum, rule) => sum + rule.applications.length, 0)).toBe(5);
    expect(await loadUsageCorrections(env.RUNTIME_DB, account, 'other-child', monday, monday + week)).toEqual([]);
    expect(await loadUsageCorrections(env.RUNTIME_DB, 'other-account', 'child', monday, monday + week)).toEqual([]);
  });
  it('uses Beijing Monday boundaries, explicit priority and resets removed overrides', () => {
    const correction = buildWeekReclassification({ classifications: [{ ...entry('A', 'study'), displayName: null }],
      resolvedApplications: [{ ...entry('A', 'composite'), displayName: null }] }, monday + week - 1,
      { classifications: [{ ...entry('old', 'study'), displayName: null }] });
    expect(correction).toEqual({ fromMs: monday, toMs: monday + week,
      applications: [entry('A', 'study'), entry('old', 'unclassified')] });
    expect(buildWeekReclassification({ classifications: [] }, monday + week).fromMs).toBe(monday + week);
  });

  it('splits at week boundaries, preserves milliseconds, old weeks and same-name identities', () => {
    const rows = [{ platform: 'windows', runtime_identity: 'A', display_name: 'Same name', classification: 'unclassified',
      start_wall_time_ms: monday - 501, end_wall_time_ms: monday + 1501 },
    { platform: 'windows', runtime_identity: 'B', display_name: 'Same name', classification: 'unclassified',
      start_wall_time_ms: monday, end_wall_time_ms: monday + 1501 }];
    const original = JSON.stringify(rows);
    const corrected = correctUsageRows(rows, [{ fromMs: monday, toMs: monday + week, version: 1,
      applications: [entry('A', 'study')] }], monday - 501, monday + week);
    expect(corrected.map(row => [row.classification, Number(row.end_wall_time_ms) - Number(row.start_wall_time_ms)]))
      .toEqual([['unclassified', 501], ['study', 1501], ['unclassified', 1501]]);
    expect(JSON.stringify(rows)).toBe(original);
  });

  it('latest approved per-identity version wins; absent identities retain prior approved correction', () => {
    const row = { platform: 'windows', runtime_identity: 'A', classification: 'unclassified',
      start_wall_time_ms: monday, end_wall_time_ms: monday + 1501 };
    const corrections = [
      { fromMs: monday, toMs: monday + week, version: 2, applications: [entry('A', 'composite')] },
      { fromMs: monday, toMs: monday + week, version: 1, applications: [entry('A', 'study')] },
      { fromMs: monday, toMs: monday + week, version: 3, applications: [entry('B', 'study')] },
    ];
    expect(correctUsageRows([row], corrections, monday, monday + week)[0]?.classification).toBe('composite');
    expect(correctUsageRows([row], [], monday, monday + week)[0]?.classification).toBe('unclassified');
    expect(correctUsageRows([{ ...row, platform: 'macos' }], corrections, monday, monday + week)[0]?.classification).toBe('unclassified');
  });
});
