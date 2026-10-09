import { parseProgramInstanceRegistrationBatch, parseProductOwnershipEvidence, buildProgramInstanceProductMapping,
  parseProgramInstanceRegistrationReceipt,
  parseProgramInstanceMappingReadRequest, parseProgramInstanceMappingReadResponse,
  type ProgramInstanceMappingReadRequest, type ProgramInstanceMappingReadResponse,
  type ProgramInstanceRegistrationBatch } from '@timeonchrome/app-runtime-contracts/classification';
import { parseApplicationKnowledgeV4, parseProgramInstanceProjectionContext, ApplicationContractError } from '@timeonchrome/app-runtime-contracts/classification-validation';
import { programInstanceId } from '@timeonchrome/app-runtime-contracts/application-ledger';
import { canonicalUsageAccountJson, hashUsageAccountValue } from '@timeonchrome/app-runtime-contracts/usage-account';
import type { MachineSelfResponse } from './contracts';
import { HttpError } from './http';
import { isRecord } from './validation';
import {readProgramInstallationSummaries} from './programInstallationLinks';
import {readRecentProgramInstanceUsage} from './programInstanceStatistics';
import {getAppPolicy} from './appPolicy';
import {buildProgramInstanceExecutionPolicy} from './productBlockPolicy';
import {sha256Hex} from './crypto';

const fail = (status: number, code: string): never => { throw new HttpError(status, code, code); };

/** 读取同一权威目录，不把旧格式静默转换为新规则，也不在读取时写映射。 */
export async function readProgramInstanceCatalog(db:D1Database,accountId:string) {
  const stored=await db.prepare(`SELECT version,payload_json FROM runtime_application_knowledge_versions_v1
    WHERE account_id=? ORDER BY version DESC LIMIT 1`).bind(accountId)
    .first<{version:number;payload_json:string}>();
  if(!stored)return {state:'empty' as const,version:0,catalog:null};
  try {
    const payload:unknown=JSON.parse(stored.payload_json);
    if(!isRecord(payload)||payload.version!==stored.version) return fail(503,'PROGRAM_INSTANCE_CATALOG_INVALID');
    if(payload.schemaVersion!==4) {
      if(![1,2,3].includes(Number(payload.schemaVersion)))return fail(503,'PROGRAM_INSTANCE_CATALOG_INVALID');
      return {state:'legacy' as const,version:stored.version,catalog:null};
    }
    return {state:'available' as const,version:stored.version,catalog:parseApplicationKnowledgeV4(payload)};
  } catch {return fail(503,'PROGRAM_INSTANCE_CATALOG_INVALID');}
}

/** 家长浏览第三层及采集证据；没有写映射或读时匹配的旁路。 */
export async function listChildProgramInstances(db:D1Database,accountId:string,childId:string,afterInstanceId:string|null) {
  if(afterInstanceId!==null&&!/^[a-f0-9]{64}$/.test(afterInstanceId)) return fail(400,'INVALID_INSTANCE_CURSOR');
  type Row={instance_id:string;machine_id:string;platform:'windows'|'macos';evidence_json:string;
    evidence_revision:number;updated_at_ms:number;mapped_evidence_revision:number|null;rule_set_version:number|null;
    status:'confirmed'|'unresolved'|'conflict'|null;product_id:string|null};
  type CatalogRow={version:number;payload_json:string};
  const results=await db.batch<Row|CatalogRow>([
    db.prepare(`SELECT version,payload_json FROM runtime_application_knowledge_versions_v1
      WHERE account_id=? ORDER BY version DESC LIMIT 1`).bind(accountId),
    db.prepare(`SELECT p.instance_id,p.machine_id,m.platform,p.evidence_json,p.evidence_revision,p.updated_at_ms,
        r.evidence_revision AS mapped_evidence_revision,r.rule_set_version,r.status,r.product_id
      FROM runtime_program_instances_v1 p JOIN runtime_machines_v2 m ON m.id=p.machine_id
      LEFT JOIN runtime_program_instance_mappings_v1 r ON r.machine_id=p.machine_id AND r.instance_id=p.instance_id AND r.child_id=?2
      WHERE m.account_id=?1 AND (?3 IS NULL OR p.instance_id>?3)
        AND EXISTS(SELECT 1 FROM runtime_program_instance_scopes_v1 s
          WHERE s.machine_id=p.machine_id AND s.instance_id=p.instance_id AND s.child_id=?2)
      ORDER BY p.instance_id LIMIT 51`).bind(accountId,childId,afterInstanceId),
  ]);
  const stored=results[0].results.find((row):row is CatalogRow=>'payload_json' in row);
  const payload:unknown=stored?JSON.parse(stored.payload_json):null;
  const catalog=isRecord(payload)&&payload.schemaVersion===4?parseApplicationKnowledgeV4(payload):null;
  if(catalog&&catalog.version!==stored?.version) return fail(500,'PROGRAM_INSTANCE_CATALOG_INVALID');
  const rows=results[1].results.filter((row):row is Row=>'instance_id' in row);
  const installations=await readProgramInstallationSummaries(db,accountId,childId,
    rows.slice(0,50).map(row=>({machineId:row.machine_id,instanceId:row.instance_id})));
  const items=rows.slice(0,50).map(row=>{
    const current=catalog&&row.rule_set_version===catalog.version&&row.mapped_evidence_revision===row.evidence_revision;
    const product=current&&row.product_id?catalog.products.find(product=>product.id===row.product_id):undefined;
    const status=current&&row.status&&(row.status!=='confirmed'||product)?row.status:'pending';
    return {instanceId:row.instance_id,machineId:row.machine_id,platform:row.platform,
      evidenceRevision:row.evidence_revision,evidence:parseProductOwnershipEvidence(JSON.parse(row.evidence_json)),
      updatedAtMs:row.updated_at_ms,status,product:status==='confirmed'?{id:product!.id,name:product!.name}:null,
      installation:installations.get(row.instance_id)!};
  });
  return {schemaVersion:1,childId,catalogVersion:catalog?.version??null,items,
    nextAfterInstanceId:rows.length>50?items[items.length-1].instanceId:null};
}

/** 产品主目录范围在云端组装；不在浏览器重新识别或遍历全部实例。 */
export async function readChildProgramDirectory(db:D1Database,accountId:string,childId:string,nowMs:number) {
  const result=await readProgramInstanceCatalog(db,accountId);
  if(result.state!=='available'||!result.catalog)return fail(409,'PROGRAM_INSTANCE_CATALOG_NOT_AVAILABLE');
  const instances:Awaited<ReturnType<typeof listChildProgramInstances>>['items']=[];
  let cursor:string|null=null;
  do {
    const page=await listChildProgramInstances(db,accountId,childId,cursor);
    if(page.catalogVersion!==result.version)return fail(409,'PROGRAM_DIRECTORY_VERSION_CHANGED');
    instances.push(...page.items);cursor=page.nextAfterInstanceId;
    if(cursor&&instances.length>=1000)return fail(503,'PROGRAM_DIRECTORY_INSTANCE_LIMIT');
  }while(cursor);
  const usage=await readRecentProgramInstanceUsage(db,accountId,childId,nowMs).catch(error=>({
    state:'unavailable' as const,reasonCode:error instanceof HttpError?error.code:'APPLICATION_DIRECTORY_USAGE_UNAVAILABLE',
    subjects:[] as {subjectKey:string;lastUsedDate:string}[],fromDate:null,toDate:null}));
  const recent=new Map(usage.subjects.map(item=>[item.subjectKey,item.lastUsedDate]));
  type Fact={productId:string;platform:'windows'|'macos';instanceCount:number;installationObserved:boolean;
    usageObserved:boolean;lastUsedDate:string|null};
  const facts=new Map<string,Fact>();
  for(const instance of instances) {
    if(instance.status!=='confirmed'||!instance.product)continue;
    const key=JSON.stringify([instance.product.id,instance.platform]);
    const fact=facts.get(key)??{productId:instance.product.id,platform:instance.platform,instanceCount:0,
      installationObserved:false,usageObserved:false,lastUsedDate:null};
    fact.instanceCount++;
    if(instance.installation.state==='available'&&instance.installation.latestScanEntryCount>0)fact.installationObserved=true;
    const date=recent.get('instance:'+instance.instanceId);
    if(date){fact.usageObserved=true;if(!fact.lastUsedDate||date>fact.lastUsedDate)fact.lastUsedDate=date;}
    facts.set(key,fact);
  }
  const latest=await db.prepare('SELECT MAX(version) AS version FROM runtime_application_knowledge_versions_v1 WHERE account_id=?')
    .bind(accountId).first<{version:number|null}>();
  if(latest?.version!==result.version)return fail(409,'PROGRAM_DIRECTORY_VERSION_CHANGED');
  return {schemaVersion:1,childId,catalogVersion:result.version,
    installationState:instances.some(item=>item.installation.state!=='available')?'partial':'available',
    usage:{state:usage.state,fromDate:usage.fromDate,toDate:usage.toDate,
      reasonCode:'reasonCode' in usage?usage.reasonCode:null},
    facts:[...facts.values()],unidentifiedInstanceCount:instances.filter(item=>item.status!=='confirmed').length};
}

/** 有界只读预览；复用正式匹配器，但不把预览结果保存到第三层。 */
export async function previewProgramInstanceCatalog(db:D1Database,accountId:string,childIds:readonly string[],
  childId:string,expected:string|null,input:unknown,afterInstanceId:string|null) {
  if(!childIds.includes(childId))return fail(404,'CHILD_NOT_FOUND');
  if(!isRecord(input)||Object.keys(input).length!==1||!Object.hasOwn(input,'catalog'))return fail(400,'INVALID_CATALOG_PREVIEW');
  const proposed=(()=>{try{return parseApplicationKnowledgeV4(input.catalog);}catch{return fail(400,'INVALID_CATALOG_PREVIEW');}})();
  if(proposed.bindings.some(binding=>!childIds.includes(binding.childId)))return fail(404,'CHILD_NOT_FOUND');
  const current=await readProgramInstanceCatalog(db,accountId);
  if(expected!==`"application-knowledge-v${current.version}"`)return fail(412,'APPLICATION_KNOWLEDGE_CONFLICT');
  const page=await listChildProgramInstances(db,accountId,childId,afterInstanceId);
  if((current.state==='available'?current.version:null)!==page.catalogVersion)return fail(412,'APPLICATION_KNOWLEDGE_CONFLICT');
  const latest=await db.prepare('SELECT MAX(version) AS version FROM runtime_application_knowledge_versions_v1 WHERE account_id=?')
    .bind(accountId).first<{version:number|null}>();
  if((latest?.version??0)!==current.version)return fail(412,'APPLICATION_KNOWLEDGE_CONFLICT');
  const preview=buildProgramInstanceProductMapping(childId,current.version,proposed.products.map(product=>product.id),
    proposed.ownershipRules,page.items.map(item=>({instanceId:item.instanceId,evidence:item.evidence})));
  return {schemaVersion:1,preview:true,childId,catalogVersion:current.version,
    items:page.items.map(item=>({instanceId:item.instanceId,evidenceRevision:item.evidenceRevision,
      before:{status:item.status,productId:item.product?.id??null},
      after:preview.items.find(result=>result.instanceId===item.instanceId)!})),
    nextAfterInstanceId:page.nextAfterInstanceId};
}

/** 调用者提供家长鉴权后的家庭及孩子集合；目录、审计与执行策略原子保存，映射由有界恢复任务重建。 */
export async function saveProgramInstanceCatalog(db:D1Database,accountId:string,childIds:readonly string[],
  expected:string|null,input:unknown,nowMs:number) {
  const next=(()=>{try {return parseApplicationKnowledgeV4(input);} catch(error) {
    if(error instanceof ApplicationContractError) return fail(400,error.code);
    throw error;
  }})();
  if(!Number.isSafeInteger(nowMs)||nowMs<0) return fail(400,'INVALID_CATALOG_TIME');
  if(next.bindings.some(binding=>!childIds.includes(binding.childId))) return fail(404,'CHILD_NOT_FOUND');
  const current=await db.prepare(`SELECT version,payload_json,payload_hash FROM runtime_application_knowledge_versions_v1
    WHERE account_id=? ORDER BY version DESC LIMIT 1`).bind(accountId)
    .first<{version:number;payload_json:string;payload_hash:string}>();
  if(expected!==`"application-knowledge-v${current?.version??0}"`) return fail(412,'APPLICATION_KNOWLEDGE_CONFLICT');
  // 产品身份编辑不同时扩大进程结束权限。既有强化线索可保留或删除，不新增。
  const old:unknown=current?JSON.parse(current.payload_json):null;
  const oldProducts=isRecord(old)&&Array.isArray(old.products)?old.products:[];
  const oldBindings=isRecord(old)&&Array.isArray(old.bindings)?old.bindings:[];
  for(const product of next.products) for(const hint of product.suspectedMatchers??[]) {
    const prior=oldProducts.find(p=>isRecord(p)&&p.id===product.id);
    if(!isRecord(prior)||!Array.isArray(prior.suspectedMatchers)
      ||!prior.suspectedMatchers.some(h=>canonicalUsageAccountJson(h)===canonicalUsageAccountJson(hint)))
      return fail(400,'UNREVIEWED_PRODUCT_BLOCK_MATCHER');
  }
  for(const binding of next.bindings) for(const product of binding.products) if(product.enhancedBlocking) {
    const prior=oldBindings.find(b=>isRecord(b)&&b.childId===binding.childId);
    if(!isRecord(prior)||!Array.isArray(prior.products)
      ||!prior.products.some(p=>isRecord(p)&&p.productId===product.productId&&p.enhancedBlocking===true))
      return fail(400,'PRODUCT_BLOCK_APPROVAL_REQUIRED');
  }
  next.version=(current?.version??0)+1;
  const payload=canonicalUsageAccountJson(next),hash=await hashUsageAccountValue(next);
  const executionStatements:D1PreparedStatement[]=[];
  // Missing is not an explicit unblock. A removed product can be represented
  // by a retained, empty Child binding without fabricating a missing scope.
  for(const prior of oldBindings) if(isRecord(prior)&&typeof prior.childId==='string'
    &&childIds.includes(prior.childId)&&!next.bindings.some(binding=>binding.childId===prior.childId))
    return fail(409,'PROGRAM_INSTANCE_EXECUTION_SCOPE_MISSING');
  for(const binding of next.bindings) {
    const currentPolicy=await getAppPolicy(db,accountId,binding.childId);
    const {version:policyVersion,effectiveAtMs:previousEffectiveAt,...unchanged}=currentPolicy;
    const policyBody=canonicalUsageAccountJson({...unchanged,
      programInstanceExecutionPolicy:buildProgramInstanceExecutionPolicy(next,binding.childId)});
    executionStatements.push(db.prepare(`INSERT INTO runtime_child_app_policy_versions_v1
      (account_id,child_id,version,payload_json,payload_hash,effective_at_ms,created_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?6)`)
      .bind(accountId,binding.childId,policyVersion+1,policyBody,await sha256Hex(policyBody),nowMs));
  }
  // Reuse the existing family catalog refresh convention; one increment per
  // machine, even when several of its users belong to different children.
  if(executionStatements.length) {
  executionStatements.push(db.prepare(`UPDATE runtime_machines_v2 SET desired_policy_version=desired_policy_version+1,
    policy_state='pending',policy_error=NULL,updated_at_ms=?2 WHERE account_id=?1 AND revoked_at_ms IS NULL`)
    .bind(accountId,nowMs));
  executionStatements.push(db.prepare(`INSERT INTO runtime_machine_policy_versions_v2(machine_id,version,payload_hash,created_at_ms)
    SELECT id,desired_policy_version,?2,?3 FROM runtime_machines_v2 WHERE account_id=?1 AND revoked_at_ms IS NULL`)
    .bind(accountId,hash,nowMs));
  }
  try {
    await db.batch([
      db.prepare(`INSERT INTO runtime_application_knowledge_versions_v1
        (account_id,version,payload_json,payload_hash,created_at_ms) VALUES(?1,?2,?3,?4,?5)`)
        .bind(accountId,next.version,payload,hash,nowMs),
      db.prepare(`INSERT INTO runtime_application_knowledge_audit_v1
        (account_id,version,action,previous_hash,next_hash,created_at_ms) VALUES(?1,?2,'publish',?3,?4,?5)`)
        .bind(accountId,next.version,current?.payload_hash??null,hash,nowMs),
      ...executionStatements,
    ]);
  } catch(error) {
    if(error instanceof Error && /UNIQUE constraint failed: runtime_(application_knowledge_(versions|audit)_v1|child_app_policy_versions_v1|machine_policy_versions_v2)/.test(error.message))
      return fail(412,'APPLICATION_KNOWLEDGE_CONFLICT');
    throw error;
  }
  return next;
}
interface MappingReadRow {
  instance_id: string; evidence_revision: number; mapped_evidence_revision: number | null;
  rule_set_version: number | null; status: 'confirmed' | 'unresolved' | 'conflict' | null;
  product_id: string | null;
}

/** 只读已生成映射；旧分配不可用于当前连接，未识别不阻断基础用量。 */
async function loadProgramInstanceMappings(db: D1Database, machine: MachineSelfResponse, input: unknown) {
  let value:ProgramInstanceMappingReadRequest;
  try { value=parseProgramInstanceMappingReadRequest(input); }
  catch { return fail(400,'INVALID_PROGRAM_INSTANCE_MAPPING_READ'); }
  if (machine.revoked) return fail(403,'PROGRAM_INSTANCE_ASSIGNMENT_UNAVAILABLE');
  const results = await db.batch<MappingReadRow | {version:number;payload_json:string} | {child_id:string}>([
    db.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a JOIN runtime_machines_v2 m ON m.id=a.machine_id
      WHERE m.id=?1 AND m.account_id=?2 AND m.platform=?3 AND m.revoked_at_ms IS NULL
        AND a.local_user_id=?4 AND a.assignment_version=?5 AND a.protected=1 AND a.child_id=?6
        AND a.assignment_version=(SELECT MAX(assignment_version) FROM runtime_user_assignments_v2 WHERE machine_id=?1 AND local_user_id=?4)`)
      .bind(machine.machineId,machine.accountId,machine.platform,value.localUserId,value.assignmentVersion,value.childId),
    db.prepare(`SELECT version,payload_json FROM runtime_application_knowledge_versions_v1 WHERE account_id=? ORDER BY version DESC LIMIT 1`)
      .bind(machine.accountId),
    db.prepare(`SELECT p.instance_id,p.evidence_revision,r.evidence_revision AS mapped_evidence_revision,
        r.rule_set_version,r.status,r.product_id
      FROM runtime_program_instances_v1 p LEFT JOIN runtime_program_instance_mappings_v1 r
        ON r.machine_id=p.machine_id AND r.instance_id=p.instance_id AND r.child_id=?2
      WHERE p.machine_id=?1 AND p.instance_id IN (SELECT value FROM json_each(?3))
        AND EXISTS(SELECT 1 FROM runtime_program_instance_scopes_v1 s WHERE s.machine_id=p.machine_id
          AND s.instance_id=p.instance_id AND s.child_id=?2 AND s.local_user_id=?4 AND s.assignment_version=?5)`)
      .bind(machine.machineId,value.childId,JSON.stringify(value.instanceIds),value.localUserId,value.assignmentVersion),
  ]);
  if (!results[0].results.length) return fail(403,'PROGRAM_INSTANCE_ASSIGNMENT_UNAVAILABLE');
  const stored = results[1].results.find((row): row is {version:number;payload_json:string} => 'payload_json' in row);
  const payload: unknown = stored ? JSON.parse(stored.payload_json) : null;
  const catalog = isRecord(payload) && payload.schemaVersion === 4 ? parseApplicationKnowledgeV4(payload) : null;
  if (catalog && catalog.version !== stored?.version) return fail(500,'PROGRAM_INSTANCE_CATALOG_INVALID');
  const rows = results[2].results.filter((row): row is MappingReadRow => 'instance_id' in row);
  if (rows.length !== value.instanceIds.length) return fail(404,'PROGRAM_INSTANCE_SCOPE_MISSING');
  const items = rows.map(row => {
    const current = catalog && row.rule_set_version === catalog.version && row.mapped_evidence_revision === row.evidence_revision;
    const product = current && row.product_id ? catalog.products.find(p => p.id === row.product_id) : undefined;
    const status = current && row.status && (row.status !== 'confirmed' || product) ? row.status : 'pending';
    return {instanceId:row.instance_id,evidenceRevision:row.evidence_revision,status,
      productId:status === 'confirmed' ? row.product_id : null};
  }).sort((a,b)=>a.instanceId.localeCompare(b.instanceId));
  const productIds = new Set(items.flatMap(item=>item.productId ? [item.productId] : []));
  const response=parseProgramInstanceMappingReadResponse({schemaVersion:1,childId:value.childId,assignmentVersion:value.assignmentVersion,
    catalogVersion:catalog?.version ?? null,items,
    products:catalog?.products.filter(p=>productIds.has(p.id)).map(p=>({id:p.id,name:p.name})) ?? []},value);
  return {response,catalog,request:value};
}
export async function readProgramInstanceMappings(db:D1Database,machine:MachineSelfResponse,input:unknown):Promise<ProgramInstanceMappingReadResponse> {
  return (await loadProgramInstanceMappings(db,machine,input)).response;
}
export async function readProgramInstanceProjectionContext(db:D1Database,machine:MachineSelfResponse,input:unknown) {
  const {response,catalog,request}=await loadProgramInstanceMappings(db,machine,input);
  const productIds=new Set(response.products.map(product=>product.id));
  const binding=catalog?.bindings.find(binding=>binding.childId===response.childId);
  const rules=(catalog?.rules??[]).filter(rule=>binding?.ruleIds.includes(rule.id)&&(!rule.productId||productIds.has(rule.productId)));
  return parseProgramInstanceProjectionContext({...response,schemaVersion:2,
    products:(catalog?.products??[]).filter(product=>productIds.has(product.id)).map(product=>({
      id:product.id,name:product.name,type:product.type,...(product.catalogGroup?{catalogGroup:product.catalogGroup}:{})})),
    rules,binding:{childId:response.childId,products:(binding?.products??[]).filter(product=>productIds.has(product.productId))
      .map(product=>({productId:product.productId,classification:product.classification})),ruleIds:rules.map(rule=>rule.id)}},request);
}
interface StoredEvidence { instance_id: string; evidence_revision: number; evidence_hash: string }
/** 统计展示身份元数据；不计算时长，不执行匹配，不把产品名写入基础行。 */
export async function readChildProgramIdentityProjection(db:D1Database,accountId:string,childId:string,subjectKeys:readonly string[]) {
  if(subjectKeys.length>10000 || new Set(subjectKeys).size!==subjectKeys.length
    || subjectKeys.some(key=>!/^(instance|observation):[a-f0-9]{64}$/.test(key))) return fail(400,'INVALID_PROGRAM_SUBJECTS');
  const instanceIds=subjectKeys.filter(key=>key.startsWith('instance:')).map(key=>key.slice(9));
  const results=await db.batch<MappingReadRow|{version:number;payload_json:string}>([
    db.prepare(`SELECT version,payload_json FROM runtime_application_knowledge_versions_v1 WHERE account_id=? ORDER BY version DESC LIMIT 1`).bind(accountId),
    db.prepare(`SELECT p.instance_id,p.evidence_revision,r.evidence_revision AS mapped_evidence_revision,
        r.rule_set_version,r.status,r.product_id FROM runtime_program_instances_v1 p
      JOIN runtime_machines_v2 m ON m.id=p.machine_id
      LEFT JOIN runtime_program_instance_mappings_v1 r ON r.machine_id=p.machine_id AND r.instance_id=p.instance_id AND r.child_id=?2
      WHERE m.account_id=?1 AND p.instance_id IN(SELECT value FROM json_each(?3))
        AND EXISTS(SELECT 1 FROM runtime_program_instance_scopes_v1 s WHERE s.machine_id=p.machine_id AND s.instance_id=p.instance_id AND s.child_id=?2)
      ORDER BY p.instance_id LIMIT 10001`).bind(accountId,childId,JSON.stringify(instanceIds)),
  ]);
  const stored=results[0].results.find((row):row is {version:number;payload_json:string}=>'payload_json' in row);
  const payload:unknown=stored?JSON.parse(stored.payload_json):null;
  const catalog=isRecord(payload)&&payload.schemaVersion===4?parseApplicationKnowledgeV4(payload):null;
  if(catalog&&catalog.version!==stored?.version) return fail(500,'PROGRAM_INSTANCE_CATALOG_INVALID');
  const rows=results[1].results.filter((row):row is MappingReadRow=>'instance_id' in row);
  if(rows.length>10000||new Set(rows.map(row=>row.instance_id)).size!==rows.length) return fail(500,'PROGRAM_INSTANCE_MAPPING_CONFLICT');
  const mappings=new Map(rows.map(row=>[row.instance_id,row]));
  const items=subjectKeys.map(subjectKey=>{
    const row=mappings.get(subjectKey.slice(9));
    const current=catalog&&row&&row.rule_set_version===catalog.version&&row.mapped_evidence_revision===row.evidence_revision;
    const product=current&&row.product_id?catalog.products.find(product=>product.id===row.product_id):undefined;
    const status=subjectKey.startsWith('observation:')?'unresolved':
      current&&row.status&&(row.status!=='confirmed'||product)?row.status:'pending';
    return {subjectKey,status,productId:status==='confirmed'?product!.id:null};
  }).sort((a,b)=>a.subjectKey.localeCompare(b.subjectKey));
  const products=(catalog?.products??[]).flatMap(product=>{
    const members=items.filter(item=>item.productId===product.id).map(item=>item.subjectKey);
    return members.length?[{id:product.id,name:product.name,subjectKeys:members}]:[];
  }).sort((a,b)=>a.id.localeCompare(b.id));
  const value={catalogVersion:catalog?.version??null,items,products};
  return {state:'available' as const,...value,revision:await hashUsageAccountValue(value)};
}

export { PROGRAM_INSTANCE_REGISTRATION_CAPABILITY } from '@timeonchrome/app-runtime-contracts/classification';
export async function programInstanceStorageReady(db: D1Database): Promise<boolean> {
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM sqlite_master WHERE
    (type='table' AND name IN ('runtime_program_instances_v1','runtime_program_instance_scopes_v1','runtime_program_instance_mappings_v1'))
    OR (type='trigger' AND name IN ('runtime_program_instance_revision_conflict_v1','runtime_program_instance_scope_insert_v1',
      'runtime_program_instance_scope_immutable_v1','runtime_program_instance_mapping_scope_v1','runtime_program_instance_mapping_key_v1'))`)
    .first<{n:number}>();
  return row?.n === 8;
}

/** 规则来自持久化目录，不允许请求直接写第三层结果。 */
export async function materializeProgramInstanceMappings(db: D1Database, accountId: string, childId: string,
  references: readonly {machineId:string; instanceId:string}[]) {
  if (!references.length || references.length > 100
    || new Set(references.map(r=>`${r.machineId}\n${r.instanceId}`)).size !== references.length)
    return fail(400,'INVALID_PROGRAM_INSTANCE_MAPPING_SCOPE');
  const stored = await db.prepare(`SELECT version,payload_json FROM runtime_application_knowledge_versions_v1
    WHERE account_id=?1 ORDER BY version DESC LIMIT 1`).bind(accountId).first<{version:number;payload_json:string}>();
  if (!stored) return {state:'catalog_unavailable' as const,updatedCount:0};
  const payload:unknown=JSON.parse(stored.payload_json);
  if (!isRecord(payload)||payload.schemaVersion!==4) return {state:'catalog_unavailable' as const,updatedCount:0};
  const catalog=parseApplicationKnowledgeV4(payload);
  if(catalog.version!==stored.version) return fail(500,'PROGRAM_INSTANCE_CATALOG_INVALID');
  const statements:D1PreparedStatement[]=[];
  for(const reference of references) {
    const evidence=await db.prepare(`SELECT p.evidence_revision,p.evidence_hash,p.evidence_json
      FROM runtime_program_instances_v1 p JOIN runtime_machines_v2 m ON m.id=p.machine_id
      WHERE m.account_id=?1 AND p.machine_id=?2 AND p.instance_id=?3
        AND EXISTS(SELECT 1 FROM runtime_program_instance_scopes_v1 s
          WHERE s.child_id=?4 AND s.machine_id=p.machine_id AND s.instance_id=p.instance_id)`)
      .bind(accountId,reference.machineId,reference.instanceId,childId)
      .first<{evidence_revision:number;evidence_hash:string;evidence_json:string}>();
    if(!evidence) return fail(404,'PROGRAM_INSTANCE_SCOPE_MISSING');
    const result=buildProgramInstanceProductMapping(childId,catalog.version,catalog.products.map(p=>p.id),catalog.ownershipRules,
      [{instanceId:reference.instanceId,evidence:parseProductOwnershipEvidence(JSON.parse(evidence.evidence_json))}]).items[0];
    statements.push(db.prepare(`INSERT INTO runtime_program_instance_mappings_v1
      (child_id,machine_id,instance_id,rule_set_version,evidence_revision,status,product_id,rule_ids_json)
      SELECT ?1,?2,?3,?4,?5,?6,?7,?8 WHERE EXISTS
        (SELECT 1 FROM runtime_program_instances_v1 WHERE machine_id=?2 AND instance_id=?3 AND evidence_revision=?5 AND evidence_hash=?9)
        AND ?4=(SELECT MAX(version) FROM runtime_application_knowledge_versions_v1 WHERE account_id=?10)
      ON CONFLICT(child_id,machine_id,instance_id) DO UPDATE SET rule_set_version=excluded.rule_set_version,
        evidence_revision=excluded.evidence_revision,status=excluded.status,product_id=excluded.product_id,rule_ids_json=excluded.rule_ids_json`)
      .bind(childId,reference.machineId,reference.instanceId,catalog.version,evidence.evidence_revision,
        result.status,result.productId,canonicalUsageAccountJson(result.ruleIds),evidence.evidence_hash,accountId));
  }
  const saved=await db.batch(statements);
  return {state:'processed' as const,updatedCount:saved.reduce((sum,item)=>sum+item.meta.changes,0)};
}

/** 从持久化版本差异恢复待处理工作；不保存第二份任务状态，不读取原账。 */
export async function refreshPendingProgramInstanceMappings(db:D1Database) {
  if(!await programInstanceStorageReady(db)) return {processedCount:0,updatedCount:0};
  const pending=await db.prepare(`WITH latest AS (
      SELECT account_id,MAX(version) AS version FROM runtime_application_knowledge_versions_v1 GROUP BY account_id)
    SELECT DISTINCT m.account_id,s.child_id,p.machine_id,p.instance_id
    FROM runtime_program_instances_v1 p
    JOIN runtime_machines_v2 m ON m.id=p.machine_id
    JOIN runtime_program_instance_scopes_v1 s ON s.machine_id=p.machine_id AND s.instance_id=p.instance_id
    JOIN latest l ON l.account_id=m.account_id
    JOIN runtime_application_knowledge_versions_v1 k ON k.account_id=l.account_id AND k.version=l.version
    LEFT JOIN runtime_program_instance_mappings_v1 r ON r.child_id=s.child_id AND r.machine_id=p.machine_id AND r.instance_id=p.instance_id
    WHERE json_extract(k.payload_json,'$.schemaVersion')=4
      AND (r.instance_id IS NULL OR r.rule_set_version<>l.version OR r.evidence_revision<>p.evidence_revision)
    ORDER BY m.account_id,s.child_id,p.machine_id,p.instance_id LIMIT 100`)
    .all<{account_id:string;child_id:string;machine_id:string;instance_id:string}>();
  const groups=new Map<string,typeof pending.results>();
  for(const row of pending.results) {
    const key=JSON.stringify([row.account_id,row.child_id]),group=groups.get(key)??[];
    group.push(row);groups.set(key,group);
  }
  let updatedCount=0;
  for(const group of groups.values()) {
    const result=await materializeProgramInstanceMappings(db,group[0].account_id,group[0].child_id,
      group.map(row=>({machineId:row.machine_id,instanceId:row.instance_id})));
    updatedCount+=result.updatedCount;
  }
  return {processedCount:pending.results.length,updatedCount};
}

/** 登记ACK与匹配结果分离；失败保留版本差异，交现有定时任务补处理。 */
export async function matchRegisteredProgramInstances(db:D1Database,machine:MachineSelfResponse,
  receipt:{childId:string;items:readonly {instanceId:string}[]}) {
  if(!receipt.items.length) return;
  try {
    await materializeProgramInstanceMappings(db,machine.accountId,receipt.childId,
      receipt.items.map(item=>({machineId:machine.machineId,instanceId:item.instanceId})));
  } catch {
    console.error(JSON.stringify({message:'program_instance_mapping_deferred',code:'PROGRAM_INSTANCE_MAPPING_RETRY_PENDING'}));
  }
}

/** 由现有机器鉴权入口调用；不接收产品归属、不改原账、不启动统计发布。 */
export async function registerProgramInstances(db: D1Database, machine: MachineSelfResponse,
  value: unknown, nowMs: number) {
  if (!isRecord(value) || typeof value.localUserId !== 'string' || value.localUserId.length > 256
    || typeof value.assignmentVersion !== 'number' || !Number.isSafeInteger(value.assignmentVersion)
    || value.assignmentVersion < 1 || !Number.isSafeInteger(nowMs) || nowMs < 0)
    return fail(400, 'INVALID_PROGRAM_INSTANCE_REGISTRATION');
  const assignment = await db.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
    JOIN runtime_machines_v2 m ON m.id=a.machine_id
    WHERE m.id=?1 AND m.account_id=?2 AND m.platform=?3 AND m.revoked_at_ms IS NULL
      AND a.local_user_id=?4 AND a.assignment_version=?5 AND a.protected=1 AND a.child_id IS NOT NULL`)
    .bind(machine.machineId, machine.accountId, machine.platform, value.localUserId, value.assignmentVersion)
    .first<{child_id: string}>();
  if (!assignment || machine.revoked) return fail(403, 'PROGRAM_INSTANCE_ASSIGNMENT_UNAVAILABLE');
  if (value.childId !== assignment.child_id) return fail(403, 'PROGRAM_INSTANCE_CHILD_SCOPE_MISMATCH');
  let batch: ProgramInstanceRegistrationBatch;
  try {
    batch = await parseProgramInstanceRegistrationBatch(value, {machineId: machine.machineId,
      childId: assignment.child_id, localUserId: value.localUserId, assignmentVersion: value.assignmentVersion});
  } catch { return fail(400, 'INVALID_PROGRAM_INSTANCE_REGISTRATION'); }
  if (batch.items.some(item => item.instance.platform !== machine.platform))
    return fail(400, 'PROGRAM_INSTANCE_PLATFORM_MISMATCH');
  if (!batch.items.length) return {schemaVersion: 1, childId: batch.childId, items: []};
  const prepared = await Promise.all(batch.items.map(async item => ({...item,
    id: await programInstanceId(item.instance), hash: await hashUsageAccountValue(item.evidence)})));
  const statements: D1PreparedStatement[] = [];
  for (const item of prepared) {
    statements.push(db.prepare(`INSERT INTO runtime_program_instances_v1
      (machine_id,instance_id,descriptor_json,evidence_revision,evidence_json,evidence_hash,updated_at_ms)
      VALUES(?1,?2,?3,?4,?5,?6,?7)
      ON CONFLICT(machine_id,instance_id) DO UPDATE SET evidence_revision=excluded.evidence_revision,
        evidence_json=excluded.evidence_json,evidence_hash=excluded.evidence_hash,updated_at_ms=excluded.updated_at_ms
      WHERE excluded.evidence_revision>runtime_program_instances_v1.evidence_revision`)
      .bind(machine.machineId, item.id, canonicalUsageAccountJson(item.instance), item.evidenceRevision,
        canonicalUsageAccountJson(item.evidence), item.hash, nowMs));
    statements.push(db.prepare(`INSERT INTO runtime_program_instance_scopes_v1
      (child_id,machine_id,instance_id,local_user_id,assignment_version) VALUES(?1,?2,?3,?4,?5)
      ON CONFLICT DO NOTHING`).bind(batch.childId, machine.machineId, item.id, batch.localUserId, batch.assignmentVersion));
  }
  for (const item of prepared) statements.push(db.prepare(`SELECT instance_id,evidence_revision,evidence_hash
    FROM runtime_program_instances_v1 WHERE machine_id=?1 AND instance_id=?2`).bind(machine.machineId,item.id));
  let results: D1Result<StoredEvidence>[];
  try { results = await db.batch<StoredEvidence>(statements); }
  catch (error) {
    if (error instanceof Error && error.message.includes('PROGRAM_INSTANCE_REVISION_CONFLICT'))
      return fail(409, 'PROGRAM_INSTANCE_REVISION_CONFLICT');
    throw error;
  }
  const items = results.slice(prepared.length * 2).map((result, index) => {
    const stored = result.results[0];
    if (!stored || stored.instance_id !== prepared[index].id) return fail(500, 'PROGRAM_INSTANCE_ACK_UNAVAILABLE');
    return {instanceId: stored.instance_id, evidenceRevision: stored.evidence_revision, evidenceHash: stored.evidence_hash};
  });
  return parseProgramInstanceRegistrationReceipt({schemaVersion: 1, childId: batch.childId, items},
    {childId:batch.childId,items:prepared.map(item=>({instanceId:item.id,evidenceRevision:item.evidenceRevision,evidenceHash:item.hash}))});
}
