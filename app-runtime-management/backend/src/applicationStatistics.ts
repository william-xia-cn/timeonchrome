import { getAppPolicy, queryAppUsage } from './appPolicy';
import { hashUsageAccountValue } from '@timeonchrome/app-runtime-contracts/usage-account';
import type { ApplicationClassification, RuntimePlatform } from './contracts';
import { HttpError } from './http';
import { selectNativeApplicationStatistics } from './applicationStatisticsNative';
import type { UsageAccountRow } from '@timeonchrome/app-runtime-contracts/usage-account';

const DAY = 86400000, OFFSET = 8 * 3600000, ROW_LIMIT = 10000;
type Filters = Parameters<typeof queryAppUsage>[5];
type Quota = {limitMs:number|null;remainingMs:number|null;exceeded:boolean;exceededDays?:number};
interface AppRow {platform:RuntimePlatform;runtimeIdentity:string;displayName:string|null;
  classification:ApplicationClassification;classifications:ApplicationClassification[];durationMs:number;quota:Quota}
export interface StatisticsValue {
  totalDurationMs:number;
  categories:Array<{classification:ApplicationClassification;durationMs:number;quota:Quota}>;
  buckets:Array<{startAtMs:number;durationMs:number;categories:Array<{classification:ApplicationClassification;durationMs:number}>}>;
  applications:AppRow[];
  weeklyRestrictedEntertainment:{durationMs:number;quota:Quota};
  estimatedSegmentCount:number;appPolicyVersion:number;
  outsideTimeWindows:{durationMs:number;segmentCount:number;applications:Array<Omit<AppRow,'classification'|'classifications'|'quota'>>};
  mediaPlaybackTotalMs:number;
  nativeRows?:UsageAccountRow[];
  nativeSettledThroughMs?:number|null;
  nativeSubjectClassifications?:Record<string,string[]>;
  legacyQuotaCategoryDurations?:Record<string,number>;
  legacyComparison?:{totalDurationMs:number;nativeDeltaMs:number};
  materialization?:{estimatedFactKeys:string[];outsideFactKeys:string[];applicationLastEnds:Record<string,number>};
}
interface Scope {
  scope_key:string;account_id:string;child_id:string;date:string;filters_json:string;
  from_ms:number;to_ms:number;source_revision:string;
}
interface PublishedDay extends Scope {value_json:string;computed_at_ms:number;producer:'legacy-server'|'native'}
const midnight=(time:number)=>Math.floor((time+OFFSET)/DAY)*DAY-OFFSET;
const date=(time:number)=>new Date(time+OFFSET).toISOString().slice(0,10);
const key=(app:{platform:string;runtimeIdentity:string})=>`${app.platform}\n${app.runtimeIdentity}`;

/** Bounded source watermark; never loads raw payloads into an ordinary GET. */
function sourceStatements(db:D1Database,account:string,child:string,from:number,to:number,filters:Filters) {
  const values:unknown[]=[account,child,from,to];let suffix='';
  for(const [field,column] of [['machineId','machine_id'],['localUserId','local_user_id'],['platform','platform']] as const)
    if(filters[field]){values.push(filters[field]);suffix+=` AND s.${column}=?${values.length}`;}
  const query=(table:string,condition:string)=>db.prepare(`SELECT COUNT(*) AS n,MAX(s.uploaded_at_ms) AS latest FROM ${table} s
    JOIN runtime_machines_v2 m ON m.id=s.machine_id WHERE m.account_id=?1 AND s.child_id=?2 AND ${condition}${suffix}`).bind(...values);
  return [
    query('runtime_usage_segments_v2','s.diagnostic=0 AND min(COALESCE(s.start_wall_time_ms,s.start_at_ms),COALESCE(s.end_wall_time_ms,s.end_at_ms))<?4+2000 AND max(COALESCE(s.end_wall_time_ms,s.end_at_ms),COALESCE(s.start_wall_time_ms,s.start_at_ms))>?3-2000'),
    query('runtime_media_segments_v2','s.start_wall_time_ms<?4 AND s.end_wall_time_ms>?3'),
    db.prepare(`SELECT MAX(version) AS version FROM runtime_child_app_policy_versions_v1 WHERE account_id=?1 AND child_id=?2`).bind(account,child),
    db.prepare(`SELECT COUNT(*) AS n,MAX(s.uploaded_at_ms) AS latest FROM runtime_usage_segments s
      JOIN runtime_devices d ON d.id=s.device_id WHERE d.account_id=?1 AND d.child_id=?2
      AND s.start_at_ms<?4 AND s.end_at_ms>?3 AND ?5 IS NULL AND ?6 IS NULL AND (?7 IS NULL OR s.platform=?7)`)
      .bind(account,child,from,to,filters.machineId??null,filters.localUserId??null,filters.platform??null),
    // Only the stable anchors of this day's lanes: new activity on unrelated
    // days must not invalidate every historical publication.
    db.prepare(`WITH lanes AS (SELECT DISTINCT s.machine_id,s.local_user_id,s.runtime_session_id,s.clock_epoch_id
      FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
      WHERE m.account_id=?1 AND s.child_id=?2 AND s.diagnostic=0 AND s.monotonic_duration_ms>0
        AND s.start_wall_time_ms<?4+2000 AND s.end_wall_time_ms>?3-2000
        AND (?5 IS NULL OR s.machine_id=?5) AND (?6 IS NULL OR s.local_user_id=?6) AND (?7 IS NULL OR s.platform=?7)
      ORDER BY s.machine_id,s.local_user_id,s.runtime_session_id,s.clock_epoch_id LIMIT 257)
      , owners AS (SELECT DISTINCT machine_id,local_user_id FROM lanes)
      , eligible AS MATERIALIZED (SELECT anchor.machine_id,anchor.local_user_id,anchor.runtime_session_id,
          anchor.clock_epoch_id,anchor.id,anchor.start_monotonic_time_ms
        FROM owners o JOIN runtime_usage_segments_v2 anchor ON anchor.machine_id=o.machine_id AND anchor.local_user_id=o.local_user_id
        WHERE anchor.diagnostic=0 AND anchor.monotonic_duration_ms>0 AND anchor.end_wall_time_ms>=anchor.start_wall_time_ms
          AND anchor.end_monotonic_time_ms-anchor.start_monotonic_time_ms=anchor.monotonic_duration_ms
          AND abs(anchor.end_wall_time_ms-anchor.start_wall_time_ms-anchor.monotonic_duration_ms)<=2000)
      , anchors AS MATERIALIZED (SELECT l.*,(SELECT anchor.id
        FROM eligible anchor WHERE anchor.machine_id=l.machine_id AND anchor.local_user_id=l.local_user_id
          AND anchor.runtime_session_id=l.runtime_session_id AND anchor.clock_epoch_id=l.clock_epoch_id
        ORDER BY anchor.start_monotonic_time_ms,anchor.id LIMIT 1) AS anchor_id FROM lanes l)
      SELECT a.id,a.start_wall_time_ms,a.start_monotonic_time_ms,a.uploaded_at_ms FROM anchors l
      LEFT JOIN runtime_usage_segments_v2 a ON a.machine_id=l.machine_id AND a.local_user_id=l.local_user_id AND a.id=l.anchor_id
      ORDER BY l.machine_id,l.local_user_id,l.runtime_session_id,l.clock_epoch_id`)
      .bind(account,child,from,to,filters.machineId??null,filters.localUserId??null,filters.platform??null),
    db.prepare(`SELECT p.machine_id,p.local_user_id,p.assignment_version,p.revision,p.manifest_id
    FROM runtime_application_account_publications_v1 p JOIN runtime_machines_v2 m ON m.id=p.machine_id
    WHERE p.account_id=?1 AND p.child_id=?2 AND p.date=?3 AND (?4 IS NULL OR p.machine_id=?4)
      AND (?5 IS NULL OR p.local_user_id=?5) AND (?6 IS NULL OR m.platform=?6)
    ORDER BY p.machine_id,p.local_user_id,p.assignment_version LIMIT 101`)
    .bind(account,child,date(from),filters.machineId??null,filters.localUserId??null,filters.platform??null),
  ];
}
/** Same six source queries and hash order, bounded to seven dates per D1 round trip. */
async function sourceRanges(db:D1Database,account:string,child:string,ranges:Array<{from:number;to:number}>,filters:Filters) {
  const results:D1Result[]=[];
  for(let offset=0;offset<ranges.length;offset+=7){
    const statements=ranges.slice(offset,offset+7).flatMap(r=>sourceStatements(db,account,child,r.from,r.to,filters));
    results.push(...await db.batch(statements));
  }
  return Promise.all(ranges.map(async(_,index)=>{
    const heads=results.slice(index*6,index*6+5),publications=results[index*6+5]!;
    return {revision:await hashUsageAccountValue({model:'application-statistics-day-v3-current-week-classification',heads:heads.map(r=>r.results)}),
      rawRows:heads.reduce((sum,result)=>sum+Number((result.results[0] as {n?:number})?.n??0),0),
      publicationRevision:await hashUsageAccountValue(publications.results)};
  }));
}
export async function applicationStatisticsSource(db:D1Database,account:string,child:string,from:number,to:number,filters:Filters) {
  return (await sourceRanges(db,account,child,[{from,to}],filters))[0]!;
}
async function scope(account:string,child:string,from:number,to:number,filters:Filters,
    source:Awaited<ReturnType<typeof applicationStatisticsSource>>):Promise<Scope> {
  const normalized={machineId:filters.machineId??null,localUserId:filters.localUserId??null,platform:filters.platform??null};
  return {scope_key:await hashUsageAccountValue([account,child,normalized,from-midnight(from),to-midnight(from)]),
    account_id:account,child_id:child,date:date(from),filters_json:JSON.stringify(filters),from_ms:from,to_ms:to,
    source_revision:await hashUsageAccountValue([source.revision,source.publicationRevision])};
}
function enqueueStatement(db:D1Database,s:Scope,now:number) {
  return db.prepare(`INSERT INTO runtime_application_statistics_queue_v1
    (scope_key,account_id,child_id,date,filters_json,from_ms,to_ms,source_revision,requested_at_ms)
    VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9) ON CONFLICT(scope_key,date) DO UPDATE
    SET source_revision=excluded.source_revision,requested_at_ms=excluded.requested_at_ms,
      attempts=0,retry_at_ms=0,error_code=NULL
    WHERE excluded.source_revision<>runtime_application_statistics_queue_v1.source_revision`)
    .bind(s.scope_key,s.account_id,s.child_id,s.date,s.filters_json,s.from_ms,s.to_ms,s.source_revision,now);
}
/** Included in the publication transaction: default Child day plus existing affected scopes. */
export async function applicationPublicationDirtyStatements(db:D1Database,candidate:{id:string;account_id:string;child_id:string;date:string;
  machine_id:string;local_user_id:string},now:number) {
  const from=Date.parse(`${candidate.date}T00:00:00+08:00`);
  const defaultScope=await hashUsageAccountValue([candidate.account_id,candidate.child_id,
    {machineId:null,localUserId:null,platform:null},0,DAY]);
  const update=`ON CONFLICT(scope_key,date) DO UPDATE SET source_revision=excluded.source_revision,
    requested_at_ms=excluded.requested_at_ms,attempts=0,retry_at_ms=0,error_code=NULL`;
  const current=`EXISTS (SELECT 1 FROM runtime_application_account_publications_v1 WHERE manifest_id=?1)`;
  return [db.prepare(`INSERT INTO runtime_application_statistics_queue_v1
    (scope_key,account_id,child_id,date,filters_json,from_ms,to_ms,source_revision,requested_at_ms)
    SELECT scope_key,account_id,child_id,date,filters_json,from_ms,to_ms,'publication:'||?1,?2
    FROM runtime_application_statistics_days_v1 WHERE account_id=?3 AND child_id=?4 AND date=?5 AND ${current}
      AND (json_extract(filters_json,'$.machineId') IS NULL OR json_extract(filters_json,'$.machineId')=?6)
      AND (json_extract(filters_json,'$.localUserId') IS NULL OR json_extract(filters_json,'$.localUserId')=?7)
      AND (json_extract(filters_json,'$.platform') IS NULL OR json_extract(filters_json,'$.platform')='windows') ${update}`)
      .bind(candidate.id,now,candidate.account_id,candidate.child_id,candidate.date,candidate.machine_id,candidate.local_user_id),
    db.prepare(`INSERT INTO runtime_application_statistics_queue_v1
      (scope_key,account_id,child_id,date,filters_json,from_ms,to_ms,source_revision,requested_at_ms)
      SELECT ?3,?4,?5,?6,'{}',?7,?8,'publication:'||?1,?2 WHERE ${current} ${update}`)
      .bind(candidate.id,now,defaultScope,candidate.account_id,candidate.child_id,candidate.date,from,from+DAY)];
}
/** At most two bounded day rebuilds; source changes never publish a mixed day. */
export async function rebuildApplicationStatistics(db:D1Database,now=Date.now(),scopeKey?:string) {
  const work=await db.prepare(`SELECT * FROM runtime_application_statistics_queue_v1 WHERE retry_at_ms<=?1
    AND (?2 IS NULL OR scope_key=?2) ORDER BY requested_at_ms,scope_key,date LIMIT 2`).bind(now,scopeKey??null).all<Scope>();
  let built=0;
  for(const s of work.results)try {
    const filters:Filters=JSON.parse(s.filters_json);
    const before=await applicationStatisticsSource(db,s.account_id,s.child_id,s.from_ms,s.to_ms,filters);
    if(before.rawRows>ROW_LIMIT)throw new HttpError(503,'APPLICATION_STATISTICS_ROW_LIMIT','该日期记录超过后台单批限制。');
    const value=await queryAppUsage(db,s.account_id,s.child_id,s.from_ms,s.to_ms,filters,{dayOnly:true}) as StatisticsValue;
    const nativeProjection=await selectNativeApplicationStatistics(db,s.account_id,s.child_id,s.from_ms,s.to_ms,filters,value,
      async(machineId,localUserId)=>(await applicationStatisticsSource(db,s.account_id,s.child_id,s.from_ms,s.to_ms,{machineId,localUserId})).revision,now);
    const native=nativeProjection?.rows;
    if(native){
      const total=native.find(r=>r.kind==='total'&&r.hour==null)!.duration;
      value.legacyComparison={totalDurationMs:value.totalDurationMs,nativeDeltaMs:total-value.totalDurationMs};
      value.legacyQuotaCategoryDurations=Object.fromEntries(value.categories.map(c=>[c.classification,c.durationMs]));
      value.nativeRows=native;
      value.nativeSettledThroughMs=nativeProjection!.settledThroughMs;
      value.nativeSubjectClassifications=nativeProjection!.subjectClassifications;
      value.totalDurationMs=total;
      const prior=new Map(value.categories.map(c=>[c.classification,c]));
      value.categories=native.filter(r=>r.kind==='category'&&r.hour==null).map(r=>({
        classification:r.category as ApplicationClassification,durationMs:r.duration,
        quota:prior.get(r.category as ApplicationClassification)?.quota??{limitMs:null,remainingMs:null,exceeded:false}}));
      value.buckets=Array.from({length:24},(_,hour)=>({startAtMs:s.from_ms+hour*3600000,
        durationMs:native.find(r=>r.kind==='total'&&r.hour===hour)!.duration,
        categories:native.filter(r=>r.kind==='category'&&r.hour===hour).map(r=>({
          classification:r.category as ApplicationClassification,durationMs:r.duration}))}));
    }
    const after=await applicationStatisticsSource(db,s.account_id,s.child_id,s.from_ms,s.to_ms,filters);
    if(before.revision!==after.revision||before.publicationRevision!==after.publicationRevision)
      throw new HttpError(409,'APPLICATION_STATISTICS_SOURCE_CHANGED','统计来源已变化。');
    const body=JSON.stringify(value);
    if(new TextEncoder().encode(body).byteLength>2_000_000)throw new HttpError(503,'APPLICATION_STATISTICS_SIZE_LIMIT','统计范围超过单批限制。');
    const result=await db.batch([
      db.prepare(`INSERT INTO runtime_application_statistics_days_v1
        (scope_key,account_id,child_id,date,filters_json,from_ms,to_ms,source_revision,producer,value_json,computed_at_ms)
        SELECT ?1,?2,?3,?4,?5,?6,?7,?8,?12,?9,?10 WHERE EXISTS
          (SELECT 1 FROM runtime_application_statistics_queue_v1 WHERE scope_key=?1 AND date=?4 AND source_revision=?11)
        ON CONFLICT(scope_key,date) DO UPDATE SET source_revision=excluded.source_revision,
          producer=excluded.producer,value_json=excluded.value_json,computed_at_ms=excluded.computed_at_ms`)
        .bind(s.scope_key,s.account_id,s.child_id,s.date,s.filters_json,s.from_ms,s.to_ms,
          await hashUsageAccountValue([after.revision,after.publicationRevision]),body,now,s.source_revision,native?'native':'legacy-server'),
      db.prepare(`DELETE FROM runtime_application_statistics_queue_v1 WHERE scope_key=?1 AND date=?2 AND source_revision=?3`)
        .bind(s.scope_key,s.date,s.source_revision),
    ]);
    if(Number(result[0]?.meta.changes??0)>0)built++;
  }catch(error) {
    const code=error instanceof HttpError?error.code:'APPLICATION_STATISTICS_REBUILD_FAILED';
    await db.prepare(`UPDATE runtime_application_statistics_queue_v1 SET attempts=attempts+1,error_code=?3,
      retry_at_ms=?4 WHERE scope_key=?1 AND date=?2 AND source_revision=?5`)
      .bind(s.scope_key,s.date,code,now+Math.min(300000,5000*2**Math.min(6,Number((s as Scope&{attempts?:number}).attempts??0))),s.source_revision).run();
  }
  return {built,processed:work.results.length};
}
function quota(durations:number[],minutes:number|null):Quota {
  if(minutes==null)return {limitMs:null,remainingMs:null,exceeded:false,exceededDays:0};
  const limitMs=minutes*60000,exceededDays=durations.filter(v=>v>limitMs).length;
  return {limitMs,remainingMs:durations.length===1?Math.max(0,limitMs-durations[0]!):null,exceeded:exceededDays>0,exceededDays};
}
/** Caller verifies Child ownership. Does not calculate totals from raw facts. */
export async function readPersistentApplicationUsage(db:D1Database,account:string,child:string,from:number,to:number,filters:Filters,
  defer?:(work:Promise<unknown>)=>void,now=Date.now()) {
  if(!Number.isSafeInteger(from)||!Number.isSafeInteger(to)||from<0||to<=from||to-from>31*DAY)
    throw new HttpError(400,'INVALID_RANGE','统计日期范围无效。');
  const weekStart=midnight(from)-((new Date(from+OFFSET).getUTCDay()+6)%7)*DAY;
  const ranges=new Map<string,{from:number;to:number}>(),requestedIds:string[]=[],weeklyIds:string[]=[];
  const add=(left:number,right:number,target:string[])=>{
    const id=`${left}/${right}`;ranges.set(id,{from:left,to:right});target.push(id);
  };
  for(let cursor=from;cursor<to;){const end=Math.min(to,midnight(cursor)+DAY);add(cursor,end,requestedIds);cursor=end;}
  for(let cursor=weekStart;cursor<weekStart+7*DAY;cursor+=DAY)add(cursor,cursor+DAY,weeklyIds);
  const sourceHeads=await sourceRanges(db,account,child,[...ranges.values()],filters);
  const scopes=new Map(await Promise.all([...ranges].map(async([id,r],index)=>
    [id,await scope(account,child,r.from,r.to,filters,sourceHeads[index]!)] as const)));
  const requested=requestedIds.map(id=>scopes.get(id)!),weekly=weeklyIds.map(id=>scopes.get(id)!);
  const unique=new Map([...requested,...weekly].map(s=>[`${s.scope_key}/${s.date}`,s]));
  const loaded=new Map<string,PublishedDay>();let pending=false,missing=false;
  const published=await db.batch<PublishedDay>([...unique.values()].map(s=>db.prepare(`SELECT * FROM runtime_application_statistics_days_v1
      WHERE scope_key=?1 AND date=?2 AND account_id=?3 AND child_id=?4`).bind(s.scope_key,s.date,account,child)));
  const queued:D1PreparedStatement[]=[];let index=0;
  for(const [id,s] of unique){
    const value=published[index++]!.results[0];
    if(value)loaded.set(id,value);else missing=true;
    if(!value||value.source_revision!==s.source_revision){queued.push(enqueueStatement(db,s,now));pending=true;}
  }
  for(let offset=0;offset<queued.length;offset+=7)await db.batch(queued.slice(offset,offset+7));
  if(pending&&defer)defer((async()=>{
    for(const scopeKey of new Set([...unique.values()].map(s=>s.scope_key)))await rebuildApplicationStatistics(db,now,scopeKey);
  })());
  if(missing)throw new HttpError(503,'APPLICATION_STATISTICS_PENDING','应用统计正在后台生成，请稍后刷新；这不代表零用量。');
  const get=(s:Scope)=>JSON.parse(loaded.get(`${s.scope_key}/${s.date}`)!.value_json) as StatisticsValue;
  const days=requested.map(get),week=weekly.map(get),policy=await getAppPolicy(db,account,child);
  if([...days,...week].some(d=>d.appPolicyVersion!==policy.version))
    throw new HttpError(503,'APPLICATION_STATISTICS_MANAGEMENT_PENDING','应用分类更正正在同步统计，请稍后刷新。');
  const categories=new Map<ApplicationClassification,number[]>(),apps=new Map<string,{app:AppRow;days:number[];end:number}>();
  const estimated=new Set<string>(),outside=new Set<string>(),outsideApps=new Map<string,Omit<AppRow,'classification'|'classifications'|'quota'>>();
  for(const d of days){
    for(const c of d.categories){const list=categories.get(c.classification)??[];list.push(c.durationMs);categories.set(c.classification,list);}
    for(const app of d.applications){const k=key(app),end=d.materialization?.applicationLastEnds[k]??0,old=apps.get(k);
      if(!old)apps.set(k,{app:{...app,classifications:[...app.classifications]},days:[app.durationMs],end});
      else {old.app.durationMs+=app.durationMs;old.days.push(app.durationMs);
        old.app.classifications=[...new Set([...old.app.classifications,...app.classifications])].sort();
        if(end>=old.end){old.app.classification=app.classification;old.end=end;}
      }
    }
    for(const id of d.materialization?.estimatedFactKeys??[])estimated.add(id);
    for(const id of d.materialization?.outsideFactKeys??[])outside.add(id);
    for(const a of d.outsideTimeWindows.applications){const old=outsideApps.get(key(a));
      if(old)old.durationMs+=a.durationMs;else outsideApps.set(key(a),{...a});}
  }
  const buckets=new Map<number,{durationMs:number;categories:Map<ApplicationClassification,number>}>();
  for(const d of days)for(const b of d.buckets){const start=to-from>2*DAY?midnight(b.startAtMs):b.startAtMs;
    const target=buckets.get(start)??{durationMs:0,categories:new Map()};target.durationMs+=b.durationMs;
    for(const c of b.categories)target.categories.set(c.classification,(target.categories.get(c.classification)??0)+c.durationMs);buckets.set(start,target);}
  const appLimits=new Map(policy.quotas.perApplicationDailyMinutes.map(a=>[key(a),a.minutes]));
  const quotaDuration=(d:StatisticsValue,classification:ApplicationClassification)=>d.legacyQuotaCategoryDurations
    ?d.legacyQuotaCategoryDurations[classification]??0:d.categories.find(c=>c.classification===classification)?.durationMs??0;
  const restricted=week.reduce((sum,d)=>sum+quotaDuration(d,'restrictedEntertainment'),0);
  const limitMs=policy.quotas.weeklyRestrictedEntertainmentMinutes==null?null:policy.quotas.weeklyRestrictedEntertainmentMinutes*60000;
  const value:StatisticsValue={totalDurationMs:days.reduce((s,d)=>s+d.totalDurationMs,0),
    categories:[...categories].map(([classification,durations])=>({classification,durationMs:durations.reduce((a,b)=>a+b,0),
      quota:quota(days.filter(d=>d.categories.some(c=>c.classification===classification)).map(d=>quotaDuration(d,classification)),
        classification==='blocked'?0:classification==='other'?null:policy.quotas.dailyCategoryMinutes[classification])})).sort((a,b)=>b.durationMs-a.durationMs),
    applications:[...apps.values()].map(({app,days})=>({...app,quota:quota(days,app.classification==='blocked'?0:appLimits.get(key(app))??null)})).sort((a,b)=>b.durationMs-a.durationMs),
    buckets:[...buckets].sort((a,b)=>a[0]-b[0]).map(([startAtMs,b])=>({startAtMs,durationMs:b.durationMs,
      categories:[...b.categories].map(([classification,durationMs])=>({classification,durationMs})).filter(c=>c.durationMs>0)})),
    weeklyRestrictedEntertainment:{durationMs:restricted,quota:{limitMs,remainingMs:limitMs==null?null:Math.max(0,limitMs-restricted),exceeded:limitMs!=null&&restricted>limitMs}},
    estimatedSegmentCount:estimated.size,appPolicyVersion:policy.version,
    outsideTimeWindows:{durationMs:days.reduce((s,d)=>s+d.outsideTimeWindows.durationMs,0),segmentCount:outside.size,
      applications:[...outsideApps.values()].sort((a,b)=>b.durationMs-a.durationMs)},
    mediaPlaybackTotalMs:days.reduce((s,d)=>s+d.mediaPlaybackTotalMs,0)};
  const producers=new Set(requested.map(s=>loaded.get(`${s.scope_key}/${s.date}`)!.producer)),products=new Map<string,{key:string;displayName:string;durationMs:number}>();
  const productStatisticsComplete=days.every(d=>Boolean(d.nativeRows));
  const productClassifications:Record<string,string[]>={};
  for(const d of days)for(const [subject,categories] of Object.entries(d.nativeSubjectClassifications??{}))
    productClassifications[subject]=[...new Set([...(productClassifications[subject]??[]),...categories])].sort();
  if(productStatisticsComplete)for(const d of days)for(const r of d.nativeRows!.filter(r=>r.kind==='subject'&&r.hour==null)){
    const old=products.get(r.subjectKey!);if(old)old.durationMs+=r.duration;
    else products.set(r.subjectKey!,{key:r.subjectKey!,displayName:r.displayName!,durationMs:r.duration});}
  return {value,cacheStatus:'persistent' as const,statistics:{revision:await hashUsageAccountValue([...loaded].map(([id,d])=>[id,d.source_revision])),
    stale:pending,producer:producers.size===1?[...producers][0]!:'mixed',
    settledThroughByDate:requested.map((s,i)=>({date:s.date,settledThroughMs:days[i]!.nativeSettledThroughMs??null})),
    productStatisticsComplete,productClassifications,productApplications:productStatisticsComplete?[...products.values()].sort((a,b)=>b.durationMs-a.durationMs):null,
    computedAtMs:Math.min(...requested.map(s=>loaded.get(`${s.scope_key}/${s.date}`)!.computed_at_ms))}};
}
