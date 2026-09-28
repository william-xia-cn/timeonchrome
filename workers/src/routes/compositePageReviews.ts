import { saveReviewOpinion } from '../services/compositePageEvidence';
import { compositeSnapshotGuard, type CompositeAttributionSnapshot } from '../services/compositePageCorrections';
import { json, type Env, verifyAccountToken } from '../db/middleware';
import { verifyDeviceTokenFromRequest, deviceUnboundResponse } from './deviceIdentity';
import {
  deleteReviewDetails, receivePageEvidence, reviewDetail, reviewEnabled, scanCompositeReviews, validatePageEvidenceBody, readCorrectedCompositeAccount,
} from '../services/compositePageReviews';
import { compositeReviewCandidates, reviewDate } from '../services/compositePageAnalysis.js';

const DEVICE_PATH = '/device/composite-reviews/v1';
const PARENT_RE = /^\/profiles\/([^/]+)\/composite-reviews\/v1(?:\/([^/]+)(\/opinion)?)?$/;

async function limitedBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const parts: Uint8Array[] = []; let size = 0;
  while (true) {
    const result = await reader.read(); if (result.done) break;
    size += result.value.byteLength;
    if (size > 300000) { await reader.cancel(); return null; }
    parts.push(result.value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { return null; }
}

export const compositePageReviewsRouter = {
  matches(path: string) { return path === DEVICE_PATH || PARENT_RE.test(path); },
  async handle(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    try {
      if (path === DEVICE_PATH) {
        const device = await verifyDeviceTokenFromRequest(request, env);
        if (!device) return json({ error: 'Unauthorized' }, 401);
        if (device.unbound) return deviceUnboundResponse(device.deviceId);
        const profile = await env.DB.prepare('SELECT config FROM profiles WHERE id = ?').bind(device.profileId).first<any>();
        if (!profile || !reviewEnabled(JSON.parse(profile.config))) return request.method === 'GET'
          ? json({ requests: [] }) : json({ error: 'Collection disabled' }, 403);
        if (request.method === 'GET') {
          await scanCompositeReviews(env, device.profileId);
          const result = await env.DB.prepare(`SELECT q.id, q.profile_id AS profileId, q.device_id AS deviceId,
            q.cutoff, q.day_start AS dayStart, r.site FROM composite_page_requests_v1 q
            JOIN composite_page_reviews_v1 r ON r.id = q.review_id
            WHERE q.device_id = ? AND q.profile_id = ? AND q.status = 'pending' AND r.details_deleted_at IS NULL AND q.cutoff > ?
            ORDER BY q.cutoff DESC LIMIT 10`).bind(device.deviceId, device.profileId, Date.now() - 3 * 86400000).all<any>();
          return json({ requests: result.results || [] });
        }
        if (request.method === 'POST') {
          const body = await limitedBody(request);
          const q = await env.DB.prepare(`SELECT q.*, r.site, r.details_deleted_at FROM composite_page_requests_v1 q
            JOIN composite_page_reviews_v1 r ON r.id = q.review_id
            WHERE q.id = ? AND q.device_id = ? AND q.profile_id = ?`)
            .bind(body?.requestId || '', device.deviceId, device.profileId).first<any>();
          if (!q || q.details_deleted_at || q.status === 'deleted' || q.cutoff <= Date.now() - 3 * 86400000) return json({ error: 'Evidence request expired' }, 404);
          if (!validatePageEvidenceBody(body, q, q.site)) return json({ error: 'Invalid evidence', code: 'INVALID_PAGE_EVIDENCE' }, 400);
          const response = await receivePageEvidence(env, q, body);
          return 'conflict' in response ? json({ error: 'Evidence conflict', code: 'PAGE_EVIDENCE_CONFLICT' }, 409) : json(response);
        }
        return json({ error: 'Method not allowed' }, 405);
      }
      const match = path.match(PARENT_RE)!;
      const accountId = await verifyAccountToken(request, env.JWT_SECRET);
      if (!accountId) return json({ error: 'Unauthorized' }, 401);
      const profile = await env.DB.prepare('SELECT id, config FROM profiles WHERE id = ? AND account_id = ?').bind(match[1], accountId).first<any>();
      if (!profile) return json({ error: 'Profile not found' }, 404);
      if (!match[2] && request.method === 'GET') {
        await scanCompositeReviews(env, profile.id);
        const rows = await env.DB.prepare('SELECT * FROM composite_page_reviews_v1 WHERE profile_id = ? ORDER BY date DESC, total_seconds DESC LIMIT 100')
          .bind(profile.id).all<any>();
        const now = Date.now(), today = reviewDate(now);
        const dayIndex = new Date(now + 8 * 3600000).getUTCDay();
        const weekStart = reviewDate(now - ((dayIndex + 6) % 7) * 86400000);
        const headSql='SELECT device_id,date,manifest_id FROM device_account_heads_v2 WHERE profile_id = ? AND date >= ? AND date <= ? ORDER BY date,device_id';
        const heads = await env.DB.prepare(headSql)
          .bind(profile.id, weekStart, today).all<{device_id:string;date:string;manifest_id:string}>();
        const snapshots:CompositeAttributionSnapshot[]=[];
        const usage = new Map<string, { site: string; todaySeconds: number; weekSeconds: number }>();
        for (const head of heads.results || []) {
          const account = await readCorrectedCompositeAccount(env, profile.id, head.manifest_id);
          if(!account || account.deviceId!==head.device_id || account.date!==head.date) throw new Error('COMPOSITE_ACCOUNT_UNAVAILABLE');
          snapshots.push(account.attributionSnapshot);
          for (const group of compositeReviewCandidates([account])) {
            const entry = usage.get(group.site) || { site: group.site, todaySeconds: 0, weekSeconds: 0 };
            entry.weekSeconds += group.totalSeconds;
            if (account.date === today) entry.todaySeconds += group.totalSeconds;
            usage.set(group.site, entry);
          }
        }
        const currentHeads=await env.DB.prepare(headSql).bind(profile.id,weekStart,today).all();
        if(JSON.stringify(currentHeads.results)!==JSON.stringify(heads.results)) throw new Error('COMPOSITE_REVIEW_CHANGED');
        if(snapshots.length) {
          // Reading confirmed usage does not require enabling collection. Writes retain the default strict guard.
          const stable=await env.DB.prepare(`SELECT ${compositeSnapshotGuard('?1', false, false)} AS valid`).bind(JSON.stringify(snapshots)).first<{valid:number}>();
          if(stable?.valid!==1) throw new Error('COMPOSITE_REVIEW_CHANGED');
        }
        const currentProfile = await env.DB.prepare('SELECT config FROM profiles WHERE id = ? AND account_id = ?').bind(profile.id, accountId).first<{config:string}>();
        if (!currentProfile || currentProfile.config !== profile.config) throw new Error('COMPOSITE_REVIEW_CHANGED');
        return json({ reviews: rows.results || [], usage: [...usage.values()], asOf: now, enabled: reviewEnabled(JSON.parse(profile.config)) });
      }
      const review = await env.DB.prepare('SELECT * FROM composite_page_reviews_v1 WHERE id = ? AND profile_id = ?').bind(match[2] || '', profile.id).first<any>();
      if (!review) return json({ error: 'Review not found' }, 404);
      if (!match[3] && request.method === 'DELETE') { await deleteReviewDetails(env, review.id); return json({ success: true }); }
      if (!match[3] && request.method === 'GET') { const { requestVersions, attributionSnapshots, ...detail } = await reviewDetail(env, review); return json(detail); }
      if (match[3] && request.method === 'POST') {
        if (review.details_deleted_at) return json({ error: 'Page evidence deleted' }, 409);
        const body = await limitedBody(request);
        if (!body || !['study', 'rest', 'unknown'].includes(body.verdict) || typeof body.reason !== 'string' || body.reason.length > 300) return json({ error: 'Invalid opinion' }, 400);
        const detail = await reviewDetail(env, review);
        if (!detail.pages.some((p) => p.pageKey === body.pageKey)) return json({ error: 'Page not found' }, 404);
        if (!await saveReviewOpinion(env.DB, profile.id, review.id, body, detail.requestVersions,Date.now(),detail.attributionSnapshots)) {
          return json({ error: 'Review changed', code: 'COMPOSITE_REVIEW_CHANGED' }, 409);
        }
        const after = await reviewDetail(env, review);
        const completed = after.pages.length > 0 && after.pages.every((p) => !!p.opinion) && after.complete;
        const updated = await env.DB.prepare(`UPDATE composite_page_reviews_v1 SET reviewed_at=?
          WHERE id=? AND profile_id=? AND details_deleted_at IS NULL
          AND (SELECT COUNT(*) FROM composite_page_requests_v1 WHERE review_id=?2)=json_array_length(?4)
          AND NOT EXISTS (SELECT 1 FROM composite_page_requests_v1 q WHERE q.review_id=?2
            AND NOT EXISTS (SELECT 1 FROM json_each(?4) j WHERE q.id=json_extract(j.value,'$.id')
              AND q.manifest_id=json_extract(j.value,'$.manifest_id') AND q.cutoff=json_extract(j.value,'$.cutoff')
              AND q.evidence_hash IS json_extract(j.value,'$.evidence_hash')
              AND q.status=json_extract(j.value,'$.status') AND q.complete=json_extract(j.value,'$.complete')))
          AND ${compositeSnapshotGuard('?5')}`)
          .bind(completed ? Date.now() : null,review.id,profile.id,JSON.stringify(after.requestVersions),JSON.stringify(after.attributionSnapshots)).run();
        if(!updated.meta.changes) return json({error:'Review changed',code:'COMPOSITE_REVIEW_CHANGED'},409);
        return json({ success: true, completed });
      }
      return json({ error: 'Method not allowed' }, 405);
    } catch {
      return json({ error: 'Composite review unavailable', code: 'COMPOSITE_REVIEW_UNAVAILABLE' }, 503);
    }
  },
};
