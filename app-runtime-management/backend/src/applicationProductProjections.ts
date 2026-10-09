import { canonicalUsageAccountJson, hashUsageAccountValue, parseApplicationProductStatisticsProjection,
  type ApplicationProductStatisticsProjection, parseApplicationInstanceAccountRows, verifyApplicationInstanceAccountManifest,
  verifyApplicationProductStatisticsProjection, APPLICATION_PRODUCT_PROJECTION_MAX_BYTES,
  verifyApplicationProductProjectionReceipt } from '@timeonchrome/app-runtime-contracts/usage-account';
import { parseApplicationKnowledgeV4 } from '@timeonchrome/app-runtime-contracts/classification-validation';
import type { MachineSelfResponse } from './contracts';
import { HttpError } from './http';
import { readProgramInstanceStatistics } from './programInstanceStatistics';
import { readProgramInstanceCatalog } from './programInstances';

type BaseStatistics = Awaited<ReturnType<typeof readProgramInstanceStatistics>>;
type ProductSource = {
  date: string;
  base: BaseStatistics['days'][number]['references'][number];
  state: 'available' | 'stale' | 'missing' | 'unavailable';
  reasonCodes: string[];
  projection: ApplicationProductStatisticsProjection | null;
};

/** 只读取接收时已验证的不可变投影，不再扫描原账或重做基础统计。 */
export async function readApplicationProductProjections(db: D1Database, account: string, child: string,
  statistics: BaseStatistics) {
  if (statistics.childId !== child) throw new HttpError(403, 'CHILD_SCOPE_MISMATCH', '孩子范围不一致。');
  const catalog = await db.prepare(`SELECT version FROM runtime_application_knowledge_versions_v1
    WHERE account_id=? ORDER BY version DESC LIMIT 1`).bind(account).first<{version:number}>();
  const catalogVersion = catalog?.version ?? 0, sources: ProductSource[] = [];
  let payloadBytes = 0, rowCount = 0;
  for (const day of statistics.days) {
    if (!day.references.length) continue;
    // 每批最多四份有界载荷，避免读取完全部来源后才检查内存预算。
    for (let offset = 0; offset < day.references.length; offset += 4) {
    const references = day.references.slice(offset, offset + 4);
    if (payloadBytes >= 8 * 1048576 || rowCount >= 10000) {
      sources.push(...references.map(base => ({date: day.date, base, state: 'unavailable' as const,
        reasonCodes: ['APPLICATION_PRODUCT_PROJECTION_READ_LIMIT'], projection: null})));
      continue;
    }
    const results = await db.batch<{
      payload_json: string | null; payload_bytes: number; projection_hash: string; revision: number;
    }>(references.map(base => db.prepare(`SELECT
        CASE WHEN length(CAST(p.payload_json AS BLOB))<=1048576 THEN p.payload_json ELSE NULL END AS payload_json,
        length(CAST(p.payload_json AS BLOB)) AS payload_bytes,p.projection_hash,p.revision
      FROM runtime_application_product_projections_v1 p
      JOIN runtime_application_account_manifests_v1 s ON s.id=p.manifest_id
      JOIN runtime_machines_v2 m ON m.id=s.machine_id
      WHERE p.manifest_id=?1 AND s.account_id=?2 AND m.account_id=?2 AND s.child_id=?3
        AND s.manifest_hash=?4 AND s.date=?5 AND s.state='received'
      ORDER BY p.revision DESC LIMIT 1`).bind(base.manifestId, account, child, base.hash, day.date)));
    for (let index = 0; index < references.length; index++) {
      const source: ProductSource = {date: day.date, base: references[index], state: 'missing',
        reasonCodes: ['APPLICATION_PRODUCT_PROJECTION_NOT_AVAILABLE'], projection: null};
      const stored = results[index].results[0];
      if (stored) {
        payloadBytes += stored.payload_bytes;
        if (stored.payload_json === null || payloadBytes > 8 * 1048576) {
          source.state = 'unavailable'; source.reasonCodes = ['APPLICATION_PRODUCT_PROJECTION_READ_LIMIT'];
        } else {
          try {
            const projection = parseApplicationProductStatisticsProjection(JSON.parse(stored.payload_json));
            const {projectionHash, ...body} = projection;
            if (projectionHash !== stored.projection_hash || projection.revision !== stored.revision
              || projection.baseManifestHash !== source.base.hash || await hashUsageAccountValue(body) !== projectionHash)
              throw new Error('invalid immutable projection');
            rowCount += projection.rows.length;
            if (rowCount > 10000) {
              source.state = 'unavailable'; source.reasonCodes = ['APPLICATION_PRODUCT_PROJECTION_READ_LIMIT'];
            } else {
              source.projection = projection;
              source.state = projection.catalogVersion === catalogVersion ? 'available' : 'stale';
              source.reasonCodes = [...projection.reasonCodes,
                ...(source.state === 'stale' ? ['APPLICATION_PRODUCT_CATALOG_CHANGED'] : [])];
            }
          } catch {
            source.state = 'unavailable'; source.reasonCodes = ['APPLICATION_PRODUCT_PROJECTION_INVALID'];
          }
        }
      }
      sources.push(source);
    }
    }
  }
  return {schemaVersion: 1, durationUnit: 'seconds', catalogVersion,
    complete: statistics.complete && sources.length > 0
      && sources.every(source => source.state === 'available' && source.projection?.complete),
    sources, revision: await hashUsageAccountValue([statistics.revision, catalogVersion,
      sources.map(source => [source.base.manifestId, source.state, source.projection?.projectionHash ?? null, source.reasonCodes])])};
}

const fail=(status:number,code:string):never=>{throw new HttpError(status,code,code);};

/** 两套云端页面共用；累计已物化来源，不在读取时识别或重算实例并集。 */
export async function readApplicationIdentityUsage(db:D1Database,account:string,child:string,fromMs:number,toMs:number,
  filters:{machineId?:string;localUserId?:string;platform?:string}={}) {
  const base=await readProgramInstanceStatistics(db,account,child,fromMs,toMs,filters);
  let projection:Awaited<ReturnType<typeof readApplicationProductProjections>>|null=null;
  let catalog:Awaited<ReturnType<typeof readProgramInstanceCatalog>>|null=null;
  const reasons=new Set<string>();
  try {
    projection=await readApplicationProductProjections(db,account,child,base);
    catalog=await readProgramInstanceCatalog(db,account);
    if(catalog.state==='legacy'||catalog.version!==projection.catalogVersion)
      reasons.add('APPLICATION_PRODUCT_CATALOG_CHANGED');
  } catch {reasons.add('APPLICATION_PRODUCT_READ_UNAVAILABLE');}
  const names=new Map((catalog?.catalog?.products??[]).map(product=>[product.id,product.name]));
  const categories=new Map<string,number>();
  const nonSpecialCategories:Record<string,number>={};
  let nonSpecialTotal=0,specialTotal=0;
  const applications=new Map<string,{subjectKey:string;displayName:string;duration:number;classifications:string[];identified:boolean}>();
  const add=(left:number,right:number)=>{
    const sum=left+right;
    if(!Number.isSafeInteger(sum)||sum<0)throw new HttpError(503,'APPLICATION_STATISTICS_DURATION_OVERFLOW','统计范围过大。');
    return sum;
  };
  let availableSources=0;
  if(projection&&catalog&&reasons.size===0)for(const source of projection.sources) {
    source.reasonCodes.forEach(reason=>reasons.add(reason));
    if(source.state!=='available'||!source.projection)continue;
    const rows=source.projection.rows.filter(row=>row.hour===null);
    if(rows.some(row=>row.kind==='subject'&&row.subjectKey!.startsWith('product:')&&!names.has(row.subjectKey!.slice(8)))){
      reasons.add('APPLICATION_PRODUCT_NAME_UNAVAILABLE');continue;
    }
    availableSources++;
    const usage=source.projection.applicationUsage;
    nonSpecialTotal=add(nonSpecialTotal,usage.nonSpecialTotal);
    specialTotal=add(specialTotal,usage.specialTotal);
    for(const [category,duration]of Object.entries(usage.nonSpecialCategories))
      nonSpecialCategories[category]=add(nonSpecialCategories[category]??0,duration);
    for(const row of rows) {
      if(row.kind==='category')categories.set(row.category!,add(categories.get(row.category!)??0,row.duration));
      else {
        const key=row.subjectKey!,prior=applications.get(key),identified=key.startsWith('product:');
        applications.set(key,{subjectKey:key,
          displayName:identified?names.get(key.slice(8))!:`${key.startsWith('instance:')?'未识别程序实例':'待解析程序观测'} · ${key.split(':')[1].slice(0,12)}`,
          duration:add(prior?.duration??0,row.duration),
          classifications:[...new Set([...(prior?.classifications??[]),...row.classifications!])].sort(),identified});
      }
    }
  }
  const productComplete=!!projection?.complete&&reasons.size===0;
  if(!projection?.sources.length)reasons.add('APPLICATION_PRODUCT_PROJECTION_NOT_AVAILABLE');
  const days=base.days.map(day=>({...day,
    settledThroughMs:day.references.length&&day.references.every(item=>item.settledThroughMs!==null)
      ?Math.min(...day.references.map(item=>item.settledThroughMs!)):null}));
  const date=(ms:number)=>new Date(ms+28800000).toISOString().slice(0,10);
  return {model:'program-instance-v1' as const,source:'application' as const,childId:child,
    fromDate:date(fromMs),toDate:date(toMs-1),durationUnit:'seconds' as const,
    complete:base.complete,totalDuration:base.totalDuration,availableTotalDuration:base.availableTotalDuration,
    applicationUsage:productComplete?{nonSpecialTotal,nonSpecialCategories,specialTotal,complete:true,reasonCodes:[]}:null,
    instances:base.subjects.map(row=>({subjectKey:row.subjectKey!,duration:row.duration})),
    days,categories:[...categories].map(([classification,duration])=>({classification,duration})),
    applications:[...applications.values()].sort((a,b)=>b.duration-a.duration||a.subjectKey.localeCompare(b.subjectKey)),
    buckets:days.flatMap(day=>toMs-fromMs===86400000?Array.from({length:24},(_,hour)=>({
      startAtMs:Date.parse(`${day.date}T00:00:00+08:00`)+hour*3600000,
      duration:day.rows.find(row=>row.kind==='total'&&row.hour===hour)?.duration??null}))
      :[{startAtMs:Date.parse(`${day.date}T00:00:00+08:00`),duration:day.totalDuration}]),
    productStatus:{complete:productComplete,availableSources,totalSources:projection?.sources.length??0,
      catalogVersion:catalog?.version??null,reasonCodes:[...reasons].sort()},
    statistics:{producer:'native',revision:base.revision,stale:!base.complete,
      settledThroughByDate:days.map(day=>({date:day.date,settledThroughMs:day.settledThroughMs})),
      missingDates:days.filter(day=>!day.complete).map(day=>day.date)},
    revision:await hashUsageAccountValue([base.revision,projection?.revision??null,catalog?.version??null,[...reasons].sort()])};
}

export async function receiveApplicationProductProjection(db:D1Database,machine:MachineSelfResponse,
  manifestId:string,value:unknown,nowMs:number) {
  const stored=await db.prepare(`SELECT s.manifest_json,s.state FROM runtime_application_account_manifests_v1 s
    JOIN runtime_machines_v2 m ON m.id=s.machine_id WHERE s.id=?1 AND s.machine_id=?2 AND s.account_id=?3
      AND m.account_id=?3 AND m.revoked_at_ms IS NULL`).bind(manifestId,machine.machineId,machine.accountId)
    .first<{manifest_json:string;state:string}>();
  if(!stored||machine.revoked) return fail(404,'APPLICATION_ACCOUNT_NOT_FOUND');
  if(stored.state!=='received') return fail(409,'APPLICATION_PRODUCT_BASE_PENDING');
  const base=await verifyApplicationInstanceAccountManifest(JSON.parse(stored.manifest_json));
  const chunks=await db.prepare(`SELECT chunk_index,rows_json FROM runtime_application_account_chunks_v1
    WHERE manifest_id=? ORDER BY chunk_index LIMIT 100`).bind(manifestId).all<{chunk_index:number;rows_json:string}>();
  if(chunks.results.length!==base.chunkCount||chunks.results.some((chunk,index)=>chunk.chunk_index!==index))
    return fail(409,'APPLICATION_ACCOUNT_CHUNKS_MISSING');
  const rows=parseApplicationInstanceAccountRows(chunks.results.flatMap(chunk=>JSON.parse(chunk.rows_json)));
  const projection=await verifyApplicationProductStatisticsProjection(value,base,rows);
  if(projection.generatedAtMs>nowMs+300000) return fail(400,'APPLICATION_PRODUCT_PROJECTION_INVALID_TIME');
  const catalogRow=await db.prepare(`SELECT payload_json FROM runtime_application_knowledge_versions_v1
    WHERE account_id=? AND version=?`).bind(machine.accountId,projection.catalogVersion).first<{payload_json:string}>();
  if(!catalogRow&&projection.catalogVersion!==0) return fail(409,'APPLICATION_PRODUCT_CATALOG_UNAVAILABLE');
  const catalog=catalogRow?parseApplicationKnowledgeV4(JSON.parse(catalogRow.payload_json)):null;
  const known=new Set(catalog?.products.map(product=>product.id)??[]),subjects=new Set(rows.map(row=>row.subjectKey));
  for(const row of projection.rows) if(row.kind==='subject') {
    if(row.subjectKey!.startsWith('product:')?!known.has(row.subjectKey!.slice(8)):!subjects.has(row.subjectKey))
      return fail(400,'APPLICATION_PRODUCT_SUBJECT_INVALID');
  }
  const payload=canonicalUsageAccountJson(projection);
  if(new TextEncoder().encode(payload).byteLength>APPLICATION_PRODUCT_PROJECTION_MAX_BYTES) return fail(413,'BODY_TOO_LARGE');
  await db.prepare(`INSERT INTO runtime_application_product_projections_v1
    (manifest_id,revision,projection_hash,payload_json,received_at_ms)
    SELECT ?1,?2,?3,?4,?5 WHERE NOT EXISTS(SELECT 1 FROM runtime_application_product_projections_v1 WHERE manifest_id=?1 AND revision>?2)
    ON CONFLICT(manifest_id,revision) DO NOTHING`).bind(manifestId,projection.revision,projection.projectionHash,payload,nowMs).run();
  const saved=await db.prepare(`SELECT projection_hash FROM runtime_application_product_projections_v1 WHERE manifest_id=? AND revision=?`)
    .bind(manifestId,projection.revision).first<{projection_hash:string}>();
  if(!saved) return fail(409,'APPLICATION_PRODUCT_PROJECTION_STALE_REVISION');
  if(saved.projection_hash!==projection.projectionHash) return fail(409,'APPLICATION_PRODUCT_PROJECTION_REVISION_CONFLICT');
  return verifyApplicationProductProjectionReceipt({manifestId,revision:projection.revision,
    projectionHash:saved.projection_hash,received:true},manifestId,projection);
}
