import { hashPageEvidence } from '../../../contracts/composite-page-evidence/v1.js';

export interface CompositeCorrection {
  id: string;
  segmentId: string;
  deviceId: string;
  date: string;
  startMs: number;
  endMs: number;
  durationSeconds: number;
  targetKey: string;
  originalMode: string;
  originalClassification: string | null;
  originalQuotaBucket: string | null;
  effectiveMode: string;
  effectiveClassification: string;
  effectiveQuotaBucket: string;
}

interface CorrectionRecord {
  id: string; segment_id: string; device_id: string; date: string;
  start_ms: number; end_ms: number; duration_seconds: number;
  original_mode: string; original_target_classification: string | null;
  original_quota_bucket: string | null; effective_mode: string;
  effective_target_classification: string; effective_quota_bucket: string;
  target_key: string | null; source_valid: number;
}

/** Unlike the legacy convenience reader, missing tables/evidence must not look like no corrections. */
export async function readCompositeCorrections(
  db: Pick<D1DatabaseSession, 'prepare'>, profileId: string, deviceId: string, date: string, cutoff: number,
): Promise<{ items: CompositeCorrection[]; revision: string }> {
  const result = await db.prepare(`SELECT c.id,c.segment_id,c.device_id,c.date,c.start_ms,c.end_ms,c.duration_seconds,
    c.original_mode,c.original_target_classification,c.original_quota_bucket,
    c.effective_mode,c.effective_target_classification,c.effective_quota_bucket,
    COALESCE(s.managed_target_id,'fallback:domain:'||s.domain) AS target_key,
    CASE WHEN s.id IS NOT NULL AND s.profile_id=c.profile_id AND s.device_id=c.device_id
      AND s.date=c.date AND s.domain=c.domain AND s.channel=c.channel
      AND s.start_ms=c.start_ms AND s.end_ms=c.end_ms AND s.duration_seconds=c.duration_seconds
      AND s.mode=c.original_mode AND s.target_classification_at_time IS c.original_target_classification
      AND s.quota_bucket_at_time IS c.original_quota_bucket THEN 1 ELSE 0 END AS source_valid
    FROM usage_segment_corrections_v1 c LEFT JOIN usage_segments_v1 s ON s.id=c.segment_id
    WHERE c.profile_id=? AND c.device_id=? AND c.date=? AND c.channel='active' AND c.end_ms<=?
    ORDER BY c.segment_id,c.id`).bind(profileId,deviceId,date,cutoff).all<CorrectionRecord>();
  const seen = new Set<string>();
  const dayStart = Date.parse(`${date}T00:00:00+08:00`);
  const items = (result.results || []).map((row): CompositeCorrection => {
    if (row.source_valid !== 1 || !row.target_key || seen.has(row.segment_id)
      || !Number.isSafeInteger(row.duration_seconds) || row.duration_seconds < 0
      || !Number.isSafeInteger(row.start_ms) || !Number.isSafeInteger(row.end_ms)
      || row.start_ms < dayStart || row.end_ms < row.start_ms || row.end_ms > dayStart + 86400000
      || !row.effective_mode || !row.effective_target_classification || !row.effective_quota_bucket) {
      throw new Error('COMPOSITE_CORRECTION_EVIDENCE_CONFLICT');
    }
    seen.add(row.segment_id);
    return { id:row.id,segmentId:row.segment_id,deviceId:row.device_id,date:row.date,
      startMs:row.start_ms,endMs:row.end_ms,durationSeconds:row.duration_seconds,targetKey:row.target_key,
      originalMode:row.original_mode,originalClassification:row.original_target_classification,
      originalQuotaBucket:row.original_quota_bucket,effectiveMode:row.effective_mode,
      effectiveClassification:row.effective_target_classification,effectiveQuotaBucket:row.effective_quota_bucket };
  });
  return {items,revision:await hashPageEvidence(items)};
}

export interface CompositeDailyRow {
  kind: string; channel: string; targetKey?: string; mode?: string; quotaBucket?: string | null;
  targetClassificationAtTime?: string | null; durationSeconds: number;
  [key: string]: unknown;
}

export interface CompositeAttributionSnapshot {
  profileId: string; deviceId: string; date: string; cutoff: number; manifestId: string;
  corrections: CompositeCorrection[];
}

/** SQL compare-and-set fence. The JSON is built by the server, never from a request body. */
export function compositeSnapshotGuard(parameter: string, allHeads = false): string {
  if (!/^\?[1-9][0-9]*$/.test(parameter)) throw new Error('INVALID_SNAPSHOT_BIND');
  const scope = `c.profile_id=json_extract(v.value,'$.profileId')
    AND c.device_id=json_extract(v.value,'$.deviceId') AND c.date=json_extract(v.value,'$.date')
    AND c.channel='active' AND c.end_ms<=json_extract(v.value,'$.cutoff')`;
  const fields = [
    ['id','id'],['segment_id','segmentId'],['device_id','deviceId'],['date','date'],
    ['start_ms','startMs'],['end_ms','endMs'],['duration_seconds','durationSeconds'],
    ['original_mode','originalMode'],['original_target_classification','originalClassification'],
    ['original_quota_bucket','originalQuotaBucket'],['effective_mode','effectiveMode'],
    ['effective_target_classification','effectiveClassification'],['effective_quota_bucket','effectiveQuotaBucket'],
  ];
  // Fixed ordered tuples keep NULL distinctions without exhausting SQLite's expression depth.
  const match = `json_array(${fields.map(([column])=>`c.${column}`).join(',')})=
    json_array(${fields.map(([,key])=>`json_extract(j.value,'$.${key}')`).join(',')})`;
  return `(json_array_length(${parameter})>0 AND NOT EXISTS (
    SELECT 1 FROM json_each(${parameter}) v WHERE
      NOT EXISTS (SELECT 1 FROM device_account_heads_v2 h JOIN devices d ON d.id=h.device_id AND d.profile_id=h.profile_id
        JOIN profiles p ON p.id=h.profile_id WHERE h.profile_id=json_extract(v.value,'$.profileId')
        AND h.device_id=json_extract(v.value,'$.deviceId') AND h.date=json_extract(v.value,'$.date')
        AND h.manifest_id=json_extract(v.value,'$.manifestId') AND d.status='bound'
        AND CASE WHEN json_valid(p.config) THEN json_type(p.config,'$.compositeReviewConfig.enabled')='true' ELSE 0 END)
      OR (SELECT COUNT(*) FROM usage_segment_corrections_v1 c WHERE ${scope})<>json_array_length(v.value,'$.corrections')
      OR EXISTS (SELECT 1 FROM usage_segment_corrections_v1 c WHERE ${scope}
        AND NOT EXISTS (SELECT 1 FROM json_each(v.value,'$.corrections') j WHERE ${match}
          AND EXISTS (SELECT 1 FROM usage_segments_v1 s WHERE s.id=c.segment_id
            AND json_array(s.profile_id,s.device_id,s.date,s.domain,s.channel,s.start_ms,s.end_ms,s.duration_seconds,
              s.mode,s.target_classification_at_time,s.quota_bucket_at_time)=
              json_array(c.profile_id,c.device_id,c.date,c.domain,c.channel,c.start_ms,c.end_ms,c.duration_seconds,
              c.original_mode,c.original_target_classification,c.original_quota_bucket)
            AND COALESCE(s.managed_target_id,'fallback:domain:'||s.domain)=json_extract(j.value,'$.targetKey'))))
    ) ${allHeads ? `AND (SELECT COUNT(*) FROM device_account_heads_v2 h
      WHERE h.profile_id=json_extract(${parameter},'$[0].profileId')
        AND h.date=json_extract(${parameter},'$[0].date'))=json_array_length(${parameter})` : ''})`;
}

/** Read model only: never changes the published account or the authoritative ledger. */
export function projectCompositeDailyRows(
  account: {deviceId: string; date: string; generatedAt: number; rows: CompositeDailyRow[]},
  corrections: CompositeCorrection[],
): CompositeDailyRow[] {
  const rows = account.rows.filter(row=>row.kind==='daily_target').map(row=>({...row}));
  const original = rows.map(row=>({...row}));
  const remaining = original.map(row=>row.durationSeconds);
  const additions: CompositeDailyRow[] = [];
  const seen = new Set<string>();
  for (const correction of corrections) {
    if (correction.deviceId!==account.deviceId || correction.date!==account.date
      || correction.endMs>account.generatedAt || seen.has(correction.segmentId)) {
      throw new Error('COMPOSITE_CORRECTION_SCOPE_CONFLICT');
    }
    seen.add(correction.segmentId);
    if (!Number.isSafeInteger(correction.durationSeconds) || correction.durationSeconds<0) {
      throw new Error('COMPOSITE_CORRECTION_EVIDENCE_CONFLICT');
    }
    if (!correction.durationSeconds) continue;
    const matches = original.map((row,index)=>({row,index})).filter(({row})=>row.channel==='active'
      && row.targetKey===correction.targetKey && row.mode===correction.originalMode
      && (row.targetClassificationAtTime ?? null)===correction.originalClassification
      && (row.quotaBucket ?? null)===correction.originalQuotaBucket);
    if(matches.length!==1 || remaining[matches[0].index]<correction.durationSeconds) {
      throw new Error('COMPOSITE_CORRECTION_ACCOUNT_CONFLICT');
    }
    const {row,index}=matches[0];
    remaining[index]-=correction.durationSeconds;
    rows[index].durationSeconds=remaining[index];
    additions.push({...row,durationSeconds:correction.durationSeconds,mode:correction.effectiveMode,
      targetClassificationAtTime:correction.effectiveClassification,quotaBucket:correction.effectiveQuotaBucket});
  }
  return [...rows,...additions].filter(row=>row.durationSeconds>0);
}
