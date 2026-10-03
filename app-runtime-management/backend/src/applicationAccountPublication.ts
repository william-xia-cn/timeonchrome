import { hashUsageAccountValue, canonicalUsageAccountJson, verifyUsageAccountManifest,usageAccountDayStart,
  type UsageAccountManifest,type UsageAccountRow } from '@timeonchrome/app-runtime-contracts/usage-account';
import { getAppPolicy,refreshHistoricalProductIdentityProjection } from './appPolicy';
import { correctUsageRows,loadUsageCorrections } from './applicationUsageCorrections';
import { applicationStatisticsSource,applicationPublicationDirtyStatements } from './applicationStatistics';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { mapApplicationUsageClock, APPLICATION_CLOCK_MARGIN_MS } from './applicationUsageClock';
import { applicationAccountAlgorithm } from './applicationAccounts';

interface Candidate {id:string;machine_id:string;local_user_id:string;assignment_version:number;
  account_id:string;child_id:string;date:string;revision:number;manifest_json:string}
interface Span {start:number;end:number;lane:string;category:string;subject:string;name:string}
const DAY=86400000,HOUR=3600000;
function fail(code:string):never{throw new HttpError(409,code,code);}
function union(spans:Span[],start:number,end:number) {
  const groups=new Map<string,Array<[number,number]>>();
  for(const s of spans){const left=Math.max(s.start,start),right=Math.min(s.end,end);if(right<=left)continue;
    const key='all',ranges=groups.get(key)??[];ranges.push([left,right]);groups.set(key,ranges);}
  let total=0;
  for(const ranges of groups.values()){let cursor=start;
    for(const [left,right] of ranges.sort((a,b)=>a[0]-b[0])){total+=Math.max(0,right-Math.max(left,cursor));cursor=Math.max(cursor,right);}}
  return total;
}
function safeName(name:string){
  const value=name.trim()&&!/[\\/]/.test(name)?name:'未命名应用';
  // Same UTF-16/control-character normalization as Native's wire adapter.
  return value.replace(/[\p{Cc}@\\/]/gu,'').slice(0,128)||'未命名应用';
}
function project(spans:Span[],start:number):UsageAccountRow[] {
  const rows:UsageAccountRow[]=[];
  const add=(kind:UsageAccountRow['kind'],category:string|null,subjectKey:string|null,displayName:string|null,selected:Span[])=>{
    const make=(hour:number|null,left:number,right:number)=>{
      const duration=union(selected,left,right);
      if(hour==null||kind==='total'||duration>0)rows.push({kind,category,subjectKey,displayName,hour,duration});
    };
    make(null,start,start+DAY);for(let hour=0;hour<24;hour++)make(hour,start+hour*HOUR,start+(hour+1)*HOUR);
  };
  add('total',null,null,null,spans);
  for(const category of new Set(spans.map(s=>s.category)))add('category',category,null,null,spans.filter(s=>s.category===category));
  for(const subject of new Set(spans.map(s=>s.subject))){const selected=spans.filter(s=>s.subject===subject);
    const name=selected.sort((a,b)=>b.end-a.end)[0]!.name;add('subject',null,subject,name,selected);}
  return rows.sort((a,b)=>canonicalUsageAccountJson(a)<canonicalUsageAccountJson(b)?-1:canonicalUsageAccountJson(a)>canonicalUsageAccountJson(b)?1:0);
}
/** Bounded, fixed-date verification oracle; NEVER used on the ordinary statistics GET. */
export async function verifyApplicationAccountPublication(db:D1Database,candidate:Candidate,manifest:UsageAccountManifest) {
  if(!manifest.complete){
    // Old producers conflated a product-recognition gap with usage completeness.
    // Diagnose the cause, but never promote an immutable incomplete receipt.
    if(manifest.reasonCodes.length===1&&manifest.reasonCodes[0]==='PRODUCT_IDENTITY_UNRESOLVED')
      fail('APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING');
    fail('APPLICATION_ACCOUNT_INCOMPLETE');
  }
  const start=usageAccountDayStart(manifest.date),end=start+DAY;
  const assignment=await db.prepare(`SELECT a.child_id,m.account_id,m.platform,m.revoked_at_ms FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id WHERE a.machine_id=?1 AND a.local_user_id=?2
      AND a.assignment_version=?3 AND a.protected=1`).bind(candidate.machine_id,candidate.local_user_id,candidate.assignment_version)
    .first<{child_id:string;account_id:string;platform:string;revoked_at_ms:number|null}>();
  if(!assignment||assignment.child_id!==candidate.child_id||assignment.account_id!==candidate.account_id||assignment.revoked_at_ms!=null)
    fail('APPLICATION_ACCOUNT_ASSIGNMENT_UNAVAILABLE');
  const expectedAlgorithm=applicationAccountAlgorithm(assignment.platform);
  if(expectedAlgorithm===null||manifest.algorithmVersion!==expectedAlgorithm)fail('APPLICATION_ACCOUNT_ALGORITHM_UNSUPPORTED');
  const filters={machineId:candidate.machine_id,localUserId:candidate.local_user_id};
  const before=await applicationStatisticsSource(db,candidate.account_id,candidate.child_id,start,end,filters);
  const policy=await getAppPolicy(db,candidate.account_id,candidate.child_id);
  if((policy.productIdentityProjection?.version??null)!==manifest.associationVersion)fail('APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING');
  const corrections=await loadUsageCorrections(db,candidate.account_id,candidate.child_id,start,end);
  if(Math.max(0,...corrections.map(c=>c.version))!==manifest.correctionVersion)fail('APPLICATION_ACCOUNT_CORRECTIONS_PENDING');
  const source=await db.prepare(`SELECT s.id,s.assignment_version,s.runtime_session_id,COALESCE(s.clock_epoch_id,'legacy-v2') AS clock_epoch_id,
    s.platform,s.runtime_identity,s.display_name,s.app_policy_version,s.application_classification AS classification,
    s.accounting_schema_version,s.start_wall_time_ms,s.end_wall_time_ms,s.start_monotonic_time_ms,s.end_monotonic_time_ms,
    s.monotonic_duration_ms
    FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
    WHERE m.account_id=?1 AND s.child_id=?2 AND s.machine_id=?3 AND s.local_user_id=?4 AND s.assignment_version=?5
      AND s.diagnostic=0 AND s.monotonic_duration_ms>0
      AND min(s.start_wall_time_ms,s.end_wall_time_ms)<?7 AND max(s.start_wall_time_ms,s.end_wall_time_ms)>?6
    ORDER BY s.id LIMIT 10001`).bind(candidate.account_id,candidate.child_id,candidate.machine_id,candidate.local_user_id,
      candidate.assignment_version,start-APPLICATION_CLOCK_MARGIN_MS,end+APPLICATION_CLOCK_MARGIN_MS).all<Record<string,unknown>>();
  if(source.results.length>10000)fail('APPLICATION_ACCOUNT_SOURCE_LIMIT');
  const mapped=await mapApplicationUsageClock(db,candidate.machine_id,candidate.local_user_id,source.results);
  // A live-day snapshot was frozen before later segments settled. Never clip a
  // later segment into that earlier snapshot or compare its count to the live day.
  // Closed-day snapshots retain the existing expanded day-boundary source window.
  const frozen=manifest.settledThroughMs!<end
    ?mapped.filter(row=>Number(row.end_wall_time_ms)<=manifest.settledThroughMs!):mapped;
  if(frozen.length!==manifest.rawFactCount)fail('APPLICATION_ACCOUNT_FACTS_PENDING');
  // 不把 rawFactHash 当服务端字节证明；源 shape、政策及每个维度均精确对照。
  const versions=new Set<number>();
  for(const row of frozen){
    if(Number(row.accounting_schema_version)!==2||row.app_policy_version==null)fail('APPLICATION_ACCOUNT_POLICY_HISTORY_MISSING');
    versions.add(Number(row.app_policy_version));
  }
  if(canonicalUsageAccountJson([...versions].sort((a,b)=>a-b))!==canonicalUsageAccountJson(manifest.policyVersions))
    fail('APPLICATION_ACCOUNT_POLICY_SET_MISMATCH');
  const projected=new Map(policy.productIdentityProjection?.items.map(p=>[`${p.platform}\n${p.runtimeIdentity}`,p])??[]);
  const spans:Span[]=[];
  const normalized=frozen.filter(row=>Number(row.start_wall_time_ms)<end&&Number(row.end_wall_time_ms)>start)
    .map(row=>({...row,start_wall_time_ms:Math.max(start,Number(row.start_wall_time_ms)),
      end_wall_time_ms:Math.min(end,Number(row.end_wall_time_ms))}));
  if(normalized.some(row=>Number(row.end_wall_time_ms)>manifest.settledThroughMs!))fail('APPLICATION_ACCOUNT_CUTOFF_MISMATCH');
  for(const row of correctUsageRows(normalized,corrections,start,end)){
    const identity=`${row.platform}\n${row.runtime_identity}`,product=projected.get(identity);
    if(!product||product.status==='conflict')fail('APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING');
    // Exact standalone identity is not an approved product association. Keep its
    // own key and classification; never guess aliases or merge by display name.
    if(product.status==='unresolved'&&(product.productId!==null||product.associationKey!==identity))
      fail('APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING');
    spans.push({start:Number(row.start_wall_time_ms),end:Number(row.end_wall_time_ms),
      lane:`${row.runtime_session_id}\n${row.clock_epoch_id}`,category:String(row.classification??'historicalUnknown'),
      subject:await sha256Hex(product.associationKey),name:safeName(product.canonicalName||String(row.display_name??'未命名应用'))});
  }
  const rows=project(spans,start);
  if(rows.length!==manifest.rowCount||await hashUsageAccountValue(rows)!==manifest.rowsHash)fail('APPLICATION_ACCOUNT_STATISTICS_MISMATCH');
  if((await applicationStatisticsSource(db,candidate.account_id,candidate.child_id,start,end,filters)).revision!==before.revision)
    fail('APPLICATION_ACCOUNT_SOURCE_CHANGED');
  // Do not advertise an earlier frozen subset as covering the current full day.
  // The existing reader's exact source watermark/count guards remain fail-closed.
  const sourceRevision=frozen.length===mapped.length?before.revision:await sha256Hex(canonicalUsageAccountJson({
    sourceRevision:before.revision,settledThroughMs:manifest.settledThroughMs,rowsHash:manifest.rowsHash,coverage:'frozen-subset',
  }));
  return {sourceRevision,rows};
}
/** Receipt is immutable; publication has a separate monotonic head and retry diagnosis. */
export async function publishApplicationAccounts(db:D1Database,now=Date.now(),manifestId?:string) {
  const candidates=await db.prepare(`SELECT m.* FROM runtime_application_account_manifests_v1 m
    JOIN runtime_application_account_receipts_v1 r ON r.manifest_id=m.id
    LEFT JOIN runtime_application_account_publications_v1 p ON p.machine_id=m.machine_id AND p.local_user_id=m.local_user_id
      AND p.assignment_version=m.assignment_version AND p.date=m.date
    LEFT JOIN runtime_application_account_publication_checks_v1 c ON c.manifest_id=m.id
    WHERE m.state='received' AND (p.manifest_id IS NULL OR p.revision<m.revision)
      AND (c.checked_at_ms IS NULL OR c.checked_at_ms<=?1) AND (?2 IS NULL OR m.id=?2)
    ORDER BY
      CASE WHEN json_extract(m.manifest_json,'$.complete')=1 THEN 0 ELSE 1 END,
      CASE WHEN json_extract(m.manifest_json,'$.associationVersion')=(
        SELECT json_extract(v.payload_json,'$.productIdentityProjection.version')
        FROM runtime_child_app_policy_versions_v1 v
        WHERE v.account_id=m.account_id AND v.child_id=m.child_id ORDER BY v.version DESC LIMIT 1
      ) THEN 0 ELSE 1 END,
      COALESCE(c.checked_at_ms,0),m.received_at_ms,m.id LIMIT 2`).bind(now-300000,manifestId??null).all<Candidate>();
  let published=0;
  for(const candidate of candidates.results){
    let revision='unverified',errorCode:string|null=null;
    try{
      // A normal immutable policy refresh; never mutate or promote an old receipt.
      await refreshHistoricalProductIdentityProjection(db,candidate.account_id,candidate.child_id,now);
      const manifest=await verifyUsageAccountManifest(JSON.parse(candidate.manifest_json));
      const verified=await verifyApplicationAccountPublication(db,candidate,manifest);revision=verified.sourceRevision;
      const result=await db.batch([
        db.prepare(`INSERT INTO runtime_application_account_publications_v1
          (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_id,source_revision,published_at_ms)
          SELECT machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,id,?2,?3
          FROM runtime_application_account_manifests_v1 WHERE id=?1 AND EXISTS
            (SELECT 1 FROM runtime_application_account_receipts_v1 WHERE manifest_id=?1)
          ON CONFLICT(machine_id,local_user_id,assignment_version,date) DO UPDATE
            SET revision=excluded.revision,manifest_id=excluded.manifest_id,source_revision=excluded.source_revision,published_at_ms=excluded.published_at_ms
          WHERE excluded.revision>runtime_application_account_publications_v1.revision`).bind(candidate.id,revision,now),
        db.prepare(`INSERT INTO runtime_application_account_publication_checks_v1(manifest_id,checked_at_ms,error_code,source_revision)
          VALUES(?1,?2,NULL,?3) ON CONFLICT(manifest_id) DO UPDATE SET checked_at_ms=excluded.checked_at_ms,
            error_code=NULL,source_revision=excluded.source_revision`).bind(candidate.id,now,revision),
        ...await applicationPublicationDirtyStatements(db,candidate,now),
      ]);published+=Number(result[0]?.meta.changes??0)>0?1:0;
    }catch(error){errorCode=error instanceof HttpError?error.code:'APPLICATION_ACCOUNT_PUBLICATION_FAILED';
      await db.prepare(`INSERT INTO runtime_application_account_publication_checks_v1(manifest_id,checked_at_ms,error_code,source_revision)
        VALUES(?1,?2,?3,?4) ON CONFLICT(manifest_id) DO UPDATE SET checked_at_ms=excluded.checked_at_ms,
          error_code=excluded.error_code,source_revision=excluded.source_revision`).bind(candidate.id,now,errorCode,revision).run();
    }
  }
  return {processed:candidates.results.length,published};
}
