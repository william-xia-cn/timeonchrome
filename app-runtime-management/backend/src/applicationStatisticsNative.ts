import {parseUsageAccountRowsV2,verifyUsageAccountManifestV2,validateUsageAccountDimensions,validateUsageAccountDimensionsV2,
  hashUsageAccountValue,APPLICATION_FIXED_IDENTITY_SECONDS_ALGORITHM,type UsageAccountRowV2,type ApplicationUsageSeconds} from '@timeonchrome/app-runtime-contracts/usage-account';
import {HttpError} from './http';
import { isReadableApplicationAccountSnapshot } from './applicationAccountPublication';
import { readApplicationLedgerRetirement, isV3OnlyApplicationManifest } from './applicationLedgerRetirement';
import {nativeApplicationManagementTargetKey,type NativeApplicationManagementTarget} from '@timeonchrome/app-runtime-contracts/native-application-identification';
type Filters={machineId?:string;localUserId?:string;platform?:string;fixedIdentityOnly?:boolean;emptyAsZero?:boolean;
  quotaRead?:boolean;onlySource?:{machineId:string;localUserId:string;assignmentVersion:number};
  excludeSources?:ReadonlyArray<{machineId:string;localUserId:string;assignmentVersion:number}>};
type StatisticsRow=UsageAccountRowV2&{target?:NativeApplicationManagementTarget};
const DAY=86400000,OFFSET=8*3600000;
function mergeApplicationUsage(values:Array<ApplicationUsageSeconds|undefined|null>):ApplicationUsageSeconds|null {
  const readable=values.filter((value):value is ApplicationUsageSeconds=>!!value);
  if(!readable.length&&values.length)return null;
  const sum=(a:number,b:number)=>{const value=a+b;if(!Number.isSafeInteger(value))throw new HttpError(503,'APPLICATION_STATISTICS_DURATION_OVERFLOW','统计时长超出安全范围。');return value;};
  const result:ApplicationUsageSeconds={nonSpecialTotal:0,nonSpecialCategories:{},specialTotal:0,complete:true,reasonCodes:[]};
  for(const value of readable){
    result.nonSpecialTotal=sum(result.nonSpecialTotal,value!.nonSpecialTotal);
    result.specialTotal=sum(result.specialTotal,value!.specialTotal);
    for(const [category,duration]of Object.entries(value!.nonSpecialCategories))result.nonSpecialCategories[category]=sum(result.nonSpecialCategories[category]??0,duration);
    result.complete=result.complete&&value!.complete;result.reasonCodes.push(...value!.reasonCodes);
  }
  if(readable.length!==values.length){result.complete=false;result.reasonCodes.push('APPLICATION_QUOTA_USAGE_INCOMPLETE');}
  result.reasonCodes=[...new Set(result.reasonCodes)].sort();return result;
}
/** 持久化来源统计读取；不加载原账，不调用云端统计重算器。 */
export async function readNativeApplicationStatisticsSeconds(db:D1Database,account:string,child:string,date:string,filters:Filters={}) {
  const retirement=await readApplicationLedgerRetirement(db,account);
  const heads=await db.prepare(`SELECT p.manifest_id,p.revision,p.machine_id,p.local_user_id,p.assignment_version,
      snapshot.manifest_json,snapshot.manifest_hash FROM runtime_application_account_publications_v1 p
    JOIN runtime_application_account_manifests_v1 snapshot ON snapshot.id=p.manifest_id
    JOIN runtime_machines_v2 machine ON machine.id=p.machine_id
    WHERE p.account_id=?1 AND p.child_id=?2 AND p.date=?3 AND machine.account_id=?1
      AND snapshot.account_id=?1 AND snapshot.child_id=?2 AND snapshot.date=?3
      AND snapshot.machine_id=p.machine_id AND snapshot.local_user_id=p.local_user_id
      AND snapshot.assignment_version=p.assignment_version AND snapshot.revision=p.revision
      AND (?4 IS NULL OR p.machine_id=?4) AND (?5 IS NULL OR p.local_user_id=?5)
      AND (?6 IS NULL OR machine.platform=?6)
      AND (?7 IS NULL OR (p.machine_id=?7 AND p.local_user_id=?8 AND p.assignment_version=?9))
    ORDER BY p.machine_id,p.local_user_id,p.assignment_version LIMIT 101`)
    .bind(account,child,date,filters.machineId??null,filters.localUserId??null,filters.platform??null,
      filters.onlySource?.machineId??null,filters.onlySource?.localUserId??null,filters.onlySource?.assignmentVersion??null)
    .all<{manifest_id:string;revision:number;machine_id:string;local_user_id:string;assignment_version:number;
      manifest_json:string;manifest_hash:string}>();
  if(heads.results.length>100)throw new HttpError(503,'APPLICATION_STATISTICS_SOURCE_LIMIT','统计来源超过单次读取限制。');
  const merged=new Map<string,StatisticsRow>(),references:Array<{manifestId:string;revision:number;hash:string;settledThroughMs:number|null}>=[];
  let count=0,legacySourceCount=0;
  let complete=true;
  const reasonCodes=new Set<string>();
  const applicationUsage:Array<ApplicationUsageSeconds|undefined>=[];
  for(const head of heads.results){
    // 排除范围由已认证调用者推导；同机器其他用户仍保留。普通统计调用不传此选项。
    if(filters.excludeSources?.some(source=>source.machineId===head.machine_id&&source.localUserId===head.local_user_id
      &&source.assignmentVersion===head.assignment_version))continue;
    try {
    const value=JSON.parse(head.manifest_json);
    if(filters.fixedIdentityOnly&&value.algorithmVersion!==APPLICATION_FIXED_IDENTITY_SECONDS_ALGORITHM){legacySourceCount++;continue;}
    if(retirement&&!isV3OnlyApplicationManifest(value,child))continue;
    if(value.schemaVersion!==2){legacySourceCount++;continue;}
    const manifest=await verifyUsageAccountManifestV2(value);
    if(manifest.childId!==undefined&&manifest.childId!==child)
      throw new HttpError(503,'APPLICATION_ACCOUNT_CHILD_SCOPE_MISMATCH','统计清单孩子与读取范围不一致。');
    const fixedIdentity=manifest.algorithmVersion===APPLICATION_FIXED_IDENTITY_SECONDS_ALGORITHM;
    if((retirement&&!fixedIdentity?!manifest.complete:!isReadableApplicationAccountSnapshot(manifest))||manifest.date!==date||manifest.sourceKind!=='application'
      ||manifest.revision!==head.revision||manifest.manifestHash!==head.manifest_hash)
      throw new HttpError(503,'APPLICATION_STATISTICS_INVALID_PUBLICATION','已发布统计范围无效。');
    const chunks=await db.prepare(`SELECT chunk_index,rows_json FROM runtime_application_account_chunks_v1
      WHERE manifest_id=?1 ORDER BY chunk_index LIMIT 100`).bind(head.manifest_id)
      .all<{chunk_index:number;rows_json:string}>();
    if(chunks.results.length!==manifest.chunkCount||chunks.results.some((chunk,index)=>chunk.chunk_index!==index))
      throw new HttpError(503,'APPLICATION_STATISTICS_CHUNKS_MISSING','已发布统计分块不完整。');
    const rows=parseUsageAccountRowsV2(chunks.results.flatMap(chunk=>JSON.parse(chunk.rows_json)),10000,manifest.algorithmVersion);
    if(rows.length!==manifest.rowCount||await hashUsageAccountValue(rows)!==manifest.rowsHash)
      throw new HttpError(503,'APPLICATION_STATISTICS_HASH_MISMATCH','已发布统计完整性校验失败。');
    validateUsageAccountDimensionsV2(rows,manifest.algorithmVersion);
    complete=complete&&manifest.complete;
    for(const reason of manifest.reasonCodes)reasonCodes.add(reason);
    count+=rows.length;
    if(count>10000)throw new HttpError(503,'APPLICATION_STATISTICS_ROW_LIMIT','统计行超过单次读取限制。');
    references.push({manifestId:head.manifest_id,revision:head.revision,hash:head.manifest_hash,settledThroughMs:manifest.settledThroughMs});
    applicationUsage.push(manifest.applicationUsage);
    for(const row of rows){
      const target=fixedIdentity&&row.kind==='subject'?{machineId:head.machine_id,nativeId:row.subjectKey!}:undefined;
      const subjectKey=target?nativeApplicationManagementTargetKey(target):row.subjectKey;
      const key=JSON.stringify([row.kind,row.hour,row.category,subjectKey]),prior=merged.get(key);
      if(prior){prior.duration+=row.duration;
        if(!Number.isSafeInteger(prior.duration))throw new HttpError(503,'APPLICATION_STATISTICS_DURATION_OVERFLOW','统计时长超出安全范围。');
        if(row.kind==='subject')prior.classifications=[...new Set([...(prior.classifications??[]),...row.classifications!])].sort();
      }else merged.set(key,{...row,subjectKey,...(target?{target}:{}),...(row.classifications?{classifications:[...row.classifications]}:{})});
    }
    } catch(error) {
      // 校验失败的来源不参加合并；孩子隔离和读取预算不是可降级的来源故障。
      if(error instanceof HttpError&&(/CHILD_SCOPE_MISMATCH$/.test(error.code)
        ||/_(SOURCE_LIMIT|ROW_LIMIT|DURATION_OVERFLOW)$/.test(error.code)))throw error;
      complete=false;
      reasonCodes.add(error instanceof HttpError?error.code:'APPLICATION_STATISTICS_SOURCE_UNAVAILABLE');
    }
  }
  if(references.length===0&&reasonCodes.size)
    throw new HttpError(503,[...reasonCodes].sort()[0],'当前范围没有通过校验的应用来源。');
  if(references.length===0&&legacySourceCount===0){
    // 成功空查询是正常0秒，不要求每个登记用户每天上传一份零账。
    merged.set('empty-total',{kind:'total',hour:null,category:null,subjectKey:null,displayName:null,duration:0});
    for(let hour=0;hour<24;hour++)merged.set(`empty-hour-${hour}`,
      {kind:'total',hour,category:null,subjectKey:null,displayName:null,duration:0});
  }
  // 配额只消费已确认的分类贡献；另一来源缺分类或旧单位不清空可读来源。
  // 普通统计与配额读取共用已确认分项，缺项仅影响覆盖状态。
  const quotaUsage=mergeApplicationUsage(applicationUsage);
  if(quotaUsage&&(!complete||legacySourceCount>0||applicationUsage.some(value=>!value))){
    quotaUsage.complete=false;
    quotaUsage.reasonCodes=[...new Set([...quotaUsage.reasonCodes,
      ...reasonCodes,...(legacySourceCount>0?['LEGACY_STATISTICS_UNIT']:[]),
      ...(applicationUsage.some(value=>!value)?['APPLICATION_QUOTA_USAGE_INCOMPLETE']:[])])].sort();
  }
  return {durationUnit:'seconds' as const,rows:[...merged.values()],references,legacySourceCount,
    applicationUsage:quotaUsage,
    complete:complete&&legacySourceCount===0,reasonCodes:[...reasonCodes].sort(),
    revision:await hashUsageAccountValue([references,[...reasonCodes].sort()])};
}
/** 成功空日期为零；失败日期独立诊断，不丢弃其他日期的已确认秒统计。 */
export async function readNativeApplicationStatisticsRangeSeconds(db:D1Database,account:string,child:string,
  fromMs:number,toMs:number,filters:Filters={}) {
  const retirement=await readApplicationLedgerRetirement(db,account);
  if(!Number.isSafeInteger(fromMs)||!Number.isSafeInteger(toMs)||fromMs<0||toMs<=fromMs
    ||(fromMs+OFFSET)%DAY!==0||(toMs+OFFSET)%DAY!==0||toMs-fromMs>7*DAY)
    throw new HttpError(400,'INVALID_RANGE','秒统计仅支持最多七个北京时间完整日期。');
  const days:Array<{date:string;snapshot:Awaited<ReturnType<typeof readNativeApplicationStatisticsSeconds>>}>=[];
  for(let cursor=fromMs;cursor<toMs;cursor+=DAY){
    const date=new Date(cursor+OFFSET).toISOString().slice(0,10);
    try {
      days.push({date,snapshot:await readNativeApplicationStatisticsSeconds(db,account,child,date,filters)});
    } catch(error) {
      if(error instanceof HttpError&&(/CHILD_SCOPE_MISMATCH$/.test(error.code)
        ||/_(SOURCE_LIMIT|ROW_LIMIT|DURATION_OVERFLOW)$/.test(error.code)))throw error;
      days.push({date,snapshot:{durationUnit:'seconds',rows:[],references:[],legacySourceCount:0,
        applicationUsage:null,complete:false,reasonCodes:[error instanceof HttpError?error.code:'APPLICATION_STATISTICS_SOURCE_UNAVAILABLE'],
        revision:'unavailable'}});
    }
  }
  if(days.every(day=>day.snapshot?.revision==='unavailable'))
    throw new HttpError(503,days[0].snapshot!.reasonCodes[0],'当前范围的应用统计读取失败。');
  const merged=new Map<string,StatisticsRow>();
  for(const day of days)for(const row of day.snapshot?.rows??[]){
    if(row.hour!==null)continue;
    const key=JSON.stringify([row.kind,row.category,row.subjectKey]),prior=merged.get(key);
    if(prior){
      prior.duration+=row.duration;
      if(!Number.isSafeInteger(prior.duration))throw new HttpError(503,'APPLICATION_STATISTICS_DURATION_OVERFLOW','统计时长超出安全范围。');
      if(row.kind==='subject')prior.classifications=[...new Set([...(prior.classifications??[]),...row.classifications!])].sort();
    }else merged.set(key,{...row,...(row.classifications?{classifications:[...row.classifications]}:{})});
  }
  const complete=days.every(day=>day.snapshot?.complete===true);
  const rows=[...merged.values()];
  // 仅旧RPC选源保留“整段范围没有新版来源”；有已发布来源时空日仍正常补0。
  const noNativeSource=filters.emptyAsZero===false&&days.every(day=>
    day.snapshot?.complete&&day.snapshot.references.length===0&&day.snapshot.legacySourceCount===0);
  const availableTotal=noNativeSource?null:rows.find(row=>row.kind==='total')?.duration??null;
  const applicationUsage=mergeApplicationUsage(days.map(day=>day.snapshot?.applicationUsage));
  return {durationUnit:'seconds' as const,complete,totalDuration:complete?availableTotal:null,
    applicationUsage,
    availableTotalDuration:availableTotal,
    categories:rows.filter(row=>row.kind==='category'),products:rows.filter(row=>row.kind==='subject'),
    days:days.map(({date,snapshot})=>({date,complete:snapshot?.complete===true,
      reasonCodes:!snapshot?[retirement?'APPLICATION_V3_RECORDS_NOT_AVAILABLE':'APPLICATION_STATISTICS_NOT_AVAILABLE']:
        [...new Set([...snapshot.reasonCodes,...(snapshot.legacySourceCount>0?['LEGACY_STATISTICS_UNIT']:[])])].sort(),
      totalDuration:snapshot?.rows.find(row=>row.kind==='total'&&row.hour===null)?.duration??null,
      hours:snapshot?.rows.filter(row=>row.hour!==null)??[],
      settledThroughMs:snapshot?.references.length&&snapshot.references.every(ref=>ref.settledThroughMs!==null)
        ?Math.min(...snapshot.references.map(ref=>ref.settledThroughMs!)):null})),
    revision:await hashUsageAccountValue(days.map(day=>[day.date,day.snapshot?.revision??null]))};
}
