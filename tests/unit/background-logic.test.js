// Unit tests for client-side business logic from background.js
// Tests: timing rules, quota calculation, checkAndRemind routing, auto-study switching
// Run with: node tests/unit/background-logic.test.js

'use strict';

// ── Inline pure helpers (from background.js) ─────────────────────────────────

function matchDomain(domain, pattern) {
  const d = domain.replace(/^www\./, '');
  const p = pattern.replace(/^www\./, '');
  return d === p || d.endsWith('.' + p);
}

function extractDomain(url) {
  try {
    const u = new URL(url);
    return u.hostname.replace(/^www\./, '');
  } catch { return null; }
}

function isSpecialUrl(url) {
  return !url ||
    url.startsWith('chrome://') ||
    url.startsWith('chrome-extension://') ||
    url.startsWith('about:') ||
    url.startsWith('edge://') ||
    url.startsWith('devtools://');
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getTodayEffectiveRestLimit(config, todayOverride) {
  const baseLimit = config.dailyRestQuota ?? 120;
  const borrow    = config.quotaBorrow;
  if (!borrow || borrow.repaid) return baseLimit;
  const today = todayOverride || formatDate(new Date());
  if (today === borrow.borrowedFrom) return baseLimit + borrow.amount;
  const repayD = new Date(borrow.borrowedFrom + 'T00:00:00');
  repayD.setDate(repayD.getDate() + 1);
  const repayStr = formatDate(repayD);
  if (today === repayStr) return Math.max(0, baseLimit - borrow.amount);
  return baseLimit;
}

// ── Pure logic extracted from checkAllTabsQuota ───────────────────────────────
// Takes: config, stats {domain:secs}, undeterminedStats {domain:secs}, weekRestMinutes, todayOverride
// Returns: { totalMinutes, studyMinutes, restMinutes, undeterminedMinutes, newState }
function computeQuotaState(config, stats, undeterminedStats, weekRestMinutes, todayOverride) {
  let studySeconds = 0, totalSeconds = 0;
  for (const [domain, seconds] of Object.entries(stats)) {
    totalSeconds += seconds;
    const isStudy = (config.studyList || []).some(p => matchDomain(domain, p));
    if (isStudy) studySeconds += seconds;
  }
  let undeterminedSeconds = 0;
  for (const seconds of Object.values(undeterminedStats)) undeterminedSeconds += seconds;
  const restSeconds = totalSeconds - studySeconds - undeterminedSeconds;

  const totalMinutes        = Math.floor(totalSeconds                 / 60);
  const studyMinutes        = Math.floor(studySeconds                 / 60);
  const restMinutes         = Math.floor(Math.max(0, restSeconds)     / 60);
  const undeterminedMinutes = Math.floor(undeterminedSeconds          / 60);

  const dailyOnlineQuota       = config.dailyOnlineQuota       ?? 0;
  const dailyUndeterminedQuota = config.dailyUndeterminedQuota ?? 120;
  const effectiveDailyRest     = getTodayEffectiveRestLimit(config, todayOverride);
  const weeklyRestLimit        = config.weeklyRestQuota ?? (effectiveDailyRest * 7);

  const restLockedByDay  = effectiveDailyRest > 0 && restMinutes   >= effectiveDailyRest;
  const restLockedByWeek = weeklyRestLimit    > 0 && weekRestMinutes >= weeklyRestLimit;

  const newState = {
    onlineLocked:       dailyOnlineQuota                > 0 && totalMinutes        >= dailyOnlineQuota,
    studyLocked:        (config.dailyStudyQuota || 0)   > 0 && studyMinutes        >= config.dailyStudyQuota,
    restLocked:         restLockedByDay || restLockedByWeek,
    undeterminedLocked: dailyUndeterminedQuota          > 0 && undeterminedMinutes >= dailyUndeterminedQuota,
    weeklyRestLocked:   restLockedByWeek,
  };

  return { totalMinutes, studyMinutes, restMinutes, undeterminedMinutes, newState };
}

// ── Pure logic extracted from checkAndRemind ──────────────────────────────────
// Returns: { blocked: boolean, reason: string|null }
// schedule check skipped if config.schedule.enabled is false or schedule is null
function computeRemindReason(url, config, scheduleResultOverride) {
  if (isSpecialUrl(url)) return { blocked: false, reason: null };
  if (url.includes('reminder.html')) return { blocked: false, reason: null };

  const domain = extractDomain(url);
  if (!domain) return { blocked: false, reason: null };

  const isStudyDomain    = (config.studyList     || []).some(p => matchDomain(domain, p));
  const isCompositeDomain = (config.compositeList || []).some(p => matchDomain(domain, p));

  // 1. Unsafe
  const unsafeList = config.unsafeList || config.blacklist || [];
  if (unsafeList.some(b => matchDomain(domain, b)))
    return { blocked: true, reason: 'unsafe' };

  // 2. Schedule (inject result for testability)
  if (config.schedule?.enabled && scheduleResultOverride === false)
    return { blocked: true, reason: 'schedule' };

  // 3. Study mode
  const currentMode = config.mode === 'whitelist' ? 'study' : (config.mode === 'blacklist' ? 'rest' : config.mode);
  if (currentMode === 'study' && !isStudyDomain && !isCompositeDomain)
    return { blocked: true, reason: 'study_mode' };

  // 4. Quota locks
  const qs = config.quotaState || {};
  if (qs.onlineLocked)
    return { blocked: true, reason: 'quota_online' };
  if (qs.restLocked && !isStudyDomain && !isCompositeDomain)
    return { blocked: true, reason: 'quota_rest' };
  if (qs.studyLocked && isStudyDomain)
    return { blocked: true, reason: 'quota_study' };
  if (qs.undeterminedLocked && isCompositeDomain && !isStudyDomain)
    return { blocked: true, reason: 'quota_undetermined' };
  if ((config.lockedDomains || []).includes(domain))
    return { blocked: true, reason: 'quota' };

  return { blocked: false, reason: null };
}

// ── Pure logic extracted from handleTickTimer (domain categorization) ─────────
// Returns which time buckets a domain+heartbeat contributes to
function categorizeHeartbeat(domain, config, heartbeatType) {
  // heartbeatType: 'active' | 'passive'
  const isStudy    = (config.studyList     || []).some(p => matchDomain(domain, p));
  const isComposite = (config.compositeList || []).some(p => matchDomain(domain, p));
  const mode        = config.mode === 'whitelist' ? 'study' : (config.mode === 'blacklist' ? 'rest' : config.mode);

  // Both active and passive heartbeats count domain time.
  // The session categorization depends on mode + domain type.
  const result = {
    countsTotal:        true,   // always adds to domain stats
    countsStudy:        false,
    countsUndetermined: false,
    countsRest:         false,
  };

  if (isStudy && mode === 'study' && heartbeatType === 'active') {
    result.countsStudy = true;
  } else if (isComposite && !isStudy) {
    result.countsUndetermined = true;
  } else {
    // rest mode active, or non-study non-composite domain
    result.countsRest = heartbeatType === 'active';
  }

  return result;
}

// ── Pure logic extracted from checkAutoStudy ─────────────────────────────────
// Returns: 'start_tracking' | 'keep_tracking' | 'should_switch' | 'reset' | 'skip'
function computeAutoStudyAction(state, config, session, now) {
  // state: { autoStudyDomain, autoStudyStartTime, activeTabDomain, windowHasFocus, userIsIdle }
  if (session.currentMode !== 'rest') return 'skip';
  if (!config?.autoStudyConfig?.enabled) return 'skip';

  const isOnStudySite = state.activeTabDomain &&
    (config.studyList || []).some(w => matchDomain(state.activeTabDomain, w));
  const isActive = state.windowHasFocus && !state.userIsIdle;

  if (!isOnStudySite || !isActive) return 'reset';

  const required = config.autoStudyConfig.requiredSeconds || 60;

  if (state.autoStudyDomain !== state.activeTabDomain) {
    return 'start_tracking';
  }

  const elapsed = Math.floor((now - state.autoStudyStartTime) / 1000);
  if (elapsed >= required) return 'should_switch';
  return 'keep_tracking';
}

// ── Per-domain quota check (from checkAllTabsQuota) ───────────────────────────
function computeNewlyLockedDomains(stats, config) {
  const newlyLocked = [];
  const alreadyLocked = config.lockedDomains || [];
  for (const [domain, seconds] of Object.entries(stats)) {
    const minutes = Math.floor(seconds / 60);
    const quota = config.domainQuotas?.[domain];
    if (quota && quota > 0 && minutes >= quota) {
      if (!alreadyLocked.includes(domain)) {
        newlyLocked.push(domain);
      }
    }
  }
  return newlyLocked;
}

// ── Test runner ───────────────────────────────────────────────────────────────
let passed = 0, failed = 0;
const failures = [];

function check(description, condition, details) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(description);
    console.error(`  ✗ ${description}${details ? ' — ' + details : ''}`);
  }
}

function section(name) { console.log(`\n[${name}]`); }

// ── Config fixture helpers ────────────────────────────────────────────────────
function makeConfig(overrides = {}) {
  return {
    enabled: true,
    mode: 'study',
    studyList: ['khanacademy.org', 'github.com', 'docs.google.com'],
    compositeList: ['youtube.com', 'wikipedia.org'],
    unsafeList: ['tiktok.com', 'douyin.com'],
    dailyOnlineQuota: 0,
    dailyStudyQuota: 0,
    dailyRestQuota: 120,
    dailyUndeterminedQuota: 60,
    weeklyRestQuota: null,
    domainQuotas: {},
    lockedDomains: [],
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
    schedule: { enabled: false, days: {} },
    autoStudyConfig: { enabled: true, requiredSeconds: 90 },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Three-category timing rules
// ═══════════════════════════════════════════════════════════════════════════════
section('Timing: domain categorization');

{
  const config = makeConfig({ mode: 'study' });

  // study domain + active + study mode → study
  const r1 = categorizeHeartbeat('khanacademy.org', config, 'active');
  check('study site + active → countsStudy', r1.countsStudy, JSON.stringify(r1));
  check('study site + active → NOT countsRest', !r1.countsRest, JSON.stringify(r1));
  check('study site + active → NOT countsUndetermined', !r1.countsUndetermined, JSON.stringify(r1));
  check('study site + active → countsTotal', r1.countsTotal, JSON.stringify(r1));
}

{
  const config = makeConfig({ mode: 'rest' });

  // study domain + rest mode → rest time (not study)
  const r2 = categorizeHeartbeat('khanacademy.org', config, 'active');
  check('study site + rest mode → countsRest (not study)', r2.countsRest, JSON.stringify(r2));
  check('study site + rest mode → NOT countsStudy', !r2.countsStudy, JSON.stringify(r2));
}

{
  const config = makeConfig({ mode: 'study' });

  // composite domain (not in studyList) → undetermined
  const r3 = categorizeHeartbeat('youtube.com', config, 'active');
  check('composite site → countsUndetermined', r3.countsUndetermined, JSON.stringify(r3));
  check('composite site → NOT countsStudy', !r3.countsStudy, JSON.stringify(r3));
  check('composite site → NOT countsRest', !r3.countsRest, JSON.stringify(r3));
}

{
  const config = makeConfig({ mode: 'study' });

  // composite domain passive heartbeat → undetermined
  const r4 = categorizeHeartbeat('youtube.com', config, 'passive');
  check('composite site + passive → countsUndetermined', r4.countsUndetermined, JSON.stringify(r4));
}

{
  const config = makeConfig({ mode: 'rest' });

  // regular domain + rest mode + active → rest
  const r5 = categorizeHeartbeat('reddit.com', config, 'active');
  check('regular domain + rest mode + active → countsRest', r5.countsRest, JSON.stringify(r5));
  check('regular domain + rest mode + active → NOT countsStudy', !r5.countsStudy, JSON.stringify(r5));
}

{
  const config = makeConfig({ mode: 'rest' });

  // regular domain + rest mode + passive → NOT counted as rest (passive ≠ active user)
  const r6 = categorizeHeartbeat('reddit.com', config, 'passive');
  check('regular domain + rest mode + passive → NOT countsRest', !r6.countsRest, JSON.stringify(r6));
}

// GAP-1 补充：rest 模式下 composite 域名计 undetermined（PRD F-09 第5行）
{
  const config = makeConfig({ mode: 'rest' });
  const r = categorizeHeartbeat('youtube.com', config, 'active');
  check('[GAP-1] rest + composite + active → countsUndetermined (not rest)', r.countsUndetermined, JSON.stringify(r));
  check('[GAP-1] rest + composite + active → NOT countsRest', !r.countsRest, JSON.stringify(r));
}

{
  // PRD F-09 最后一行: rest + 任意 + passive → 仅域名计时，不计 rest
  const config = makeConfig({ mode: 'rest' });
  const r = categorizeHeartbeat('instagram.com', config, 'passive');
  check('[GAP-1] rest + ordinary + passive → NOT countsRest', !r.countsRest, JSON.stringify(r));
  check('[GAP-1] rest + ordinary + passive → NOT countsStudy', !r.countsStudy, JSON.stringify(r));
  check('[GAP-1] rest + ordinary + passive → NOT countsUndetermined', !r.countsUndetermined, JSON.stringify(r));
  check('[GAP-1] rest + ordinary + passive → countsTotal (domain stats only)', r.countsTotal, JSON.stringify(r));
}

{
  // domain in BOTH studyList and compositeList → treated as study
  const config = makeConfig({
    mode: 'study',
    studyList: ['wikipedia.org'],
    compositeList: ['wikipedia.org'],
  });
  const r7 = categorizeHeartbeat('wikipedia.org', config, 'active');
  check('domain in both lists → study wins over undetermined', r7.countsStudy, JSON.stringify(r7));
  check('domain in both lists → NOT countsUndetermined', !r7.countsUndetermined, JSON.stringify(r7));
}

{
  const config = makeConfig({ mode: 'study' });
  // subdomain of study domain
  const r8 = categorizeHeartbeat('sub.khanacademy.org', config, 'active');
  check('subdomain of studyList entry → countsStudy', r8.countsStudy, JSON.stringify(r8));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Quota state calculation
// ═══════════════════════════════════════════════════════════════════════════════
section('Quota: state calculation');

{
  // No quotas set → nothing locked
  const config = makeConfig({
    dailyOnlineQuota: 0, dailyStudyQuota: 0,
    dailyRestQuota: 120, dailyUndeterminedQuota: 60,
  });
  const stats = { 'khanacademy.org': 3600 }; // 60 min study
  const { newState } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('no quotas → nothing locked', !newState.onlineLocked && !newState.studyLocked && !newState.restLocked && !newState.undeterminedLocked, JSON.stringify(newState));
}

{
  // Online quota exceeded
  const config = makeConfig({ dailyOnlineQuota: 60 }); // 60 min limit
  const stats = { 'reddit.com': 3700 }; // 61.67 min total → exceeds
  const { newState, totalMinutes } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('online quota exceeded → onlineLocked', newState.onlineLocked, `totalMinutes=${totalMinutes}`);
  check('online quota not reached (59 min) → NOT locked', !computeQuotaState(makeConfig({ dailyOnlineQuota: 60 }), { 'reddit.com': 3540 }, {}, 0, '2026-04-14').newState.onlineLocked, '');
}

{
  // Study quota exceeded
  const config = makeConfig({ dailyStudyQuota: 30 }); // 30 min
  const stats = { 'khanacademy.org': 1860 }; // 31 min study
  const { newState, studyMinutes } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('study quota exceeded → studyLocked', newState.studyLocked, `studyMinutes=${studyMinutes}`);
}

{
  // Rest quota exceeded (daily)
  const config = makeConfig({ dailyRestQuota: 30 });
  const stats = { 'reddit.com': 1860 }; // 31 min → all rest
  const { newState, restMinutes } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('rest quota exceeded → restLocked', newState.restLocked, `restMinutes=${restMinutes}`);
  check('restLocked but NOT weeklyRestLocked', !newState.weeklyRestLocked, JSON.stringify(newState));
}

{
  // Weekly rest quota exceeded
  const config = makeConfig({ dailyRestQuota: 120, weeklyRestQuota: 200 });
  const stats = { 'reddit.com': 0 };
  // weekRestMinutes = 201 → exceeds 200
  const { newState } = computeQuotaState(config, stats, {}, 201, '2026-04-14');
  check('weekly rest quota exceeded → restLocked + weeklyRestLocked', newState.restLocked && newState.weeklyRestLocked, JSON.stringify(newState));
}

{
  // Undetermined quota exceeded
  const config = makeConfig({ dailyUndeterminedQuota: 30 });
  const stats = {};
  const undetermined = { 'youtube.com': 1860 }; // 31 min undetermined
  const { newState, undeterminedMinutes } = computeQuotaState(config, stats, undetermined, 0, '2026-04-14');
  check('undetermined quota exceeded → undeterminedLocked', newState.undeterminedLocked, `undetermined=${undeterminedMinutes}`);
}

{
  // Study time does NOT count toward rest lock
  const config = makeConfig({ dailyRestQuota: 60 });
  const stats = {
    'khanacademy.org': 3600,  // 60 min study
    'reddit.com':       3540,  // 59 min rest
  };
  const { newState, restMinutes } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('59 min rest (study not counted) → NOT restLocked', !newState.restLocked, `restMinutes=${restMinutes}`);
}

{
  // Undetermined time does NOT count toward rest
  const config = makeConfig({ dailyRestQuota: 60 });
  const stats = { 'youtube.com': 7200 }; // 120 min, all undetermined
  const undetermined = { 'youtube.com': 7200 };
  const { newState, restMinutes } = computeQuotaState(config, stats, undetermined, 0, '2026-04-14');
  check('undetermined not counted as rest → NOT restLocked', !newState.restLocked, `restMinutes=${restMinutes}`);
}

{
  // Rest quota with borrow (today = borrow day → effective rest limit increases)
  const config = makeConfig({
    dailyRestQuota: 60,
    quotaBorrow: { borrowedFrom: '2026-04-14', amount: 30, repaid: false },
  });
  const stats = { 'reddit.com': 4980 }; // 83 min rest — exceeds 60 but not 90
  const { newState } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('borrowed time → effective rest limit is 90 min, 83 min NOT locked', !newState.restLocked, JSON.stringify(newState));
}

{
  // Per-domain quota check
  const config = makeConfig({
    domainQuotas: { 'youtube.com': 30 },
  });
  const stats = { 'youtube.com': 1860 }; // 31 min
  const newlyLocked = computeNewlyLockedDomains(stats, config);
  check('domain quota exceeded → domain in newlyLocked', newlyLocked.includes('youtube.com'), JSON.stringify(newlyLocked));
}

{
  // Per-domain quota: already locked → not double-added
  const config = makeConfig({
    domainQuotas: { 'youtube.com': 30 },
    lockedDomains: ['youtube.com'],
  });
  const stats = { 'youtube.com': 1860 };
  const newlyLocked = computeNewlyLockedDomains(stats, config);
  check('already locked domain → not in newlyLocked', !newlyLocked.includes('youtube.com'), JSON.stringify(newlyLocked));
}

{
  // Per-domain quota: not reached → not locked
  const config = makeConfig({ domainQuotas: { 'youtube.com': 60 } });
  const stats = { 'youtube.com': 3540 }; // 59 min
  const newlyLocked = computeNewlyLockedDomains(stats, config);
  check('domain quota not reached → not locked', newlyLocked.length === 0, JSON.stringify(newlyLocked));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: checkAndRemind routing logic
// ═══════════════════════════════════════════════════════════════════════════════
section('checkAndRemind: routing decision');

{
  // Special URLs — never blocked
  const config = makeConfig({ unsafeList: [] });
  const r = computeRemindReason('chrome://settings', config, true);
  check('chrome:// → not blocked', !r.blocked, JSON.stringify(r));
}

{
  const config = makeConfig();
  const r = computeRemindReason('chrome-extension://abc/popup.html', config, true);
  check('chrome-extension:// → not blocked', !r.blocked, JSON.stringify(r));
}

{
  const config = makeConfig();
  const r = computeRemindReason('https://example.com/reminder.html', config, true);
  check('reminder.html URL → not blocked (skip self)', !r.blocked, JSON.stringify(r));
}

{
  // Unsafe domain — always blocked regardless of mode
  const config = makeConfig({ mode: 'rest' });
  const r = computeRemindReason('https://tiktok.com', config, true);
  check('unsafe domain in rest mode → blocked with unsafe', r.blocked && r.reason === 'unsafe', JSON.stringify(r));
}

{
  // Unsafe domain takes priority over study_mode
  const config = makeConfig({ mode: 'study', unsafeList: ['badsite.com'] });
  const r = computeRemindReason('https://badsite.com', config, true);
  check('unsafe wins over study_mode', r.reason === 'unsafe', JSON.stringify(r));
}

{
  // Schedule block
  const config = makeConfig({ schedule: { enabled: true, days: {} } });
  const r = computeRemindReason('https://khanacademy.org', config, false); // false = outside schedule
  check('outside schedule → blocked with schedule', r.blocked && r.reason === 'schedule', JSON.stringify(r));
}

{
  // Study mode + non-study non-composite domain → study_mode reminder
  const config = makeConfig({ mode: 'study' });
  const r = computeRemindReason('https://instagram.com', config, true);
  check('study mode + unclassified domain → study_mode', r.blocked && r.reason === 'study_mode', JSON.stringify(r));
}

{
  // Study mode + study domain → allowed
  const config = makeConfig({ mode: 'study' });
  const r = computeRemindReason('https://khanacademy.org', config, true);
  check('study mode + study domain → not blocked', !r.blocked, JSON.stringify(r));
}

{
  // Study mode + composite domain → allowed (not study_mode blocked)
  const config = makeConfig({ mode: 'study' });
  const r = computeRemindReason('https://youtube.com', config, true);
  check('study mode + composite domain → not blocked', !r.blocked, JSON.stringify(r));
}

{
  // Rest mode + any domain → allowed (no quota issues)
  const config = makeConfig({ mode: 'rest' });
  const r = computeRemindReason('https://instagram.com', config, true);
  check('rest mode + any domain (no quota) → not blocked', !r.blocked, JSON.stringify(r));
}

{
  // onlineLocked blocks everything
  // NOTE: In study mode, non-study/composite domains are blocked by study_mode check (step 3)
  // BEFORE the quota_online check (step 4). Only study+composite domains hit quota_online.
  const config = makeConfig({
    mode: 'study',
    quotaState: { onlineLocked: true, studyLocked: false, restLocked: false, undeterminedLocked: false },
  });
  const r1 = computeRemindReason('https://khanacademy.org', config, true);
  const r2 = computeRemindReason('https://youtube.com', config, true);
  const r3 = computeRemindReason('https://instagram.com', config, true);
  check('onlineLocked + study domain → quota_online', r1.blocked && r1.reason === 'quota_online', JSON.stringify(r1));
  check('onlineLocked + composite domain → quota_online', r2.blocked && r2.reason === 'quota_online', JSON.stringify(r2));
  // Non-study/composite in study mode: study_mode check fires first (before quota checks)
  check('onlineLocked + non-study domain in study mode → study_mode (fires before quota)', r3.blocked && r3.reason === 'study_mode', JSON.stringify(r3));

  // In rest mode, onlineLocked blocks everything as quota_online
  const configRest = makeConfig({
    mode: 'rest',
    quotaState: { onlineLocked: true, studyLocked: false, restLocked: false, undeterminedLocked: false },
  });
  const r4 = computeRemindReason('https://instagram.com', configRest, true);
  check('onlineLocked + rest mode → quota_online for any domain', r4.blocked && r4.reason === 'quota_online', JSON.stringify(r4));
}

{
  // restLocked blocks rest/composite domains but NOT study domains
  const config = makeConfig({
    mode: 'rest',
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: true, undeterminedLocked: false },
  });
  const rStudy    = computeRemindReason('https://khanacademy.org', config, true);
  const rComposite = computeRemindReason('https://youtube.com', config, true);
  const rRest     = computeRemindReason('https://instagram.com', config, true);
  check('restLocked + study domain → NOT blocked', !rStudy.blocked, JSON.stringify(rStudy));
  check('restLocked + composite domain → NOT blocked', !rComposite.blocked, JSON.stringify(rComposite));
  check('restLocked + rest domain → blocked with quota_rest', rRest.blocked && rRest.reason === 'quota_rest', JSON.stringify(rRest));
}

{
  // studyLocked only blocks study domains
  const config = makeConfig({
    mode: 'study',
    quotaState: { onlineLocked: false, studyLocked: true, restLocked: false, undeterminedLocked: false },
  });
  const rStudy    = computeRemindReason('https://khanacademy.org', config, true);
  const rComposite = computeRemindReason('https://youtube.com', config, true);
  check('studyLocked + study domain → blocked with quota_study', rStudy.blocked && rStudy.reason === 'quota_study', JSON.stringify(rStudy));
  check('studyLocked + composite domain → not blocked', !rComposite.blocked, JSON.stringify(rComposite));
}

{
  // undeterminedLocked only blocks composite (non-study) domains
  const config = makeConfig({
    mode: 'study',
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: true },
  });
  const rComposite = computeRemindReason('https://youtube.com', config, true);
  const rStudy    = computeRemindReason('https://khanacademy.org', config, true);
  check('undeterminedLocked + composite domain → blocked with quota_undetermined', rComposite.blocked && rComposite.reason === 'quota_undetermined', JSON.stringify(rComposite));
  check('undeterminedLocked + study domain → not blocked', !rStudy.blocked, JSON.stringify(rStudy));
}

{
  // Per-domain lock
  const config = makeConfig({
    mode: 'rest',
    lockedDomains: ['youtube.com'],
    quotaState: { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false },
  });
  const r = computeRemindReason('https://youtube.com', config, true);
  check('per-domain lock → blocked with quota', r.blocked && r.reason === 'quota', JSON.stringify(r));
}

{
  // Unsafe check uses unsafeList OR blacklist (backward compat)
  // NOTE: JS: [] is truthy, so `[] || blacklist` evaluates to [].
  // Only falls back to blacklist if unsafeList is null/undefined.
  const config = makeConfig({ unsafeList: undefined, blacklist: ['badsite.com'] });
  const r = computeRemindReason('https://badsite.com', config, true);
  check('legacy blacklist (unsafeList undefined) → blocked as unsafe', r.blocked && r.reason === 'unsafe', JSON.stringify(r));

  // When unsafeList is empty array, blacklist fallback does NOT activate ([] is truthy)
  const config2 = makeConfig({ unsafeList: [], blacklist: ['badsite.com'] });
  const r2 = computeRemindReason('https://badsite.com', config2, true);
  check('empty unsafeList (truthy) → blacklist NOT used as fallback', r2.reason !== 'unsafe', JSON.stringify(r2));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Auto-study mode switching
// ═══════════════════════════════════════════════════════════════════════════════
section('Auto-study: mode switch logic');

const baseState = {
  autoStudyDomain: null,
  autoStudyStartTime: null,
  activeTabDomain: 'khanacademy.org',
  windowHasFocus: true,
  userIsIdle: false,
};

{
  // Already in study mode → skip
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'study' };
  const action = computeAutoStudyAction(baseState, config, session, Date.now());
  check('already in study mode → skip (no action)', action === 'skip', action);
}

{
  // Feature disabled → skip
  const config = makeConfig({ autoStudyConfig: { enabled: false, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const action = computeAutoStudyAction(baseState, config, session, Date.now());
  check('feature disabled → skip', action === 'skip', action);
}

{
  // Not on study site → reset
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const state = { ...baseState, activeTabDomain: 'instagram.com' };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('not on study site → reset counter', action === 'reset', action);
}

{
  // Window not focused → reset
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const state = { ...baseState, windowHasFocus: false };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('window not focused → reset counter', action === 'reset', action);
}

{
  // User idle → reset
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const state = { ...baseState, userIsIdle: true };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('user idle → reset counter', action === 'reset', action);
}

{
  // First time on study site → start tracking
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const state = { ...baseState, autoStudyDomain: null, autoStudyStartTime: null };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('first time on study site → start_tracking', action === 'start_tracking', action);
}

{
  // Different study site from what was being tracked → start_tracking (restart)
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const state = { ...baseState, autoStudyDomain: 'github.com', autoStudyStartTime: Date.now() - 50000, activeTabDomain: 'khanacademy.org' };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('switched study site → restart tracking (start_tracking)', action === 'start_tracking', action);
}

{
  // On study site, time not yet reached → keep tracking
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const startTime = Date.now() - 60000; // 60s ago, need 90
  const state = { ...baseState, autoStudyDomain: 'khanacademy.org', autoStudyStartTime: startTime };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('60s elapsed (< 90s required) → keep_tracking', action === 'keep_tracking', action);
}

{
  // Time threshold reached → should_switch
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const startTime = Date.now() - 91000; // 91s ago
  const state = { ...baseState, autoStudyDomain: 'khanacademy.org', autoStudyStartTime: startTime };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('91s elapsed (>= 90s required) → should_switch', action === 'should_switch', action);
}

{
  // Exactly at threshold → should_switch
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 90 } });
  const session = { currentMode: 'rest' };
  const startTime = Date.now() - 90000; // exactly 90s
  const state = { ...baseState, autoStudyDomain: 'khanacademy.org', autoStudyStartTime: startTime };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('exactly 90s → should_switch', action === 'should_switch', action);
}

{
  // Custom threshold respected
  const config = makeConfig({ autoStudyConfig: { enabled: true, requiredSeconds: 30 } });
  const session = { currentMode: 'rest' };
  const startTime = Date.now() - 31000;
  const state = { ...baseState, autoStudyDomain: 'khanacademy.org', autoStudyStartTime: startTime };
  const action = computeAutoStudyAction(state, config, session, Date.now());
  check('custom 30s threshold respected', action === 'should_switch', action);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: GAP-2 — 配额 = 0 表示不限制
// ═══════════════════════════════════════════════════════════════════════════════
section('Quota: zero = unlimited (GAP-2)');

{
  // dailyRestQuota = 0 → effectiveDailyRest = 0 → (0 > 0) = false → 不锁
  const config = makeConfig({ dailyRestQuota: 0 });
  const stats = { 'reddit.com': 999999 }; // 16666 分钟
  const { newState, restMinutes } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('[GAP-2] dailyRestQuota=0 → NOT restLocked (unlimited)', !newState.restLocked, `restMinutes=${restMinutes}`);
}

{
  // dailyUndeterminedQuota = 0 → (0 > 0) = false → 不锁
  const config = makeConfig({ dailyUndeterminedQuota: 0 });
  const { newState, undeterminedMinutes } = computeQuotaState(config, {}, { 'youtube.com': 999999 }, 0, '2026-04-14');
  check('[GAP-2] dailyUndeterminedQuota=0 → NOT undeterminedLocked (unlimited)', !newState.undeterminedLocked, `undetermined=${undeterminedMinutes}`);
}

{
  // dailyOnlineQuota = 0 → (0 > 0) = false → 不锁（已有 BL-Q01 但在此单独验证）
  const config = makeConfig({ dailyOnlineQuota: 0 });
  const stats = { 'reddit.com': 999999 };
  const { newState, totalMinutes } = computeQuotaState(config, stats, {}, 0, '2026-04-14');
  check('[GAP-2] dailyOnlineQuota=0 → NOT onlineLocked (unlimited)', !newState.onlineLocked, `totalMinutes=${totalMinutes}`);
}

{
  // weeklyRestQuota = null → 默认为 effectiveDailyRest * 7
  // effectiveDailyRest = 30, weeklyRestLimit = 210
  // weekRestMinutes = 200 < 210 → 不锁
  const config = makeConfig({ dailyRestQuota: 30, weeklyRestQuota: null });
  const { newState } = computeQuotaState(config, {}, {}, 200, '2026-04-14');
  check('[GAP-2] weeklyRestQuota=null → defaults to dailyRest*7, 200 < 210 → NOT weeklyRestLocked', !newState.weeklyRestLocked, JSON.stringify(newState));
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 6: GAP-4 — 配额状态变化（transition）检测
// ═══════════════════════════════════════════════════════════════════════════════
section('Quota: state transition detection (GAP-4)');

function stateChanged(oldState, newState) {
  return newState.onlineLocked       !== oldState.onlineLocked       ||
         newState.studyLocked        !== oldState.studyLocked        ||
         newState.restLocked         !== oldState.restLocked         ||
         newState.undeterminedLocked !== oldState.undeterminedLocked;
}

{
  // 相同状态 → stateChanged = false（不重复触发通知）
  const s = { onlineLocked: true, studyLocked: false, restLocked: false, undeterminedLocked: false };
  check('[GAP-4] identical states → stateChanged = false', stateChanged(s, { ...s }) === false);
}

{
  // false → true → stateChanged = true
  const old_ = { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false };
  const new_ = { onlineLocked: false, studyLocked: false, restLocked: true,  undeterminedLocked: false };
  check('[GAP-4] restLocked false→true → stateChanged = true', stateChanged(old_, new_) === true);
}

{
  // true → true → stateChanged = false（已锁定，不重复通知）
  const old_ = { onlineLocked: false, studyLocked: false, restLocked: true, undeterminedLocked: false };
  const new_ = { onlineLocked: false, studyLocked: false, restLocked: true, undeterminedLocked: false };
  check('[GAP-4] restLocked true→true → stateChanged = false (no repeat notify)', stateChanged(old_, new_) === false);
}

{
  // true → false → stateChanged = true（锁定解除，如每日重置后）
  const old_ = { onlineLocked: true, studyLocked: false, restLocked: false, undeterminedLocked: false };
  const new_ = { onlineLocked: false, studyLocked: false, restLocked: false, undeterminedLocked: false };
  check('[GAP-4] onlineLocked true→false → stateChanged = true (reset detected)', stateChanged(old_, new_) === true);
}

{
  // weeklyRestLocked 不参与 stateChanged 计算（它是 restLocked 的子状态，不单独触发）
  const old_ = { onlineLocked: false, studyLocked: false, restLocked: true, undeterminedLocked: false };
  const new_ = { onlineLocked: false, studyLocked: false, restLocked: true, undeterminedLocked: false };
  check('[GAP-4] weeklyRestLocked 不独立参与 stateChanged 计算', stateChanged(old_, new_) === false);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════════════════════
const total = passed + failed;
console.log(`\n[Background Logic] ${passed}/${total} passed${failed > 0 ? ` — ${failed} FAILED` : ''}`);
if (failures.length > 0) {
  console.log('Failed:');
  failures.forEach(f => console.log(`  - ${f}`));
  process.exit(1);
}
