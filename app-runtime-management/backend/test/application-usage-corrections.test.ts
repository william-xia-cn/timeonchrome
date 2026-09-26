import { describe, expect, it } from 'vitest';
import { buildWeekReclassification, correctUsageRows } from '../src/applicationUsageCorrections';

const monday = Date.parse('2026-09-21T00:00:00+08:00');
const week = 7 * 86_400_000;
const entry = (runtimeIdentity: string, classification: 'study' | 'unclassified' | 'composite') =>
  ({ platform: 'windows' as const, runtimeIdentity, classification });

describe('current-week application attribution', () => {
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
