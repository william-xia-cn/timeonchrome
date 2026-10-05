import { hashUsageAccountValue, canonicalUsageAccountJson, verifyUsageAccountManifest,usageAccountDayStart,
  parseUsageAccountRows,parseApplicationAccountRows,verifyApplicationAccountManifest,validateUsageAccountDimensions,validateUsageAccountDimensionsV2,UsageAccountError,
  type UsageAccountManifest,type UsageAccountRow } from '@timeonchrome/app-runtime-contracts/usage-account';
import { getAppPolicy } from './appPolicy';
import { applyCurrentWeekClassification,correctUsageRows,loadUsageCorrections } from './applicationUsageCorrections';
import { applicationStatisticsSource,applicationPublicationDirtyStatements } from './applicationStatistics';
import { sha256Hex } from './crypto';
import { HttpError } from './http';
import { mapApplicationUsageClock, APPLICATION_CLOCK_MARGIN_MS } from './applicationUsageClock';
import { applicationAccountAlgorithm } from './applicationAccounts';
import { isConfirmedSpecialApplication } from './specialApplications';

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
export async function verifyApplicationAccountPublication(db:D1Database,candidate:Candidate,manifest:UsageAccountManifest,now=Date.now()) {
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
  // policyVersions仅兼容诊断；事实schema和统计维度仍必须精确核对。
  for(const row of frozen){
    if(Number(row.accounting_schema_version)!==2)fail('APPLICATION_ACCOUNT_SCHEMA_UNSUPPORTED');
  }
  const projected=new Map(policy.productIdentityProjection?.items.map(p=>[`${p.platform}\n${p.runtimeIdentity}`,p])??[]);
  const specialSubjects=new Set<string>();
  const spans:Span[]=[];
  const normalized=frozen.filter(row=>Number(row.start_wall_time_ms)<end&&Number(row.end_wall_time_ms)>start)
    .map(row=>({...row,start_wall_time_ms:Math.max(start,Number(row.start_wall_time_ms)),
      end_wall_time_ms:Math.min(end,Number(row.end_wall_time_ms))}));
  if(normalized.some(row=>Number(row.end_wall_time_ms)>manifest.settledThroughMs!))fail('APPLICATION_ACCOUNT_CUTOFF_MISMATCH');
  for(const row of applyCurrentWeekClassification(correctUsageRows(normalized,corrections,start,end),policy,now)){
    const identity=`${row.platform}\n${row.runtime_identity}`,product=projected.get(identity);
    if(!product||product.status==='conflict')fail('APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING');
    // Exact standalone identity is not an approved product association. Keep its
    // own key and classification; never guess aliases or merge by display name.
    if(product.status==='unresolved'&&(product.productId!==null||product.associationKey!==identity))
      fail('APPLICATION_ACCOUNT_ASSOCIATIONS_PENDING');
    const subject=await sha256Hex(product.associationKey);
    if(isConfirmedSpecialApplication(product,policy.applicationKnowledge))specialSubjects.add(subject);
    spans.push({start:Number(row.start_wall_time_ms),end:Number(row.end_wall_time_ms),
      lane:`${row.runtime_session_id}\n${row.clock_epoch_id}`,category:String(row.classification??'historicalUnknown'),
      subject,name:safeName(product.canonicalName||String(row.display_name??'未命名应用'))});
  }
  const rows=project(spans,start);
  if(rows.length!==manifest.rowCount||await hashUsageAccountValue(rows)!==manifest.rowsHash)fail('APPLICATION_ACCOUNT_STATISTICS_MISMATCH');
  if(manifest.applicationUsage) {
    const ordinary=spans.filter(span=>!specialSubjects.has(span.subject));
    const categories=Object.fromEntries([...new Set(ordinary.map(span=>span.category))].sort()
      .map(category=>[category,union(ordinary.filter(span=>span.category===category),start,end)]));
    const known=new Set(['study','composite','unclassified','restrictedEntertainment','other','blocked']);
    const complete=ordinary.every(span=>known.has(span.category));
    const expected={nonSpecialTotalMs:union(ordinary,start,end),nonSpecialCategoryMs:categories,
      specialTotalMs:union(spans.filter(span=>specialSubjects.has(span.subject)),start,end),
      complete,reasonCodes:complete?[]:['APPLICATION_CLASSIFICATION_UNKNOWN']};
    if(canonicalUsageAccountJson(expected)!==canonicalUsageAccountJson(manifest.applicationUsage))
      fail('APPLICATION_ACCOUNT_USAGE_PROJECTION_MISMATCH');
  }
  if((await applicationStatisticsSource(db,candidate.account_id,candidate.child_id,start,end,filters)).revision!==before.revision)
    fail('APPLICATION_ACCOUNT_SOURCE_CHANGED');
  // Do not advertise an earlier frozen subset as covering the current full day.
  // The existing reader's exact source watermark/count guards remain fail-closed.
  const sourceRevision=frozen.length===mapped.length?before.revision:await sha256Hex(canonicalUsageAccountJson({
    sourceRevision:before.revision,settledThroughMs:manifest.settledThroughMs,rowsHash:manifest.rowsHash,coverage:'frozen-subset',
  }));
  const subjectClassifications:Record<string,string[]>={};
  for(const span of spans)subjectClassifications[span.subject]=[...new Set([...(subjectClassifications[span.subject]??[]),span.category])].sort();
  return {sourceRevision,rows,subjectClassifications};
}
/** Validate the authenticated producer's snapshot, not a second cloud calculation. */
export async function validateApplicationAccountSnapshot(db:D1Database,candidate:Candidate) {
  const manifest=await verifyApplicationAccountManifest(JSON.parse(candidate.manifest_json));
  if(!manifest.complete)fail('APPLICATION_ACCOUNT_INCOMPLETE');
  if(manifest.schemaVersion===2&&manifest.childId!==undefined&&manifest.childId!==candidate.child_id)
    fail('APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH');
  const assignment=await db.prepare(`SELECT a.child_id,m.account_id,m.platform,m.revoked_at_ms FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id WHERE a.machine_id=?1 AND a.local_user_id=?2
      AND a.assignment_version=?3 AND a.protected=1`).bind(candidate.machine_id,candidate.local_user_id,candidate.assignment_version)
    .first<{child_id:string;account_id:string;platform:string;revoked_at_ms:number|null}>();
  if(!assignment||assignment.child_id!==candidate.child_id||assignment.account_id!==candidate.account_id||assignment.revoked_at_ms!=null)
    fail('APPLICATION_ACCOUNT_ASSIGNMENT_UNAVAILABLE');
  if(manifest.algorithmVersion!==applicationAccountAlgorithm(assignment.platform,manifest.schemaVersion))fail('APPLICATION_ACCOUNT_ALGORITHM_UNSUPPORTED');
  if(manifest.date!==candidate.date||manifest.revision!==candidate.revision||manifest.sourceKind!=='application')
    fail('APPLICATION_ACCOUNT_INVALID_SOURCE');
  const chunks=await db.prepare(`SELECT chunk_index,chunk_hash,rows_json FROM runtime_application_account_chunks_v1
    WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(candidate.id)
    .all<{chunk_index:number;chunk_hash:string;rows_json:string}>();
  if(chunks.results.length!==manifest.chunkCount||chunks.results.some((chunk,index)=>chunk.chunk_index!==index))
    fail('APPLICATION_ACCOUNT_CHUNKS_MISSING');
  const rows:UsageAccountRow[]=[];
  for(const chunk of chunks.results){
    const chunkRows=parseApplicationAccountRows(JSON.parse(chunk.rows_json),manifest.schemaVersion,100);
    if(chunkRows.length!==Math.min(100,manifest.rowCount-chunk.chunk_index*100)
      ||await hashUsageAccountValue(chunkRows)!==chunk.chunk_hash)fail('APPLICATION_ACCOUNT_CHUNK_HASH_MISMATCH');
    rows.push(...chunkRows);
  }
  parseApplicationAccountRows(rows,manifest.schemaVersion);
  if(rows.length!==manifest.rowCount||await hashUsageAccountValue(rows)!==manifest.rowsHash)
    fail('APPLICATION_ACCOUNT_ROWS_HASH_MISMATCH');
  const {total}=manifest.schemaVersion===2?validateUsageAccountDimensionsV2(rows):validateUsageAccountDimensions(rows);
  const categories=new Set(['study','composite','restrictedEntertainment','unclassified','other','blocked','historicalUnknown']);
  const divisor=manifest.durationUnit==='seconds'?1000:1;
  if(rows.some(row=>row.duration>(row.hour===null?DAY:HOUR)/divisor
    ||row.kind==='category'&&!categories.has(row.category!)))fail('APPLICATION_ACCOUNT_INVALID_STATISTICS');
  if(manifest.applicationUsage){
    const usage=manifest.applicationUsage;
    const nonSpecialTotal='nonSpecialTotalMs' in usage?usage.nonSpecialTotalMs:usage.nonSpecialTotal;
    const specialTotal='specialTotalMs' in usage?usage.specialTotalMs:usage.specialTotal;
    const nonSpecialCategories='nonSpecialCategoryMs' in usage?usage.nonSpecialCategoryMs:usage.nonSpecialCategories;
    // Structural bounds only. Overlapping category/product details are not added.
    if(nonSpecialTotal>total||specialTotal>total
      ||Object.entries(nonSpecialCategories).some(([category,duration])=>!categories.has(category)
        ||duration>(rows.find(row=>row.kind==='category'&&row.hour===null&&row.category===category)?.duration??0)))
      fail('APPLICATION_ACCOUNT_INVALID_USAGE_PROJECTION');
  }
  return {manifest,rows,sourceRevision:`application-statistics:${manifest.revision}:${manifest.manifestHash}`};
}
/** Receipt is immutable; complete producer snapshots replace a monotonic readable head. */
export async function publishApplicationAccounts(db:D1Database,now=Date.now(),manifestId?:string) {
  const candidates=await db.prepare(`SELECT m.* FROM runtime_application_account_manifests_v1 m
    JOIN runtime_application_account_receipts_v1 r ON r.manifest_id=m.id
    LEFT JOIN runtime_application_account_publications_v1 p ON p.machine_id=m.machine_id AND p.local_user_id=m.local_user_id
      AND p.assignment_version=m.assignment_version AND p.date=m.date
    LEFT JOIN runtime_application_account_publication_checks_v1 c ON c.manifest_id=m.id
    WHERE m.state='received' AND (p.manifest_id IS NULL OR p.revision<m.revision)
      AND (?2 IS NOT NULL OR c.checked_at_ms IS NULL OR c.checked_at_ms<=?1) AND (?2 IS NULL OR m.id=?2)
    ORDER BY
      CASE WHEN json_extract(m.manifest_json,'$.complete')=1 THEN 0 ELSE 1 END,
      COALESCE(c.checked_at_ms,0),m.received_at_ms,m.id LIMIT 2`).bind(now-300000,manifestId??null).all<Candidate>();
  let published=0;
  for(const candidate of candidates.results){
    let revision='unverified',errorCode:string|null=null;
    try{
      const validated=await validateApplicationAccountSnapshot(db,candidate);revision=validated.sourceRevision;
      const result=await db.batch([
        db.prepare(`INSERT INTO runtime_application_account_publications_v1
          (machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,manifest_id,source_revision,published_at_ms)
          SELECT machine_id,local_user_id,assignment_version,account_id,child_id,date,revision,id,?2,?3
          FROM runtime_application_account_manifests_v1 WHERE id=?1 AND EXISTS
            (SELECT 1 FROM runtime_application_account_receipts_v1 WHERE manifest_id=?1)
            AND EXISTS (SELECT 1 FROM runtime_user_assignments_v2 a JOIN runtime_machines_v2 machine ON machine.id=a.machine_id
              WHERE a.machine_id=runtime_application_account_manifests_v1.machine_id
                AND a.local_user_id=runtime_application_account_manifests_v1.local_user_id
                AND a.assignment_version=runtime_application_account_manifests_v1.assignment_version
                AND a.child_id=runtime_application_account_manifests_v1.child_id AND a.protected=1
                AND machine.account_id=runtime_application_account_manifests_v1.account_id AND machine.revoked_at_ms IS NULL)
          ON CONFLICT(machine_id,local_user_id,assignment_version,date) DO UPDATE
            SET revision=excluded.revision,manifest_id=excluded.manifest_id,source_revision=excluded.source_revision,published_at_ms=excluded.published_at_ms
          WHERE excluded.revision>runtime_application_account_publications_v1.revision`).bind(candidate.id,revision,now),
        db.prepare(`INSERT INTO runtime_application_account_publication_checks_v1(manifest_id,checked_at_ms,error_code,source_revision)
          VALUES(?1,?2,NULL,?3) ON CONFLICT(manifest_id) DO UPDATE SET checked_at_ms=excluded.checked_at_ms,
            error_code=NULL,source_revision=excluded.source_revision`).bind(candidate.id,now,revision),
        ...await applicationPublicationDirtyStatements(db,candidate,now),
      ]);
      if(Number(result[0]?.meta.changes??0)>0)published++;
      else {
        const head=await db.prepare(`SELECT revision FROM runtime_application_account_publications_v1
          WHERE machine_id=?1 AND local_user_id=?2 AND assignment_version=?3 AND date=?4`)
          .bind(candidate.machine_id,candidate.local_user_id,candidate.assignment_version,candidate.date).first<{revision:number}>();
        if(!head||head.revision<candidate.revision)fail('APPLICATION_ACCOUNT_ASSIGNMENT_UNAVAILABLE');
      }
    }catch(error){errorCode=error instanceof HttpError||error instanceof UsageAccountError?error.code:'APPLICATION_ACCOUNT_PUBLICATION_FAILED';
      await db.prepare(`INSERT INTO runtime_application_account_publication_checks_v1(manifest_id,checked_at_ms,error_code,source_revision)
        VALUES(?1,?2,?3,?4) ON CONFLICT(manifest_id) DO UPDATE SET checked_at_ms=excluded.checked_at_ms,
          error_code=excluded.error_code,source_revision=excluded.source_revision`).bind(candidate.id,now,errorCode,revision).run();
    }
  }
  return {processed:candidates.results.length,published};
}
