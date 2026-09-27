import { receivePageEvidence as receiveSafe, deleteReviewDetails as deleteSafe, refreshEvidenceRequest } from './compositePageEvidence';
import type { Env } from '../db/middleware';
import { readManifestAccountV2 } from './profileAccountsV2';
import { projectCompositeDailyRows, readCompositeCorrections, compositeSnapshotGuard, type CompositeAttributionSnapshot } from './compositePageCorrections';
import { loadAccountNotificationSettings } from './notificationSettings';
import { sendResendEmail, sendTelegramMessage, isEmailClassificationEnabled } from './siteClassificationEmail';
import {
  attributeCompositePages, compositeReviewCandidates, compositeSiteIdentity,
  hashPageEvidence, reviewDate, sanitizeCompositePage, suggestCompositePage,
  COMPOSITE_REVIEW_THRESHOLD_SECONDS,
} from './compositePageAnalysis.js';

const DAY = 86400000;
const NOTIFICATION_LEASE_MS = 5 * 60_000;
export const reviewEnabled = (config: any) => config?.compositeReviewConfig?.enabled === true;

export async function readCorrectedCompositeAccount(env: Env, profileId: string, manifestId: string) {
  const account = await readManifestAccountV2(env, manifestId);
  if (!account) return null;
  if (account.profileId !== profileId) throw new Error('COMPOSITE_ACCOUNT_SCOPE_CONFLICT');
  const correction = await readCompositeCorrections(env.DB.withSession('first-primary'), profileId,
    account.deviceId, account.date, account.generatedAt);
  return {...account,rows:projectCompositeDailyRows(account,correction.items),
    correctionRevision:correction.revision,corrections:correction.items,
    attributionSnapshot:{profileId,deviceId:account.deviceId,date:account.date,cutoff:account.generatedAt,
      manifestId:account.manifestId,corrections:correction.items} satisfies CompositeAttributionSnapshot};
}

export async function scanCompositeReviews(env: Env, profileId: string, now = Date.now(), date = reviewDate(now)) {
  const profile = await env.DB.prepare('SELECT config FROM profiles WHERE id = ?').bind(profileId).first<any>();
  if (!profile || !reviewEnabled(JSON.parse(profile.config))) return;
  const heads = await env.DB.prepare('SELECT device_id, manifest_id FROM device_account_heads_v2 WHERE profile_id = ? AND date = ?')
    .bind(profileId, date).all<any>();
  const accounts: any[] = [];
  for (const head of heads.results || []) {
    const account = await readCorrectedCompositeAccount(env, profileId, head.manifest_id);
    if (!account || account.deviceId!==head.device_id || account.date!==date) throw new Error('COMPOSITE_ACCOUNT_UNAVAILABLE');
    accounts.push(account);
  }
  const candidates = compositeReviewCandidates(accounts);
  if(!accounts.length) return;
  const snapshots=JSON.stringify(accounts.map(account=>account.attributionSnapshot));
  // A later approved correction can move a site below the trigger. Keep its
  // review/audit record, but never leave its old triggering amount active.
  const existing = await env.DB.prepare('SELECT id,site FROM composite_page_reviews_v1 WHERE profile_id=? AND date=?')
    .bind(profileId,date).all<{id:string;site:string}>();
  for(const previous of existing.results || []) {
    const seconds=candidates.find(group=>group.site===previous.site)?.totalSeconds || 0;
    await env.DB.prepare(`UPDATE composite_page_reviews_v1 SET total_seconds=?1,as_of=?2,reviewed_at=NULL WHERE id=?3 AND total_seconds<>?4
      AND ${compositeSnapshotGuard('?5',true)}`)
      .bind(seconds,now,previous.id,seconds,snapshots).run();
  }
  for (const group of candidates) {
    if (group.totalSeconds < COMPOSITE_REVIEW_THRESHOLD_SECONDS) continue;
    const id = `cpr_${await hashPageEvidence([profileId, date, group.site])}`;
    const written=await env.DB.prepare(`INSERT INTO composite_page_reviews_v1 (id, profile_id, date, site, total_seconds, as_of, created_at)
      SELECT ?1,?2,?3,?4,?5,?6,?7 WHERE ${compositeSnapshotGuard('?8',true)}
      ON CONFLICT(profile_id, date, site) DO UPDATE SET total_seconds = excluded.total_seconds, as_of = excluded.as_of`)
      .bind(id, profileId, date, group.site, group.totalSeconds, now, now,snapshots).run();
    if(!written.meta.changes) throw new Error('COMPOSITE_REVIEW_CHANGED');
    const review = await env.DB.prepare('SELECT details_deleted_at FROM composite_page_reviews_v1 WHERE id = ?').bind(id).first<any>();
    if (review?.details_deleted_at) continue;
    const dayStart = Date.parse(`${date}T00:00:00+08:00`);
    for (const account of accounts) {
      const seconds = group.devices[account.deviceId];
      if (!seconds) continue;
      const requestId = `cpe_${await hashPageEvidence([id, account.deviceId])}`;
      const cutoff = Math.min(now, account.generatedAt, dayStart + DAY);
      await refreshEvidenceRequest(env.DB, {
        id: requestId, review_id: id, profile_id: profileId, device_id: account.deviceId,
        manifest_id: account.manifestId, cutoff, day_start: dayStart, expected_seconds: seconds,
        snapshots:accounts.map(account=>account.attributionSnapshot),
      });
    }
    for (const channel of ['email', 'telegram']) {
      await env.DB.prepare('INSERT OR IGNORE INTO composite_review_notifications_v1 (review_id, channel) VALUES (?, ?)').bind(id, channel).run();
    }
  }
}

export function validatePageEvidenceBody(body: any, request: any, site: string) {
  if (!body || body.cutoff !== request.cutoff || !/^[a-f0-9]{64}$/.test(body.hash || '') || typeof body.complete !== 'boolean' ||
    !Number.isInteger(body.count) || body.count < 0 || body.count > 5000 ||
    body.chunks !== Math.max(1, Math.ceil(body.count / 200)) || !Number.isInteger(body.index) || body.index < 0 || body.index >= body.chunks ||
    !Array.isArray(body.rows) || body.rows.length !== Math.min(200, Math.max(0, body.count - body.index * 200))) return false;
  for (const row of body.rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
    if (row.profileId !== request.profile_id || row.deviceId !== request.device_id || row.site !== site ||
      !Number.isInteger(row.tabId) || row.tabId < 0 || !Number.isInteger(row.windowId) || row.windowId < 0 ||
      !Number.isFinite(row.startMs) || !Number.isFinite(row.endMs) || !Number.isFinite(row.lastObservedAt) ||
      row.startMs < request.day_start || row.endMs > request.cutoff || row.endMs < row.startMs ||
      row.lastObservedAt < row.startMs - 90000 || row.lastObservedAt > request.cutoff || !row.page ||
      typeof row.page.host !== 'string' || !(row.page.host === site || row.page.host.endsWith(`.${site}`)) ||
      typeof row.page.path !== 'string' || !row.page.path.startsWith('/') || row.page.path.length > 512 ||
      typeof row.page.title !== 'string' || row.page.title.length > 160) return false;
    const page = sanitizeCompositePage(`https://${row.page.host}${row.page.path.split('/').map(encodeURIComponent).join('/')}`, row.page.title);
    if (!page || page.path !== row.page.path || page.title !== row.page.title) return false;
    const allowed = ['id', 'profileId', 'deviceId', 'tabId', 'windowId', 'documentId', 'site', 'page', 'startMs', 'endMs', 'lastObservedAt'];
    if (Object.keys(row).some((key) => !allowed.includes(key)) || Object.keys(row.page).some((key) => !['host', 'path', 'title'].includes(key))) return false;
    if (typeof row.id !== 'string' || !row.id.length || row.id.length > 64 || (row.documentId != null && (typeof row.documentId !== 'string' || row.documentId.length > 128))) return false;
  }
  return true;
}

export async function receivePageEvidence(env: Env, request: any, body: any) {
  return receiveSafe(env.DB, request, body);
}
export async function reviewDetail(env: Env, review: any) {
  // All reads in a detail response share a sequentially consistent session.
  const session = env.DB.withSession('first-primary');
  const current = await session.prepare('SELECT * FROM composite_page_reviews_v1 WHERE id=? AND profile_id=?')
    .bind(review.id, review.profile_id).first<any>();
  if (!current) throw new Error('COMPOSITE_REVIEW_CHANGED');
  review = current;
  const expired = (review.reviewed_at ?? review.created_at) < Date.now() - 30 * DAY;
  if (review.details_deleted_at != null || expired) {
    return {review,devices:[],requestVersions:[],attributionSnapshots:[],rawSeconds:0,unassignedSeconds:0,
      publishedRawDeltaSeconds:review.total_seconds,pages:[],complete:false,unavailableReason:'DETAILS_UNAVAILABLE'};
  }
  const db = session;
  const requests = await db.prepare('SELECT * FROM composite_page_requests_v1 WHERE review_id = ? ORDER BY device_id').bind(review.id).all<any>();
  const requestVersions = JSON.parse(JSON.stringify(requests.results || []));
  const segments: any[] = [], evidence: any[] = [], devices: any[] = [];
  const correctionVersions: Array<{deviceId:string;cutoff:number;revision:string}> = [];
  const attributionSnapshots: CompositeAttributionSnapshot[] = [];
  for (const request of requests.results || []) {
    const correction=await readCompositeCorrections(db,review.profile_id,request.device_id,review.date,request.cutoff);
    correctionVersions.push({deviceId:request.device_id,cutoff:request.cutoff,revision:correction.revision});
    const account=await readCorrectedCompositeAccount(env,review.profile_id,request.manifest_id);
    if(!account || account.deviceId!==request.device_id || account.date!==review.date
      || account.generatedAt!==request.cutoff || account.correctionRevision!==correction.revision) throw new Error('COMPOSITE_REVIEW_CHANGED');
    attributionSnapshots.push(account.attributionSnapshot);
    const expectedSeconds=compositeReviewCandidates([account]).find(group=>group.site===review.site)?.totalSeconds || 0;
    const raw = await db.prepare(`SELECT s.id, s.device_id AS deviceId, s.tab_id AS tabId, s.window_id AS windowId,
      s.start_ms AS startMs, s.end_ms AS endMs, s.duration_seconds AS durationSeconds, s.domain, s.channel,
      s.managed_target_value AS targetValue FROM usage_segments_v1 s
      LEFT JOIN usage_segment_corrections_v1 c ON c.segment_id=s.id AND c.profile_id=s.profile_id
        AND c.device_id=s.device_id AND c.date=s.date
      WHERE s.profile_id = ? AND s.device_id = ? AND s.date = ? AND s.channel = 'active'
        AND COALESCE(c.effective_target_classification,s.target_classification_at_time) = 'composite'
        AND s.end_ms <= ? ORDER BY s.start_ms, s.id`)
      .bind(review.profile_id, request.device_id, review.date, request.cutoff).all<any>();
    const rows = (raw.results || []).filter((s) => compositeSiteIdentity(s.targetValue) === review.site);
    segments.push(...rows);
    if (request.status === 'ready' && !review.details_deleted_at) {
      const chunks = await db.prepare('SELECT payload_json FROM composite_page_chunks_v1 WHERE request_id = ? AND cutoff = ? ORDER BY chunk_index')
        .bind(request.id, request.cutoff).all<any>();
      const records = (chunks.results || []).flatMap((chunk) => JSON.parse(chunk.payload_json));
      if (records.length === request.row_count && await hashPageEvidence(records) === request.evidence_hash) evidence.push(...records);
      else request.status = 'invalid';
    }
    devices.push({ deviceId: request.device_id, cutoff: request.cutoff, expectedSeconds,
      rawSeconds: rows.reduce((sum, s) => sum + s.durationSeconds, 0), evidenceStatus: request.status, evidenceComplete: request.complete === 1 });
  }
  const analysis = attributeCompositePages(segments, evidence);
  const opinions = await db.prepare('SELECT page_key, verdict, reason FROM composite_page_opinions_v1 WHERE review_id = ?').bind(review.id).all<any>();
  const pages: any[] = [];
  for (const page of analysis.pages) {
    const key = await hashPageEvidence(page.pageKey);
    pages.push({ ...page, pageKey: key, suggestion: suggestCompositePage(page), opinion: (opinions.results || []).find((o) => o.page_key === key) || null });
  }
  const finalReview = await db.prepare('SELECT * FROM composite_page_reviews_v1 WHERE id=? AND profile_id=?').bind(review.id,review.profile_id).first<any>();
  const finalRequests = await db.prepare('SELECT * FROM composite_page_requests_v1 WHERE review_id=? ORDER BY device_id').bind(review.id).all<any>();
  if (!finalReview || finalReview.details_deleted_at != null || finalReview.as_of !== review.as_of
    || finalReview.total_seconds !== review.total_seconds
    || JSON.stringify(finalRequests.results || []) !== JSON.stringify(requestVersions)) throw new Error('COMPOSITE_REVIEW_CHANGED');
  for(const version of correctionVersions) {
    const latest=await readCompositeCorrections(db,review.profile_id,version.deviceId,review.date,version.cutoff);
    if(latest.revision!==version.revision) throw new Error('COMPOSITE_REVIEW_CHANGED');
  }
  const stable=await db.prepare(`SELECT ${compositeSnapshotGuard('?1')} AS valid`)
    .bind(JSON.stringify(attributionSnapshots)).first<{valid:number}>();
  if(stable?.valid!==1) throw new Error('COMPOSITE_REVIEW_CHANGED');
  const effectiveTotal=devices.reduce((sum,device)=>sum+device.expectedSeconds,0);
  return { review:{...review,total_seconds:effectiveTotal}, devices, requestVersions, attributionSnapshots, rawSeconds: analysis.totalSeconds, unassignedSeconds: analysis.unassignedSeconds,
    attributionBasis: 'approved-week-corrections', correctionRevision:await hashPageEvidence(correctionVersions), unavailableReason:null,
    publishedRawDeltaSeconds: effectiveTotal - analysis.totalSeconds, pages,
    complete: !review.details_deleted_at && devices.length > 0 && devices.every((d) => d.evidenceStatus === 'ready' && d.evidenceComplete && d.rawSeconds === d.expectedSeconds) && analysis.unassignedSeconds === 0 && analysis.totalSeconds === effectiveTotal };
}

export async function deleteReviewDetails(env: Env, reviewId: string, now = Date.now()) {
  const owner = await env.DB.prepare('SELECT profile_id FROM composite_page_reviews_v1 WHERE id=?').bind(reviewId).first<{profile_id:string}>();
  if(owner) await deleteSafe(env.DB, owner.profile_id, reviewId, now);
}
export async function maintainCompositeReviews(env: Env, now = Date.now()) {
  const profiles = await env.DB.prepare('SELECT id, config FROM profiles').all<any>();
  for (const profile of profiles.results || []) if (reviewEnabled(JSON.parse(profile.config))) {
    for (let day = 0; day < 3; day++) await scanCompositeReviews(env, profile.id, now, reviewDate(now - day * DAY));
  }
  const expired = await env.DB.prepare('SELECT id FROM composite_page_reviews_v1 WHERE details_deleted_at IS NULL AND COALESCE(reviewed_at, created_at) < ? LIMIT 100')
    .bind(now - 30 * DAY).all<any>();
  for (const review of expired.results || []) await deleteReviewDetails(env, review.id, now);
  await processCompositeNotifications(env, now);
}

export async function processCompositeNotifications(env: Env, now = Date.now()) {
  const jobs = await env.DB.prepare(`SELECT n.*, r.profile_id, r.date, r.site, r.total_seconds, p.account_id, p.config, a.email
    FROM composite_review_notifications_v1 n JOIN composite_page_reviews_v1 r ON r.id = n.review_id
    JOIN profiles p ON p.id = r.profile_id JOIN accounts a ON a.id = p.account_id
    WHERE n.status IN ('pending','sending') AND n.next_attempt_at <= ? AND n.attempts < 5 AND r.created_at > ?
      AND r.details_deleted_at IS NULL AND r.total_seconds>=1800 LIMIT 20`)
    .bind(now, now - DAY).all<any>();
  for (const job of jobs.results || []) {
    if (!reviewEnabled(JSON.parse(job.config))) continue;
    const settings = await loadAccountNotificationSettings(env, job.account_id);
    const available = job.channel === 'email' ? settings.emailEnabled && env.RESEND_API_KEY && isEmailClassificationEnabled(env)
      : settings.telegramEnabled && settings.telegramConnected && env.TELEGRAM_BOT_TOKEN;
    if (!available) continue;
    // Sending uses a fresh published head + approved attribution, not the queued threshold.
    const heads=await env.DB.prepare('SELECT manifest_id FROM device_account_heads_v2 WHERE profile_id=? AND date=?')
      .bind(job.profile_id,job.date).all<{manifest_id:string}>();
    const accounts=[];
    for(const head of heads.results || []) {
      const account=await readCorrectedCompositeAccount(env,job.profile_id,head.manifest_id);
      if(!account) throw new Error('COMPOSITE_ACCOUNT_UNAVAILABLE');
      accounts.push(account);
    }
    const currentGroup=compositeReviewCandidates(accounts).find(group=>group.site===job.site);
    if(!currentGroup || currentGroup.totalSeconds<COMPOSITE_REVIEW_THRESHOLD_SECONDS) continue;
    const claim = await env.DB.prepare(`UPDATE composite_review_notifications_v1 SET status = 'sending', attempts = attempts + 1, next_attempt_at = ?
      WHERE review_id = ? AND channel = ? AND status IN ('pending','sending')
      AND attempts = ? AND attempts < 5 AND next_attempt_at <= ?
      AND EXISTS (SELECT 1 FROM composite_page_reviews_v1 r JOIN profiles p ON p.id=r.profile_id
        WHERE r.id=composite_review_notifications_v1.review_id AND r.details_deleted_at IS NULL
          AND CASE WHEN json_valid(p.config) THEN json_type(p.config,'$.compositeReviewConfig.enabled')='true' ELSE 0 END)
      AND ${compositeSnapshotGuard('?6',true)}`)
      .bind(now + NOTIFICATION_LEASE_MS, job.review_id, job.channel, job.attempts, now,
        JSON.stringify(accounts.map(account=>account.attributionSnapshot))).run();
    if (!claim.meta.changes) continue;
    const text = `TimeOnChrome：${job.date} ${job.site} 的复合网页已确认用量 ${Math.floor(currentGroup.totalSeconds / 60)} 分钟，达到 30 分钟复核线。页面证据收集中，请在家长控制台查看并逐页复核。复核不会改变记账或配额。`;
    try {
      if (job.channel === 'email') await sendResendEmail(env, { to: job.email, subject: 'TimeOnChrome 复合内容待复核', text, html: '<p>复合网页用量已达到复核线。页面证据收集中，请打开家长控制台查看。</p>' });
      else await sendTelegramMessage(env, settings.telegramChatId, text);
      await env.DB.prepare("UPDATE composite_review_notifications_v1 SET status = 'sent' WHERE review_id = ? AND channel = ? AND status = 'sending' AND attempts = ?")
        .bind(job.review_id, job.channel, job.attempts + 1).run();
    } catch {
      // No payload or provider response body enters diagnostic logs.
      await env.DB.prepare("UPDATE composite_review_notifications_v1 SET status = 'pending', next_attempt_at = ? WHERE review_id = ? AND channel = ? AND status = 'sending' AND attempts = ?")
        .bind(now + Math.min(1800000, 60000 * 2 ** job.attempts), job.review_id, job.channel, job.attempts + 1).run();
    }
  }
}
