import type { ComputerApplicationSource } from '@timeonchrome/app-runtime-contracts/computer-usage';
import { getAppPolicy } from './appPolicy';
import { readPersistentApplicationUsage } from './applicationStatistics';
import { applyCurrentWeekClassification, correctUsageRows, loadUsageCorrections } from './applicationUsageCorrections';
import { sha256Hex } from './crypto';
import { readCoveredChromeDeduction } from './applicationSharedQuota';
import { HttpError } from './http';
import { isConfirmedChrome, CHROME_DISPLAY_VERSION, CHROME_SPECIAL_PRODUCT } from './specialApplications';
import type { AppEvidence } from '@timeonchrome/app-runtime-contracts/classification';

const MAX_EVIDENCE = 10000;
type Usage = { totalDurationMs: number; categories: Array<{classification:string;durationMs:number}> };
// Exact legacy read formula: interval union within device/session/legacy-v1 lanes,
// then sum lanes. This is a display adapter, not a replacement accounting path.
function legacyLaneTotal(groups:Map<string,Array<[number,number]>>):number {
  let total=0;
  for(const ranges of groups.values()){
    const sorted=[...ranges].sort((a,b)=>a[0]-b[0]||a[1]-b[1]);let start:number|undefined,end=0;
    for(const [left,right] of sorted){if(start===undefined){start=left;end=right;}
      else if(left<=end)end=Math.max(end,right);else{total+=end-start;start=left;end=right;}}
    if(start!==undefined)total+=end-start;
  }
  return total;
}

/** Additive, read-only adapter. Authority remains queryAppUsage and immutable policy corrections. */
export async function readComputerApplicationEvidence(db: D1Database, accountId: string, childId: string,
  fromDate: string, toDate: string, defer?:(work:Promise<unknown>)=>void): Promise<ComputerApplicationSource[]> {
  const fromMs = Date.parse(`${fromDate}T00:00:00+08:00`);
  const toMs = Date.parse(`${toDate}T00:00:00+08:00`) + 86400000;
  const machines = await db.prepare(`SELECT DISTINCT m.id,m.display_name FROM runtime_machines_v2 m
    WHERE m.account_id=?1 AND (m.default_child_id=?2 OR EXISTS (SELECT 1 FROM runtime_usage_segments_v2 s
      WHERE s.machine_id=m.id AND s.child_id=?2 AND COALESCE(s.start_wall_time_ms,s.start_at_ms)<?4
      AND COALESCE(s.end_wall_time_ms,s.end_at_ms)>?3)) ORDER BY m.id LIMIT 101`)
    .bind(accountId,childId,fromMs,toMs).all<{id:string;display_name:string}>();
  if ((machines.results?.length ?? 0) > 100) throw new HttpError(422,'COMPUTER_USAGE_SOURCE_LIMIT','电脑来源过多，请缩小查询范围。');
  const policy = await getAppPolicy(db,accountId,childId);
  const projection = new Map((policy.productIdentityProjection?.items ?? []).map(item=>[`${item.platform}\n${item.runtimeIdentity}`,item]));
  const corrections = await loadUsageCorrections(db,accountId,childId,fromMs,toMs);
  const sources: ComputerApplicationSource[] = [];
  let remaining=MAX_EVIDENCE;
  for (const machine of machines.results ?? []) {
    const source = await db.prepare(`SELECT s.platform,s.runtime_identity,s.display_name,s.runtime_session_id,
      s.local_user_id,s.clock_epoch_id,s.application_classification AS classification,s.app_policy_version,
      s.estimated,s.accounting_schema_version,
      CASE WHEN s.accounting_schema_version=2 THEN s.start_wall_time_ms ELSE s.start_at_ms END AS start_wall_time_ms,
      CASE WHEN s.accounting_schema_version=2 THEN s.end_wall_time_ms ELSE s.end_at_ms END AS end_wall_time_ms,
      s.uploaded_at_ms FROM runtime_usage_segments_v2 s JOIN runtime_machines_v2 m ON m.id=s.machine_id
      WHERE m.account_id=?1 AND s.child_id=?2 AND s.machine_id=?3 AND s.diagnostic=0
      AND ((s.accounting_schema_version=2 AND s.start_wall_time_ms<?5 AND s.end_wall_time_ms>?4)
        OR (s.accounting_schema_version=1 AND s.start_at_ms<?5 AND s.end_at_ms>?4))
      ORDER BY start_wall_time_ms,end_wall_time_ms,s.id LIMIT ?6`)
      .bind(accountId,childId,machine.id,fromMs,toMs,remaining+1).all<Record<string,unknown>>();
    const rows=source.results ?? [];
    const limited=rows.length>remaining;
    const reasons = limited ? ['APPLICATION_EVIDENCE_LIMIT'] : rows.length===0 ? ['APPLICATION_EVIDENCE_UNAVAILABLE'] : [];
    if(rows.some(row=>Number(row.estimated)!==0||!row.clock_epoch_id||Number(row.accounting_schema_version)!==2))reasons.push('APPLICATION_CLOCK_EVIDENCE_INCOMPLETE');
    let authoritative:Usage|null=null,nativeAuthority=false;
    if(!limited)try{
      const snapshot=await readPersistentApplicationUsage(db,accountId,childId,fromMs,toMs,{machineId:machine.id},defer);
      authoritative=snapshot.value;
      nativeAuthority=snapshot.statistics.producer==='native'&&!snapshot.statistics.stale;
      if(snapshot.statistics.stale)reasons.push('APPLICATION_STATISTICS_STALE');
    }catch(error){
      if(error instanceof HttpError)reasons.push(error.code);else throw error;
    }
    const retainedIdentities=[...new Map(rows.slice(0,remaining).map(row=>[row.platform+'\n'+row.runtime_identity,{platform:row.platform,identity:row.runtime_identity}])).values()];
    const retainedEvidence=await db.prepare(`SELECT i.evidence_json FROM runtime_application_inventory_v1 i
      WHERE i.machine_id=?1 AND EXISTS (SELECT 1 FROM json_each(?2) k
        WHERE json_extract(k.value,'$.platform')=i.platform AND json_extract(k.value,'$.identity')=i.runtime_identity)
      ORDER BY i.last_seen_at_ms DESC LIMIT 10001`)
      .bind(machine.id,JSON.stringify(retainedIdentities))
      .all<{evidence_json:string}>();
    const evidenceByIdentity=new Map<string,AppEvidence>();
    for(const item of retainedEvidence.results??[]){const evidence=JSON.parse(item.evidence_json) as AppEvidence;
      const key=evidence.platform+'\n'+evidence.runtimeIdentity;if(!evidenceByIdentity.has(key))evidenceByIdentity.set(key,evidence);}
    const intervals: ComputerApplicationSource['intervals']=[];
    const keys=new Map<string,string>();
    const corrected=correctUsageRows(rows.slice(0,remaining),corrections,fromMs,toMs);
    for(const row of nativeAuthority?applyCurrentWeekClassification(corrected,policy,Date.now()):corrected) {
      const identity=`${row.platform}\n${row.runtime_identity}`, projected=projection.get(identity);
      const special=isConfirmedChrome(evidenceByIdentity.get(identity),projected,policy.applicationKnowledge);
      const stable=special?`${row.platform}\n${CHROME_SPECIAL_PRODUCT}`
        :projected?.status==='confirmed'||projected?.status==='associated' ? projected.associationKey : identity;
      let subjectKey=keys.get(stable);
      if(!subjectKey){subjectKey=await sha256Hex(`${accountId}\napplication\n${stable}`);keys.set(stable,subjectKey);}
      // No local label/name inference. Only an explicitly approved product is special.
      intervals.push({startMs:Number(row.start_wall_time_ms),endMs:Number(row.end_wall_time_ms),
        classification:String(row.classification ?? 'historicalUnknown'),subjectKey,
        label:special?'Chrome':projected?.canonicalName || String(row.display_name ?? '未知应用'),special});
    }
    remaining-=Math.min(rows.length,remaining);
    const computerKey=await sha256Hex(`${accountId}\ncomputer\n${machine.id}`);
    const chromeIncludedInApplicationMs=nativeAuthority&&authoritative
      ?await readCoveredChromeDeduction(db,accountId,childId,machine.id,fromDate,toDate,authoritative.totalDurationMs)
      :null;
    sources.push({key:`app:${computerKey}`,computerKey,computerName:machine.display_name || '电脑',
      revision:await sha256Hex(JSON.stringify({rows,authority:authoritative?.totalDurationMs??null})),
      associationVersion:`${policy.productIdentityProjection?.version ?? 'unavailable'}:${CHROME_DISPLAY_VERSION}`,
      correctionRevision:await sha256Hex(JSON.stringify(corrections)),
      settledAtMs:rows.length?Math.max(...rows.map(row=>Number(row.end_wall_time_ms))):null,
      complete:reasons.length===0,statisticsComplete:authoritative!==null&&!reasons.includes('APPLICATION_STATISTICS_STALE'),reasons,totalMs:authoritative?.totalDurationMs??null,
      categoriesMs:Object.fromEntries((authoritative?.categories??[]).map(item=>[item.classification,item.durationMs])),
      chromeIncludedInApplicationMs,intervals});
  }
  try {
  const legacy=await db.prepare(`SELECT d.id,d.display_name,COUNT(s.id) AS count,MAX(s.uploaded_at_ms) AS latest
    FROM runtime_devices d LEFT JOIN runtime_usage_segments s ON s.device_id=d.id AND s.start_at_ms<?4 AND s.end_at_ms>?3
    WHERE d.account_id=?1 AND d.child_id=?2 GROUP BY d.id
    HAVING d.revoked_at_ms IS NULL OR COUNT(s.id)>0 ORDER BY d.id LIMIT 101`).bind(accountId,childId,fromMs,toMs).all<{id:string;display_name:string;count:number;latest:number|null}>();
  if((legacy.results?.length??0)>100)throw new HttpError(422,'COMPUTER_USAGE_SOURCE_LIMIT','电脑来源过多。');
  for(const device of legacy.results??[]){
    const key=`legacy-app:${await sha256Hex(accountId+'\nlegacy\n'+device.id)}`;
    try {
      const records=await db.prepare(`SELECT s.platform,s.runtime_identity,s.display_name,s.runtime_session_id,
        s.start_at_ms AS start_wall_time_ms,s.end_at_ms AS end_wall_time_ms,'unclassified' AS classification,s.uploaded_at_ms
        FROM runtime_usage_segments s JOIN runtime_devices d ON d.id=s.device_id
        WHERE d.account_id=?1 AND d.child_id=?2 AND d.id=?3 AND s.start_at_ms<?5 AND s.end_at_ms>?4
        ORDER BY s.start_at_ms,s.end_at_ms,s.id LIMIT ?6`).bind(accountId,childId,device.id,fromMs,toMs,remaining+1).all<Record<string,unknown>>();
      const rows=records.results??[],limited=rows.length>remaining;
      const legacyEvidence=new Map<string,AppEvidence>();
      // Existing retained strong evidence may corroborate the exact old leaf;
      // this does not assert a legacy-device/current-machine relationship.
      try {
        const identities=[...new Map(rows.slice(0,remaining).map(row=>[row.platform+'\n'+row.runtime_identity,{platform:row.platform,identity:row.runtime_identity}])).values()];
        const retained=await db.prepare(`SELECT i.evidence_json FROM runtime_application_inventory_v1 i JOIN runtime_machines_v2 m ON m.id=i.machine_id
          WHERE m.account_id=?1 AND EXISTS (SELECT 1 FROM runtime_user_assignments_v2 a WHERE a.machine_id=i.machine_id AND a.local_user_id=i.local_user_id AND a.child_id=?2 AND a.protected=1)
          AND EXISTS (SELECT 1 FROM json_each(?3) k WHERE json_extract(k.value,'$.platform')=i.platform AND json_extract(k.value,'$.identity')=i.runtime_identity)
          ORDER BY i.last_seen_at_ms DESC LIMIT 10001`).bind(accountId,childId,JSON.stringify(identities)).all<{evidence_json:string}>();
        for(const item of retained.results??[]){const evidence=JSON.parse(item.evidence_json) as AppEvidence;
          const identity=evidence.platform+'\n'+evidence.runtimeIdentity;if(!legacyEvidence.has(identity))legacyEvidence.set(identity,evidence);}
      }catch{ /* Uncorroborated legacy names remain ordinary applications. */ }
      const groups=new Map<string,Array<[number,number]>>(),categories=new Map<string,Map<string,Array<[number,number]>>>();
      const intervals:ComputerApplicationSource['intervals']=[];
      for(const row of correctUsageRows(rows.slice(0,remaining),corrections,fromMs,toMs)){
        const lane=String(row.runtime_session_id),start=Number(row.start_wall_time_ms),end=Number(row.end_wall_time_ms);
        const category=String(row.classification??'unclassified');
        const current=groups.get(lane)??[];current.push([start,end]);groups.set(lane,current);
        const categoryGroups=categories.get(category)??new Map<string,Array<[number,number]>>();
        const categoryRanges=categoryGroups.get(lane)??[];categoryRanges.push([start,end]);categoryGroups.set(lane,categoryRanges);categories.set(category,categoryGroups);
        const identity=`${row.platform}\n${row.runtime_identity}`,projected=projection.get(identity);
        const special=isConfirmedChrome(legacyEvidence.get(identity),projected,policy.applicationKnowledge);
        const stable=special?`${row.platform}\n${CHROME_SPECIAL_PRODUCT}`:projected?.status==='confirmed'||projected?.status==='associated'?projected.associationKey:identity;
        intervals.push({startMs:start,endMs:end,classification:category,subjectKey:await sha256Hex(`${accountId}\napplication\n${stable}`),
          label:special?'Chrome':projected?.canonicalName||String(row.display_name??'未知应用'),special});
      }
      remaining-=Math.min(remaining,rows.length);
      sources.push({key,computerKey:null,computerName:device.display_name||'旧版电脑',revision:await sha256Hex(JSON.stringify({device,rows})),
        associationVersion:`legacy:${policy.productIdentityProjection?.version??'unavailable'}:${CHROME_DISPLAY_VERSION}`,
        correctionRevision:await sha256Hex(JSON.stringify(corrections)),settledAtMs:rows.length?Math.max(...rows.map(row=>Number(row.end_wall_time_ms))):null,
        complete:false,statisticsComplete:!limited,historyQuality:'bestEffort',reasons:['LEGACY_APPLICATION_BEST_EFFORT',...(limited?['APPLICATION_EVIDENCE_LIMIT']:[])],
        totalMs:limited?null:legacyLaneTotal(groups),categoriesMs:limited?{}:Object.fromEntries([...categories].map(([category,lanes])=>[category,legacyLaneTotal(lanes)])),intervals});
    }catch{
      sources.push({key,computerKey:null,computerName:device.display_name||'旧版电脑',revision:'unavailable',associationVersion:`legacy:${CHROME_DISPLAY_VERSION}`,
        correctionRevision:'unavailable',settledAtMs:null,complete:false,statisticsComplete:false,historyQuality:'bestEffort',
        reasons:['LEGACY_APPLICATION_SOURCE_UNAVAILABLE'],totalMs:null,categoriesMs:{},intervals:[]});
    }
  }
  }catch{
    sources.push({key:'legacy-app:unavailable',computerKey:null,computerName:'旧版应用来源',revision:'unavailable',associationVersion:`legacy:${CHROME_DISPLAY_VERSION}`,
      correctionRevision:'unavailable',settledAtMs:null,complete:false,statisticsComplete:false,historyQuality:'bestEffort',
      reasons:['LEGACY_APPLICATION_SOURCE_UNAVAILABLE'],totalMs:null,categoriesMs:{},intervals:[]});
  }
  return sources;
}
