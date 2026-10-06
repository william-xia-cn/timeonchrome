import { requireAccountModule, requireMachine } from './auth';
import { routeApplicationAccounts } from './applicationAccounts';
import { applicationSharedQuotaUploadReady, receiveApplicationSharedQuota, applicationSharedQuotaSourceKey } from './applicationSharedQuota';
import { computerUsageReadPage } from '@timeonchrome/app-runtime-contracts/computer-usage';
import type { SharedQuotaStateV1 } from '@timeonchrome/app-runtime-contracts/shared-access';
import { resolveRuntimeOsVersion } from '@timeonchrome/app-runtime-contracts';
import { routeSharedWebSourceBinding, parseMachineWebSourceProof } from './sharedWebSourceBinding';
import { commitUninstallOperation, readUninstallReceipt } from './uninstallOperations';
import { machineUsageCorrections } from './applicationUsageCorrections';
import { readPersistentApplicationUsage } from './applicationStatistics';
import { readNativeApplicationStatisticsRangeSeconds } from './applicationStatisticsNative';
import { requireApplicationLegacyEnabled, readApplicationLedgerRetirement } from './applicationLedgerRetirement';
import { SOURCE_STATISTICS_READ_CAPABILITY, validateSourceStatisticsQuery, validateSourceStatisticsSnapshot } from '@timeonchrome/app-runtime-contracts/source-statistics';
import { readApplicationSourceStatistics } from './sourceStatistics';
import { getApplicationKnowledge, knowledgeEtag, listApplicationInventory, parseKnowledge,
  putApplicationKnowledge, syncApplicationInventory, knowledgeImportPreview, approveKnowledgeImport,
  applyKnowledgeOperation } from './applicationKnowledge';
import { errorResponse, HttpError, jsonResponse, methodNotAllowed, readJsonBody } from './http';
import { retireLegacyDevice } from './repository';
import {
  acknowledgePolicy,
  authorizeUninstall,
  createMachinePairingCode,
  createUninstallCode,
  enrollMachine,
  getMachinePolicy,
  listAccountMachines,
  listMachineUsers,
  persistMachineSegments,
  persistAccountingUsageSegments,
  persistAccountingMediaSegments,
  queryAccounting,
  queryAccountUsage,
  recordMachineHeartbeat,
  revokeMachine,
  syncMachineUsers,
  updateDefaultAssignment,
  updateUserAssignment,
} from './v2Repository';
import {
  isRecord,
  parseEnrollDevice,
  parseMachinePairing,
  parseMachineUpload,
  parseMachineMediaUpload,
  parseMachineUsers,
} from './validation';
import {
  appPolicyEtag,
  getAppPolicy,
  parseAppPolicyUpdate,
  parseCursor,
  putAppPolicy,
  queryAppCatalog,
  queryClassificationRecords,
  queryRuntimeLogs,
  querySegmentDetails,
} from './appPolicy';
import {
  getLoggingPolicy,
  loggingPolicyEtag,
  parseLoggingPolicyUpdate,
  parseTerminalLogs,
  persistTerminalLogs,
  putLoggingPolicy,
  runtimeLogCategories,
} from './terminalLogging';

const policyStates = new Set(['pending', 'cached', 'applied', 'failed', 'offline']);

async function readSharedAccessPolicy(env: Env, accountId: string, childId: string): Promise<Record<string, unknown>> {
  if (!env.GUARDIAN_COMPUTER_USAGE) {
    throw new HttpError(503, 'SHARED_ACCESS_POLICY_UNAVAILABLE', '统一访问配置服务暂不可用。');
  }
  let response: Response;
  try {
    response = await env.GUARDIAN_COMPUTER_USAGE.fetch(new Request('https://guardian-capability/readSharedAccessPolicy', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId, childId }),
    }));
  } catch {
    throw new HttpError(503, 'SHARED_ACCESS_POLICY_UNAVAILABLE', '统一访问配置服务暂不可用。');
  }
  if (!response.ok) throw new HttpError(response.status === 404 ? 404 : 503,
    response.status === 404 ? 'CHILD_NOT_FOUND' : 'SHARED_ACCESS_POLICY_UNAVAILABLE', '统一访问配置服务暂不可用。');
  let result: { policy?: Record<string, unknown> };
  try { result = await response.json() as typeof result; }
  catch { throw new HttpError(503, 'SHARED_ACCESS_POLICY_UNAVAILABLE', '统一访问配置响应无效。'); }
  const policy = result.policy;
  if (!policy || policy.schemaVersion !== 1 || typeof policy.revision !== 'string'
    || !Number.isSafeInteger(policy.effectiveAtMs)
    || !['legacy', 'shadow', 'shared'].includes(String(policy.stage))
    || !isRecord(policy.dailyMinutes) || !isRecord(policy.timeWindows) || !isRecord(policy.autonomy)) {
    throw new HttpError(503, 'SHARED_ACCESS_POLICY_UNAVAILABLE', '统一访问配置响应无效。');
  }
  return policy;
}

function isSharedQuotaState(value: unknown): value is SharedQuotaStateV1 {
  const exactKeys=(record:Record<string,unknown>,keys:readonly string[])=>
    Object.keys(record).length===keys.length&&keys.every(key=>Object.hasOwn(record,key));
  if (!isRecord(value) || !exactKeys(value,['schemaVersion','policyRevision','revision','computedAtMs','settledAtMs',
    'complete','reasonCodes','sources','day','week','offline']) || value.schemaVersion !== 1
    || typeof value.policyRevision !== 'string' || !value.policyRevision
    || typeof value.revision !== 'string' || !value.revision || !Number.isSafeInteger(value.computedAtMs)
    || Number(value.computedAtMs) < 0
    || !(value.settledAtMs === null || (Number.isSafeInteger(value.settledAtMs) && Number(value.settledAtMs) >= 0))
    || typeof value.complete !== 'boolean' || !Array.isArray(value.reasonCodes)
    || !value.reasonCodes.every(code => typeof code === 'string') || !Array.isArray(value.sources)
    || typeof value.offline !== 'boolean' || !isRecord(value.day) || !isRecord(value.week)) return false;
  const buckets = ['study', 'composite', 'rest'] as const;
  const used = value.day.usedMs, remaining = value.day.remainingMs;
  if (!exactKeys(value.day,['date','usedMs','remainingMs','borrowedRestMs'])
    || !exactKeys(value.week,['fromDate','toDate','complete','reasonCodes','restUsedMs','restRemainingMs'])
    || typeof value.day.date !== 'string' || !isRecord(used) || !exactKeys(used,buckets) || !isRecord(remaining)
    || !exactKeys(remaining,buckets)
    || !buckets.every(bucket => Number.isSafeInteger(used[bucket]) && Number(used[bucket]) >= 0
      && (remaining[bucket] === null || (Number.isSafeInteger(remaining[bucket]) && Number(remaining[bucket]) >= 0)))
    || !Number.isSafeInteger(value.day.borrowedRestMs) || Number(value.day.borrowedRestMs) < 0
    || typeof value.week.fromDate !== 'string' || typeof value.week.toDate !== 'string'
    || typeof value.week.complete !== 'boolean' || !Array.isArray(value.week.reasonCodes)
    || !value.week.reasonCodes.every(code => typeof code === 'string')
    || !Number.isSafeInteger(value.week.restUsedMs) || Number(value.week.restUsedMs) < 0
    || !(value.week.restRemainingMs === null || (Number.isSafeInteger(value.week.restRemainingMs)
      && Number(value.week.restRemainingMs) >= 0))) return false;
  const dayDate=value.day.date as string;
  return value.sources.every(source => isRecord(source) && exactKeys(source,['source','sourceKey','date','revision'])
    && (source.source === 'web' || source.source === 'application') && typeof source.sourceKey === 'string' && !!source.sourceKey
    && source.date === dayDate && typeof source.revision === 'string' && !!source.revision);
}

async function readSharedQuotaState(env: Env, accountId: string, childId: string, date: string): Promise<SharedQuotaStateV1> {
  if (!env.GUARDIAN_COMPUTER_USAGE) {
    throw new HttpError(503, 'SHARED_QUOTA_STATE_UNAVAILABLE', '共享用量状态服务暂不可用。');
  }
  let response: Response;
  try {
    response = await env.GUARDIAN_COMPUTER_USAGE.fetch(new Request('https://guardian-capability/readSharedQuotaState', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ accountId, childId, date }),
    }));
  } catch {
    throw new HttpError(503, 'SHARED_QUOTA_STATE_UNAVAILABLE', '共享用量状态服务暂不可用。');
  }
  if (!response.ok) {
    let code = 'SHARED_QUOTA_STATE_UNAVAILABLE';
    try { code = String((await response.json() as { code?: unknown }).code || code); } catch { /* Stable fallback below. */ }
    throw new HttpError(response.status === 400 && code === 'INVALID_DATE' ? 400
      : response.status === 404 ? 403 : 503,
    response.status === 400 && code === 'INVALID_DATE' ? 'INVALID_DATE'
      : response.status === 404 ? 'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE' : 'SHARED_QUOTA_STATE_UNAVAILABLE',
    '共享用量状态暂不可用。');
  }
  let body: { state?: unknown };
  try { body = await response.json() as typeof body; }
  catch { throw new HttpError(503, 'SHARED_QUOTA_STATE_UNAVAILABLE', '共享用量状态响应无效。'); }
  if (!isSharedQuotaState(body.state)) throw new HttpError(503, 'SHARED_QUOTA_STATE_UNAVAILABLE', '共享用量状态响应无效。');
  // Bind both periods to this read; a well-shaped reply for another date is not usable.
  const dayStart = Date.parse(`${date}T00:00:00+08:00`);
  const weekday = new Date(dayStart + 28_800_000).getUTCDay();
  const monday = new Date(dayStart - ((weekday + 6) % 7) * 86_400_000 + 28_800_000).toISOString().slice(0, 10);
  if (body.state.day.date !== date || body.state.week.toDate !== date || body.state.week.fromDate !== monday) {
    throw new HttpError(503, 'SHARED_QUOTA_STATE_UNAVAILABLE', '共享用量状态范围无效。');
  }
  return body.state;
}

export async function routeV2(request: Request, env: Env, nowMs: number, defer?:(work:Promise<unknown>)=>void): Promise<Response | null> {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/v2/') && url.pathname !== '/v1/devices/self/retire') return null;

  if (url.pathname === '/v1/devices/self/retire') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const { requireDevice } = await import('./auth');
    const device = await requireDevice(request, env.RUNTIME_DB, nowMs);
    await retireLegacyDevice(env.RUNTIME_DB, device.deviceId, nowMs);
    return jsonResponse({ success: true });
  }

  if (url.pathname.startsWith('/v2/module/')) {
    const claims = await requireAccountModule(request, env, nowMs);
    if (url.pathname.startsWith('/v2/module/application-knowledge/')) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const childIds=claims.children.map(child=>child.id), body=await readJsonBody(request);
      if (url.pathname.endsWith('/import-preview')) {
        const preview=await knowledgeImportPreview(env.RUNTIME_DB,claims.account_id,childIds,body);
        const { incoming: _incoming, ...publicPreview }=preview;
        return jsonResponse(publicPreview);
      }
      const result=url.pathname.endsWith('/import-approve')
        ? await approveKnowledgeImport(env.RUNTIME_DB,claims.account_id,childIds,request.headers.get('if-match'),body,nowMs)
        : url.pathname.endsWith('/operations')
          ? await applyKnowledgeOperation(env.RUNTIME_DB,claims.account_id,childIds,request.headers.get('if-match'),body,nowMs)
          : null;
      return result?jsonResponse(result,{headers:{etag:knowledgeEtag(result.version)}}):null;
    }
    if (url.pathname === '/v2/module/application-knowledge') {
      if (request.method === 'GET') {
        const knowledge = await getApplicationKnowledge(env.RUNTIME_DB, claims.account_id);
        return jsonResponse(knowledge, { headers: { etag: knowledgeEtag(knowledge.version) } });
      }
      if (request.method === 'PUT') {
        const childIds = claims.children.map(child => child.id);
        const knowledge = await putApplicationKnowledge(env.RUNTIME_DB, claims.account_id, childIds,
          request.headers.get('if-match'), parseKnowledge(await readJsonBody(request), childIds), nowMs);
        return jsonResponse(knowledge, { headers: { etag: knowledgeEtag(knowledge.version) } });
      }
      return methodNotAllowed('GET, PUT');
    }
    if (url.pathname === '/v2/module/application-inventory') {
      return request.method === 'GET'
        ? jsonResponse({ observations: await listApplicationInventory(env.RUNTIME_DB, claims.account_id) })
        : methodNotAllowed('GET');
    }
    const requireChild = (): string => {
      const childId = url.searchParams.get('childId') || '';
      if (!claims.children.some((child) => child.id === childId)) {
        throw new HttpError(404, 'CHILD_NOT_FOUND', 'Child was not found.');
      }
      return childId;
    };
    if (url.pathname === '/v2/module/shared-access-policy') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      return jsonResponse({ policy: await readSharedAccessPolicy(env, claims.account_id, childId) });
    }
    const requireRange = (maximumDays = 31): { fromMs: number; toMs: number } => {
      const fromMs = Number(url.searchParams.get('fromMs'));
      const toMs = Number(url.searchParams.get('toMs'));
      if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs < 0
        || toMs <= fromMs || toMs - fromMs > maximumDays * 86_400_000) {
        throw new HttpError(400, 'INVALID_RANGE', 'Usage range is invalid.');
      }
      return { fromMs, toMs };
    };
    if (url.pathname === '/v2/module/computer-usage') {
      if(request.method!=='GET')return methodNotAllowed('GET');
      const childId=requireChild();
      if(!env.GUARDIAN_COMPUTER_USAGE)throw new HttpError(503,'COMPUTER_USAGE_UNAVAILABLE','统一统计服务尚未连接。');
      const from=url.searchParams.get('from')||'',to=url.searchParams.get('to')||'';
      const start=Date.parse(`${from}T00:00:00+08:00`),end=Date.parse(`${to}T00:00:00+08:00`);
      if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(start)||!Number.isFinite(end)
        ||end<start||end-start>6*86400000||new Date(start+8*3600000).toISOString().slice(0,10)!==from||new Date(end+8*3600000).toISOString().slice(0,10)!==to)
        throw new HttpError(400,'INVALID_RANGE','日期范围最多七天。');
      const binding=env.GUARDIAN_COMPUTER_USAGE as unknown as {getComputerUsage(accountId:string,childId:string,from:string,to:string,computer?:string,summaryOnly?:boolean):Promise<import('@timeonchrome/app-runtime-contracts/computer-usage').ComputerUsageResult>;getIndependentUsage(accountId:string,childId:string,from:string,to:string,source:string):Promise<unknown>;getComputerUsageStatisticsSeconds?(accountId:string,childId:string,from:string,to:string):Promise<import('@timeonchrome/app-runtime-contracts/computer-usage').ComputerUsageStatisticsSummaryV2 & {revision:string}>};
      const unit=url.searchParams.get('durationUnit');
      if(unit!==null&&!['seconds','milliseconds'].includes(unit))throw new HttpError(400,'INVALID_DURATION_UNIT','统计单位无效。');
      const source=url.searchParams.get('source');
      if(source&&unit==='seconds')throw new HttpError(400,'INVALID_SOURCE','独立来源请使用对应统计接口。');
      if(source){if(!['application','web','media'].includes(source))throw new HttpError(400,'INVALID_SOURCE','统计来源无效。');return jsonResponse(await binding.getIndependentUsage(claims.account_id,childId,from,to,source));}
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
      if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
        throw new HttpError(400,'INVALID_CURSOR','时间线分页无效。');
      const detail=url.searchParams.get('detail')||'summary';
      if(!['summary','timeline','products'].includes(detail)||detail!=='summary'&&!url.searchParams.get('revision')||offset>0&&!url.searchParams.get('revision'))
        throw new HttpError(400,'INVALID_CURSOR','明细须使用同一汇总版本。');
      const expected=url.searchParams.get('revision'),product=url.searchParams.get('product');
      const revisionPattern=unit==='seconds'?/^computer-v2:[a-f0-9]{64}$/:/^computer-v1:[a-f0-9]{64}$/;
      if(expected&&!revisionPattern.test(expected)||product&&detail!=='timeline')
        throw new HttpError(400,'INVALID_CURSOR','明细请求无效。');
      if(unit==='seconds'){
        if(!binding.getComputerUsageStatisticsSeconds)throw new HttpError(503,'COMPUTER_USAGE_UNAVAILABLE','秒统计读取尚未接通。');
        const snapshot=await binding.getComputerUsageStatisticsSeconds(claims.account_id,childId,from,to);
        if(expected&&expected!==snapshot.revision)throw new HttpError(409,'COMPUTER_USAGE_VERSION_CHANGED','统一统计已更新，请重新读取。');
        if(detail!=='summary'||offset!==0)throw new HttpError(503,'COMPUTER_USAGE_DETAIL_NOT_READY','秒统计明细尚未接通。');
        return jsonResponse(snapshot);
      }
      const snapshot=await binding.getComputerUsage(claims.account_id,childId,from,to,url.searchParams.get('computer')||undefined,detail==='summary');
      if(url.searchParams.has('revision')&&url.searchParams.get('revision')!==snapshot.revision)
        throw new HttpError(409,'COMPUTER_USAGE_VERSION_CHANGED','统一统计已更新，请重新读取。');
      try{return jsonResponse(computerUsageReadPage(snapshot,detail as 'summary'|'timeline'|'products',expected||undefined,offset,limit,product||undefined));}
      catch(error){if(error instanceof Error&&['INVALID_PRODUCT','INVALID_PRODUCT_DETAIL','INVALID_PAGINATION'].includes(error.message))
        throw new HttpError(400,error.message,'明细请求无效。');throw error;}
    }
    if (url.pathname === '/v2/module/app-policy') {
      const childId = requireChild();
      if (request.method === 'GET') {
        const policy = await getAppPolicy(env.RUNTIME_DB, claims.account_id, childId);
        return jsonResponse(policy, { headers: { etag: appPolicyEtag(policy.version) } });
      }
      if (request.method === 'PUT') {
        const update = parseAppPolicyUpdate(await readJsonBody(request));
        const policy = await putAppPolicy(env.RUNTIME_DB, claims.account_id, childId,
          request.headers.get('if-match'), update, nowMs);
        return jsonResponse(policy, { headers: { etag: appPolicyEtag(policy.version) } });
      }
      return methodNotAllowed('GET, PUT');
    }
    if (url.pathname === '/v2/module/logging-policy') {
      const machineId = url.searchParams.get('machineId') || '';
      if (!machineId) throw new HttpError(400, 'INVALID_REQUEST', 'machineId is required.');
      if (request.method === 'GET') {
        const policy = await getLoggingPolicy(env.RUNTIME_DB, claims.account_id, machineId);
        return policy ? jsonResponse(policy, { headers: { etag: loggingPolicyEtag(machineId, policy.version) } })
          : errorResponse(404, 'MACHINE_NOT_FOUND', 'Machine was not found.');
      }
      if (request.method === 'PUT') {
        const update = parseLoggingPolicyUpdate(await readJsonBody(request), nowMs);
        const policy = await putLoggingPolicy(env.RUNTIME_DB, claims.account_id, machineId,
          request.headers.get('if-match'), update, nowMs);
        return policy ? jsonResponse(policy, { headers: { etag: loggingPolicyEtag(machineId, policy.version) } })
          : errorResponse(404, 'MACHINE_NOT_FOUND', 'Machine was not found.');
      }
      return methodNotAllowed('GET, PUT');
    }
    if (url.pathname === '/v2/module/app-classification-records') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      const platform = url.searchParams.get('platform');
      if (platform != null && platform !== 'windows' && platform !== 'macos') {
        throw new HttpError(400, 'INVALID_PLATFORM', 'Platform is invalid.');
      }
      return jsonResponse(await queryClassificationRecords(
        env.RUNTIME_DB, claims.account_id, childId, nowMs, platform || undefined,
      ));
    }
    if (url.pathname === '/v2/module/app-catalog') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      const platform = url.searchParams.get('platform');
      if (platform != null && platform !== 'windows' && platform !== 'macos') {
        throw new HttpError(400, 'INVALID_PLATFORM', 'Platform is invalid.');
      }
      return jsonResponse(await queryAppCatalog(
        env.RUNTIME_DB, claims.account_id, childId, nowMs, platform || undefined,
      ));
    }
    if (url.pathname === '/v2/module/app-usage') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      const range = requireRange();
      const platform = url.searchParams.get('platform');
      if (platform != null && platform !== 'windows' && platform !== 'macos') {
        throw new HttpError(400, 'INVALID_PLATFORM', 'Platform is invalid.');
      }
      const durationUnit=url.searchParams.get('durationUnit');
      if(durationUnit!==null&&durationUnit!=='seconds'&&durationUnit!=='milliseconds')
        throw new HttpError(400,'INVALID_DURATION_UNIT','统计单位无效。');
      if(durationUnit==='seconds'||await readApplicationLedgerRetirement(env.RUNTIME_DB,claims.account_id)){
        const seconds=await readNativeApplicationStatisticsRangeSeconds(
        env.RUNTIME_DB,claims.account_id,childId,range.fromMs,range.toMs,{
          machineId:url.searchParams.get('machineId')||undefined,
          localUserId:url.searchParams.get('userId')||undefined,platform:platform||undefined,
        });
        if(durationUnit==='seconds')return jsonResponse(seconds);
        // 旧响应单位仅投影新秒统计，不读取或持久化旧账。
        const ms=(value:number|null)=>value===null?null:value*1000;
        return jsonResponse({durationUnit:'milliseconds',complete:seconds.complete,
          totalDurationMs:ms(seconds.totalDuration),availableTotalDurationMs:ms(seconds.availableTotalDuration),
          categories:seconds.categories.map(row=>({classification:row.category,durationMs:ms(row.duration)})),
          applications:seconds.products.map(row=>({runtimeIdentity:row.subjectKey,displayName:row.displayName,
            classifications:row.classifications,durationMs:ms(row.duration)})),
          buckets:seconds.days.flatMap(day=>day.hours.filter(row=>row.kind==='total').map(row=>({
            startAtMs:Date.parse(`${day.date}T00:00:00+08:00`)+row.hour!*3600000,durationMs:ms(row.duration)}))),
          days:seconds.days,statistics:{producer:'native',revision:seconds.revision,stale:!seconds.complete,
            missingDates:seconds.days.filter(day=>!day.complete).map(day=>day.date)}});
      }
      const result=await readPersistentApplicationUsage(env.RUNTIME_DB, claims.account_id, childId,
        range.fromMs, range.toMs, {
          machineId: url.searchParams.get('machineId') || undefined,
          localUserId: url.searchParams.get('userId') || undefined,
          platform: platform || undefined,
        },defer,nowMs);
      return jsonResponse({...result.value,statistics:result.statistics},{headers:{'x-application-usage-cache':result.cacheStatus}});
    }
    if (url.pathname === '/v2/module/segment-diagnostics') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      const range = requireRange();
      const kind = url.searchParams.get('kind');
      if (kind !== 'usage' && kind !== 'media') {
        throw new HttpError(400, 'INVALID_DIAGNOSTIC_KIND', 'Diagnostic kind is invalid.');
      }
      const limit = Number(url.searchParams.get('limit') || 50);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
        throw new HttpError(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100.');
      }
      if ([...url.searchParams.keys()].some(key => !['childId', 'kind', 'fromMs', 'toMs', 'limit'].includes(key)
          || url.searchParams.getAll(key).length !== 1)) {
        throw new HttpError(400, 'INVALID_DIAGNOSTIC_QUERY', 'Diagnostic query is invalid.');
      }
      const result = await querySegmentDetails(env.RUNTIME_DB, claims.account_id, childId,
        kind, range.fromMs, range.toMs, limit, null);
      const items = result.items.map(item => {
        if (!isRecord(item)) throw new HttpError(500, 'INVALID_DIAGNOSTIC_RESULT', 'Diagnostic data is invalid.');
        // Do not spread records: raw identities and cursor must never reach the management component.
        return {
          startAtMs: item.startAtMs, endAtMs: item.endAtMs, durationMs: item.durationMs,
          displayName: typeof item.displayName === 'string'
            && ![item.runtimeIdentity, item.id, item.machineId, item.localUserId].includes(item.displayName)
            && !/[\\/]/.test(item.displayName) ? item.displayName : null,
          estimated: item.estimated,
          ...(kind === 'usage' ? { applicationClassification: item.applicationClassification }
            : { mediaKind: item.mediaKind, presentation: item.presentation }),
        };
      });
      return jsonResponse({ items, hasMore: result.nextCursor !== null }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (url.pathname === '/v2/module/usage-segments' || url.pathname === '/v2/module/media-segments') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      const range = requireRange();
      const requestedLimit = Number(url.searchParams.get('limit') || 50);
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
        throw new HttpError(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100.');
      }
      return jsonResponse(await querySegmentDetails(
        env.RUNTIME_DB, claims.account_id, childId,
        url.pathname.endsWith('/media-segments') ? 'media' : 'usage',
        range.fromMs, range.toMs, requestedLimit, parseCursor(url.searchParams.get('cursor')),
      ));
    }
    if (url.pathname === '/v2/module/runtime-logs') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      const range = requireRange(36_500);
      const requestedLimit = Number(url.searchParams.get('limit') || 50);
      const level = url.searchParams.get('level');
      const category = url.searchParams.get('category');
      if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 100) {
        throw new HttpError(400, 'INVALID_LIMIT', 'Limit must be between 1 and 100.');
      }
      if (level != null && !['error', 'warning', 'info'].includes(level)) {
        throw new HttpError(400, 'INVALID_LOG_LEVEL', 'Log level is invalid.');
      }
      if (category != null && !runtimeLogCategories.includes(category as typeof runtimeLogCategories[number])) {
        throw new HttpError(400, 'INVALID_LOG_CATEGORY', 'Log category is invalid.');
      }
      return jsonResponse(await queryRuntimeLogs(
        env.RUNTIME_DB, claims.account_id, childId, range.fromMs, range.toMs,
        requestedLimit, parseCursor(url.searchParams.get('cursor')), {
          machineId: url.searchParams.get('machineId') || undefined,
          level: (level || undefined) as 'error' | 'warning' | 'info' | undefined,
          category: (category || undefined) as typeof runtimeLogCategories[number] | undefined,
        },
      ));
    }
    if (url.pathname === '/v2/module/pairing-codes') {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const input = parseMachinePairing(await readJsonBody(request));
      try {
        return jsonResponse(await createMachinePairingCode(
          env.RUNTIME_DB, claims, input.defaultChildId, input.displayName, nowMs,
        ), { status: 201 });
      } catch (error) {
        if (error instanceof Error && error.message === 'CHILD_NOT_FOUND') {
          throw new HttpError(404, 'CHILD_NOT_FOUND', 'Child was not found.');
        }
        throw error;
      }
    }
    if (url.pathname === '/v2/module/machines') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      return jsonResponse(await listAccountMachines(env.RUNTIME_DB, claims.account_id, nowMs));
    }
    if (url.pathname === '/v2/module/usage') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = url.searchParams.get('childId') || '';
      if (!claims.children.some((child) => child.id === childId)) throw new HttpError(404, 'CHILD_NOT_FOUND', 'Child was not found.');
      const fromMs = Number(url.searchParams.get('fromMs'));
      const toMs = Number(url.searchParams.get('toMs'));
      if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs < 0
        || toMs <= fromMs || toMs - fromMs > 31 * 86_400_000) {
        throw new HttpError(400, 'INVALID_RANGE', 'Usage range is invalid.');
      }
      return jsonResponse(await queryAccountUsage(env.RUNTIME_DB, claims.account_id, childId,
        fromMs, toMs, url.searchParams.get('machineId') || undefined,
        url.searchParams.get('userId') || undefined));
    }
    if (url.pathname === '/v2/module/accounting') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = url.searchParams.get('childId') || '';
      if (!claims.children.some((child) => child.id === childId)) {
        throw new HttpError(404, 'CHILD_NOT_FOUND', 'Child was not found.');
      }
      const fromMs = Number(url.searchParams.get('fromMs'));
      const toMs = Number(url.searchParams.get('toMs'));
      if (!Number.isSafeInteger(fromMs) || !Number.isSafeInteger(toMs) || fromMs < 0
        || toMs <= fromMs || toMs - fromMs > 31 * 86_400_000) {
        throw new HttpError(400, 'INVALID_RANGE', 'Accounting range is invalid.');
      }
      return jsonResponse(await queryAccounting(
        env.RUNTIME_DB,
        claims.account_id,
        childId,
        fromMs,
        toMs,
        url.searchParams.get('machineId') || undefined,
        url.searchParams.get('userId') || undefined,
      ));
    }
    const usersMatch = url.pathname.match(/^\/v2\/module\/machines\/([^/]+)\/users$/u);
    if (usersMatch) {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const result = await listMachineUsers(env.RUNTIME_DB, claims.account_id, decodeURIComponent(usersMatch[1]!));
      return result ? jsonResponse(result) : errorResponse(404, 'MACHINE_NOT_FOUND', 'Machine was not found.');
    }
    const defaultMatch = url.pathname.match(/^\/v2\/module\/machines\/([^/]+)\/default-assignment$/u);
    if (defaultMatch) {
      if (request.method !== 'PATCH') return methodNotAllowed('PATCH');
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.childId !== 'string') throw new HttpError(400, 'INVALID_REQUEST', 'Assignment is invalid.');
      const result = await updateDefaultAssignment(env.RUNTIME_DB, claims, decodeURIComponent(defaultMatch[1]!), body.childId, nowMs);
      return result ? jsonResponse(result) : errorResponse(404, 'MACHINE_OR_CHILD_NOT_FOUND', 'Machine or Child was not found.');
    }
    const userMatch = url.pathname.match(/^\/v2\/module\/machines\/([^/]+)\/users\/([^/]+)$/u);
    if (userMatch) {
      if (request.method !== 'PATCH') return methodNotAllowed('PATCH');
      const body = await readJsonBody(request);
      if (!isRecord(body) || typeof body.protected !== 'boolean'
        || (body.childId != null && typeof body.childId !== 'string')) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Assignment is invalid.');
      }
      const result = await updateUserAssignment(env.RUNTIME_DB, claims,
        decodeURIComponent(userMatch[1]!), decodeURIComponent(userMatch[2]!),
        { protected: body.protected, childId: body.childId ?? null }, nowMs);
      return result ? jsonResponse(result) : errorResponse(404, 'MACHINE_USER_OR_CHILD_NOT_FOUND', 'Machine, user, or Child was not found.');
    }
    const actionMatch = url.pathname.match(/^\/v2\/module\/machines\/([^/]+)\/(revoke|uninstall-codes)$/u);
    if (actionMatch) {
      if (request.method !== 'POST') return methodNotAllowed('POST');
      const machineId = decodeURIComponent(actionMatch[1]!);
      if (actionMatch[2] === 'revoke') {
        return await revokeMachine(env.RUNTIME_DB, claims.account_id, machineId, nowMs)
          ? jsonResponse({ success: true }) : errorResponse(404, 'MACHINE_NOT_FOUND', 'Machine was not found.');
      }
      const result = await createUninstallCode(env.RUNTIME_DB, claims, machineId, nowMs);
      return result ? jsonResponse(result, { status: 201 }) : errorResponse(404, 'MACHINE_NOT_FOUND', 'Machine was not found.');
    }
    return errorResponse(404, 'NOT_FOUND', 'Route was not found.');
  }

  if (url.pathname === '/v2/machines/enroll') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const result = await enrollMachine(env.RUNTIME_DB, parseEnrollDevice(await readJsonBody(request)), nowMs);
    if (result) {
      const { replayed, ...body } = result;
      return jsonResponse(body, { status: replayed ? 200 : 201 });
    }
    return errorResponse(401, 'ENROLLMENT_INVALID', 'Enrollment code is invalid, expired, or consumed.');
  }

  if (url.pathname.startsWith('/v2/uninstall-operations/')) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const result = await readUninstallReceipt(env.RUNTIME_DB,
      url.pathname.slice('/v2/uninstall-operations/'.length), request.headers.get('authorization') ?? '', nowMs);
    return result ? jsonResponse(result)
      : errorResponse(404, 'UNINSTALL_RESULT_UNAVAILABLE', 'Uninstall result is unavailable.');
  }

  // Heartbeat records activity only after the complete payload passes validation.
  if (url.pathname.startsWith('/v2/machines/application-accounts/')) {
    return routeApplicationAccounts(request, env.RUNTIME_DB, await requireMachine(request, env.RUNTIME_DB, nowMs, false), nowMs);
  }
  const machine = await requireMachine(request, env.RUNTIME_DB, nowMs,
    url.pathname !== '/v2/machines/heartbeat' && url.pathname !== '/v2/machines/shared-quota/execution-basis'
      && url.pathname !== '/v2/machines/source-statistics'
      && !url.pathname.startsWith('/v2/machines/shared-web-source/'));
  if(url.pathname==='/v2/machines/source-statistics'){
    if(request.method!=='POST')return methodNotAllowed('POST');
    const localUserId=url.searchParams.get('localUserId')??'',text=url.searchParams.get('assignmentVersion')??'',assignmentVersion=Number(text);
    if([...url.searchParams.keys()].some(k=>!['localUserId','assignmentVersion'].includes(k))||url.searchParams.getAll('localUserId').length!==1
      ||url.searchParams.getAll('assignmentVersion').length!==1||!/^[A-Za-z0-9_-]{32,128}$/.test(localUserId)||!/^[1-9][0-9]*$/.test(text)||!Number.isSafeInteger(assignmentVersion))
      throw new HttpError(400,'SOURCE_STATISTICS_INVALID','统计范围无效。');
    const readAssignment=()=>env.RUNTIME_DB.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
      WHERE a.machine_id=?1 AND a.local_user_id=?2 AND a.assignment_version=?3 AND a.protected=1 AND a.child_id IS NOT NULL
      AND NOT EXISTS(SELECT 1 FROM runtime_user_assignments_v2 n WHERE n.machine_id=a.machine_id AND n.local_user_id=a.local_user_id AND n.assignment_version>a.assignment_version)`)
      .bind(machine.machineId,localUserId,assignmentVersion).first<{child_id:string}>();
    const assignment=await readAssignment();if(!assignment)throw new HttpError(403,'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE','当前用户没有有效孩子分配。');
    let query;try{query=validateSourceStatisticsQuery(await readJsonBody(request,2048));}catch{throw new HttpError(400,'SOURCE_STATISTICS_INVALID','统计查询无效。');}
    const ownKey=await applicationSharedQuotaSourceKey(machine.machineId,localUserId,assignmentVersion);
    if(query.source==='web'&&query.scope!=='all'||query.scope==='other'&&(query.ownSourceKeys?.length!==1||query.ownSourceKeys[0]!==ownKey))
      throw new HttpError(403,'SOURCE_STATISTICS_SCOPE_MISMATCH','只能排除本机实际包含的来源。');
    let value:unknown;
    if(query.source==='application')value=await readApplicationSourceStatistics(env.RUNTIME_DB,machine.accountId,assignment.child_id,query,nowMs);
    else{
      const response=await env.GUARDIAN_COMPUTER_USAGE.fetch(new Request('https://guardian-capability/readSourceStatistics',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:machine.accountId,childId:assignment.child_id,query})}));
      if(!response.ok)throw new HttpError(503,'SOURCE_STATISTICS_UNAVAILABLE','网页统计暂不可读。');
      // 复用有界JSON读取，Service Binding也不能接受无上界响应。
      const reader=response.body?.getReader();if(!reader)throw new HttpError(503,'SOURCE_STATISTICS_UNAVAILABLE','网页统计暂不可读。');
      const chunks:Uint8Array[]=[];let size=0;while(true){const c=await reader.read();if(c.done)break;size+=c.value.byteLength;
        if(size>65536){await reader.cancel();throw new HttpError(503,'SOURCE_STATISTICS_RESPONSE_LIMIT','统计响应过大。');}chunks.push(c.value);}
      const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.byteLength;}value=JSON.parse(new TextDecoder().decode(bytes));
    }
    const current=await readAssignment();const currentMachine=await requireMachine(request,env.RUNTIME_DB,nowMs,false);
    if(current?.child_id!==assignment.child_id||currentMachine.machineId!==machine.machineId||currentMachine.accountId!==machine.accountId)
      throw new HttpError(409,'SOURCE_STATISTICS_CONTEXT_CHANGED','读取期间孩子分配已变化。');
    return jsonResponse(validateSourceStatisticsSnapshot(value,{source:query.source,childId:assignment.child_id,fromDate:query.fromDate,toDate:query.toDate}));
  }
  if(url.pathname==='/v2/machines/shared-web-source/challenge'||url.pathname==='/v2/machines/shared-web-source/verification-key'
    ||url.pathname==='/v2/machines/shared-web-source/scope')
    return routeSharedWebSourceBinding(request,env,machine,nowMs);
  if (url.pathname === '/v2/machines/shared-quota/execution-basis') {
    if(request.method!=='GET')return methodNotAllowed('GET');
    const allowed=['localUserId','assignmentVersion','date','offset','limit','revision'];
    const seen=new Set<string>();
    for(const key of url.searchParams.keys()){
      if(!allowed.includes(key)||seen.has(key))throw new HttpError(400,'INVALID_REQUEST','Execution scope is invalid.');
      seen.add(key);
    }
    const localUserId=url.searchParams.get('localUserId')??'',assignmentText=url.searchParams.get('assignmentVersion')??'';
    const assignmentVersion=Number(assignmentText),date=url.searchParams.get('date')??'';
    const offsetText=url.searchParams.get('offset')??'0',limitText=url.searchParams.get('limit')??'50';
    const offset=Number(offsetText),limit=Number(limitText),expectedRevision=url.searchParams.get('revision');
    const start=Date.parse(date+'T00:00:00Z');
    if(!/^[A-Za-z0-9_-]{32,128}$/.test(localUserId)||!/^[1-9][0-9]*$/.test(assignmentText)
      ||!Number.isSafeInteger(assignmentVersion)||!/^(0|[1-9][0-9]*)$/.test(offsetText)
      ||!Number.isSafeInteger(offset)||offset>1400||!/^[1-9][0-9]*$/.test(limitText)||limit>100
      ||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!Number.isFinite(start)||new Date(start).toISOString().slice(0,10)!==date
      ||(expectedRevision!==null&&!/^[a-f0-9]{64}$/.test(expectedRevision))||(offset>0&&expectedRevision===null))
      throw new HttpError(400,'INVALID_REQUEST','Execution scope is invalid.');
    const readAssignment=()=>env.RUNTIME_DB.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
      WHERE a.machine_id=?1 AND a.local_user_id=?2 AND a.assignment_version=?3 AND a.protected=1 AND a.child_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM runtime_user_assignments_v2 newer WHERE newer.machine_id=a.machine_id
          AND newer.local_user_id=a.local_user_id AND newer.assignment_version>a.assignment_version)`)
      .bind(machine.machineId,localUserId,assignmentVersion).first<{child_id:string}>();
    const assignment=await readAssignment();
    if(!assignment)throw new HttpError(403,'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE','Assignment is unavailable.');
    if(!env.GUARDIAN_COMPUTER_USAGE)throw new HttpError(503,'SHARED_EXECUTION_BASIS_UNAVAILABLE','Execution basis is unavailable.');
    const ownSourceKey=await applicationSharedQuotaSourceKey(machine.machineId,localUserId,assignmentVersion);
    const webSourceProof=await parseMachineWebSourceProof(request,machine,assignment.child_id,assignmentVersion,ownSourceKey);
    let result:unknown;
    try{
      const response=await env.GUARDIAN_COMPUTER_USAGE.fetch(new Request('https://guardian-capability/readSharedQuotaExecutionBasis',{
        method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:machine.accountId,
          childId:assignment.child_id,date,ownSourceKey,offset,limit,expectedRevision,...(webSourceProof?{webSourceProof}:{})})}));
      if(!response.ok)throw new HttpError(response.status===409?409:response.status===400?400:response.status===404?403:503,
        response.status===409?'EXECUTION_BASIS_VERSION_CHANGED':response.status===400?'INVALID_EXECUTION_CURSOR'
          :response.status===404?'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE':'SHARED_EXECUTION_BASIS_UNAVAILABLE','Execution basis is unavailable.');
      const reader=response.body?.getReader();
      if(!reader)throw Error('empty');
      const chunks:Uint8Array[]=[];let size=0;
      try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;
        if(size>262144){await reader.cancel();throw Error('oversize');}chunks.push(chunk.value);}}
      finally{reader.releaseLock();}
      const bytes=new Uint8Array(size);let position=0;for(const chunk of chunks){bytes.set(chunk,position);position+=chunk.length;}
      result=JSON.parse(new TextDecoder().decode(bytes));
    }catch(error){if(error instanceof HttpError)throw error;
      throw new HttpError(503,'SHARED_EXECUTION_BASIS_UNAVAILABLE','Execution basis is unavailable.');}
    const fields=['schemaVersion','profileId','basisRevision','policyRevision','fromDate','toDate','days','authorizedScopes','page'];
    if(!isRecord(result)||Object.keys(result).length!==fields.length||Object.keys(result).some(key=>!fields.includes(key))
      ||result.schemaVersion!==1||result.profileId!==assignment.child_id||result.toDate!==date
      ||typeof result.basisRevision!=='string'||!/^[a-f0-9]{64}$/.test(result.basisRevision)
      ||(expectedRevision!==null&&result.basisRevision!==expectedRevision)
      ||!isRecord(result.page)||result.page.offset!==offset||result.page.limit!==limit
      ||!Array.isArray(result.authorizedScopes)||result.authorizedScopes.length>(webSourceProof?14:7)
      ||result.authorizedScopes.some(scope=>!isRecord(scope)||Object.keys(scope).length!==3
        ||!(scope.source==='application'&&scope.sourceKey===ownSourceKey
          ||webSourceProof&&scope.source==='web'&&scope.sourceKey===webSourceProof.claims.webSourceKey)||typeof scope.date!=='string'))
      throw new HttpError(503,'SHARED_EXECUTION_BASIS_UNAVAILABLE','Execution basis response is invalid.');
    const currentMachine=await requireMachine(request,env.RUNTIME_DB,nowMs,false),currentAssignment=await readAssignment();
    if(currentMachine.machineId!==machine.machineId||currentMachine.accountId!==machine.accountId
      ||currentAssignment?.child_id!==assignment.child_id)
      throw new HttpError(409,'SHARED_ACCESS_BINDING_CHANGED','Execution binding changed.');
    return jsonResponse(result);
  }
  if (url.pathname === '/v2/machines/shared-access-policy') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const localUserId=url.searchParams.get('localUserId');
    const assignmentVersion=Number(url.searchParams.get('assignmentVersion'));
    if (!localUserId||localUserId.length<32||localUserId.length>128||!/^[A-Za-z0-9_-]+$/u.test(localUserId)
      ||!Number.isSafeInteger(assignmentVersion)||assignmentVersion<1)
      throw new HttpError(400,'INVALID_REQUEST','Shared access scope is invalid.');
    const assignment=await env.RUNTIME_DB.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
      WHERE a.machine_id=?1 AND a.local_user_id=?2 AND a.assignment_version=?3
        AND a.protected=1 AND a.child_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM runtime_user_assignments_v2 newer
          WHERE newer.machine_id=a.machine_id AND newer.local_user_id=a.local_user_id
            AND newer.assignment_version>a.assignment_version)`)
      .bind(machine.machineId,localUserId,assignmentVersion).first<{child_id:string}>();
    if (!assignment) throw new HttpError(403,'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE','Assignment is unavailable.');
    return jsonResponse({ policy: await readSharedAccessPolicy(env, machine.accountId, assignment.child_id) });
  }
  if (url.pathname === '/v2/machines/shared-quota/state') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const localUserId=url.searchParams.get('localUserId');
    const assignmentVersion=Number(url.searchParams.get('assignmentVersion'));
    const date=url.searchParams.get('date')||new Date(Date.now()+28_800_000).toISOString().slice(0,10);
    const dayStart=Date.parse(`${date}T00:00:00+08:00`);
    if (!localUserId || localUserId.length<32 || localUserId.length>128 || !/^[A-Za-z0-9_-]+$/u.test(localUserId)
      || !Number.isSafeInteger(assignmentVersion) || assignmentVersion<1
      || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date) || !Number.isFinite(dayStart)
      || new Date(dayStart+28_800_000).toISOString().slice(0,10)!==date)
      throw new HttpError(400,'INVALID_REQUEST','Shared quota scope is invalid.');
    const assignment=await env.RUNTIME_DB.prepare(`SELECT a.child_id FROM runtime_user_assignments_v2 a
      WHERE a.machine_id=?1 AND a.local_user_id=?2 AND a.assignment_version=?3
        AND a.protected=1 AND a.child_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM runtime_user_assignments_v2 newer
          WHERE newer.machine_id=a.machine_id AND newer.local_user_id=a.local_user_id
            AND newer.assignment_version>a.assignment_version)`)
      .bind(machine.machineId,localUserId,assignmentVersion).first<{child_id:string}>();
    if (!assignment) throw new HttpError(403,'SHARED_ACCESS_ASSIGNMENT_UNAVAILABLE','Assignment is unavailable.');
    return jsonResponse({sharedQuota:await readSharedQuotaState(env,machine.accountId,assignment.child_id,date)});
  }
  if (url.pathname === '/v2/machines/shared-quota/capabilities') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return jsonResponse({protocol:'application-shared-quota-v1',schemaVersion:1,
      capabilities:[SOURCE_STATISTICS_READ_CAPABILITY],
      enabled:await applicationSharedQuotaUploadReady(env.RUNTIME_DB)});
  }
  if (url.pathname === '/v2/machines/shared-quota/application-contributions') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    if (!await applicationSharedQuotaUploadReady(env.RUNTIME_DB))
      throw new HttpError(503,'SHARED_QUOTA_UPLOAD_UNAVAILABLE','Shared quota receipt storage is not ready.');
    return jsonResponse(await receiveApplicationSharedQuota(env.RUNTIME_DB, machine,
      await readJsonBody(request,16_384), nowMs));
  }
  if (url.pathname === '/v2/machines/app-usage-corrections') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return jsonResponse(await machineUsageCorrections(env.RUNTIME_DB, machine, url.searchParams.get('after')));
  }
  if (url.pathname === '/v2/machines/application-inventory') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    return jsonResponse(await syncApplicationInventory(env.RUNTIME_DB, machine.accountId, machine.machineId,
      machine.platform, await readJsonBody(request), nowMs));
  }
  if (url.pathname === '/v2/machines/self') {
    return request.method === 'GET' ? jsonResponse(machine) : methodNotAllowed('GET');
  }
  if (url.pathname === '/v2/machines/users') {
    if (request.method !== 'PUT') return methodNotAllowed('PUT');
    const desiredPolicyVersion = await syncMachineUsers(
      env.RUNTIME_DB, machine, parseMachineUsers(await readJsonBody(request)), nowMs,
    );
    return jsonResponse({ success: true, desiredPolicyVersion });
  }
  if (url.pathname === '/v2/machines/policy') {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    const result = await getMachinePolicy(env.RUNTIME_DB, machine);
    if (request.headers.get('if-none-match') === result.etag) return new Response(null, { status: 304, headers: { etag: result.etag } });
    return jsonResponse(result.policy, { headers: { etag: result.etag } });
  }
  if (url.pathname === '/v2/machines/policy-ack') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const body = await readJsonBody(request);
    if (!isRecord(body) || !Number.isSafeInteger(body.version) || typeof body.state !== 'string'
      || !policyStates.has(body.state) || (body.error != null && typeof body.error !== 'string')) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Policy acknowledgement is invalid.');
    }
    const users = Array.isArray(body.users) ? body.users.map((user) => {
      if (!isRecord(user) || typeof user.localUserId !== 'string' || typeof user.state !== 'string' || !policyStates.has(user.state)) {
        throw new HttpError(400, 'INVALID_REQUEST', 'Policy user acknowledgement is invalid.');
      }
      return { localUserId: user.localUserId, state: user.state as 'pending' | 'cached' | 'applied' | 'failed' | 'offline' };
    }) : undefined;
    return await acknowledgePolicy(env.RUNTIME_DB, machine, {
      version: Number(body.version), state: body.state as 'pending' | 'cached' | 'applied' | 'failed' | 'offline',
      error: body.error as string | null | undefined, users,
    }, nowMs) ? jsonResponse({ success: true }) : errorResponse(409, 'POLICY_VERSION_INVALID', 'Policy version is invalid.');
  }
  if (url.pathname === '/v2/machines/heartbeat') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const body = await readJsonBody(request, 16_384);
    if (!isRecord(body)) throw new HttpError(400, 'INVALID_REQUEST', 'Heartbeat is invalid.');
    for (const field of ['serviceVersion', 'architecture'] as const) {
      if (typeof body[field] !== 'string' || body[field].length < 1 || body[field].length > 128) {
        throw new HttpError(400, 'INVALID_REQUEST', `${field} is invalid.`);
      }
    }
    const version=resolveRuntimeOsVersion(machine.platform,body);
    if(!version.ok) throw new HttpError(400,version.code,'Operating system version is invalid or conflicting.');
    if (!Number.isSafeInteger(body.tamperCount) || Number(body.tamperCount) < 0
      || typeof body.policyState !== 'string' || !policyStates.has(body.policyState)) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Heartbeat state is invalid.');
    }
    if (body.capabilities !== undefined && (!Array.isArray(body.capabilities)
      || body.capabilities.length > 16 || body.capabilities.some(item => typeof item !== 'string'
        || item.length < 1 || item.length > 64))) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Heartbeat capabilities are invalid.');
    }
    await recordMachineHeartbeat(env.RUNTIME_DB, machine, {
      serviceVersion: String(body.serviceVersion), osVersion: version.osVersion,
      architecture: String(body.architecture), tamperCount: Number(body.tamperCount),
      policyState: body.policyState as 'pending' | 'cached' | 'applied' | 'failed' | 'offline',
      capabilities: Array.isArray(body.capabilities) ? body.capabilities as string[] : [],
    }, nowMs);
    return jsonResponse({ success: true, nextHeartbeatSeconds: 300, policyPollSeconds: 60 });
  }
  if (url.pathname === '/v2/segments:upload') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    await requireApplicationLegacyEnabled(env.RUNTIME_DB,machine.accountId);
    const parsed = parseMachineUpload(await readJsonBody(request), machine.platform);
    const legacy = await persistMachineSegments(env.RUNTIME_DB, machine, parsed.envelopes, nowMs);
    const accounting = await persistAccountingUsageSegments(
      env.RUNTIME_DB, machine, parsed.accountingEnvelopes, nowMs,
    );
    return jsonResponse({
      acceptedIds: [...legacy.acceptedIds, ...accounting.acceptedIds],
      rejected: [...parsed.rejected, ...legacy.rejected, ...accounting.rejected],
    });
  }
  if (url.pathname === '/v2/media-segments:upload') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const parsed = parseMachineMediaUpload(await readJsonBody(request), machine.platform);
    const result = await persistAccountingMediaSegments(env.RUNTIME_DB, machine, parsed.envelopes, nowMs);
    return jsonResponse({ acceptedIds: result.acceptedIds, rejected: [...parsed.rejected, ...result.rejected] });
  }
  if (url.pathname === '/v2/terminal-logs:upload') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const parsed = parseTerminalLogs(await readJsonBody(request, 131_072));
    const result = await persistTerminalLogs(env.RUNTIME_DB, machine, parsed.logs, nowMs);
    return jsonResponse({ acceptedIds: result.acceptedIds, rejected: [...parsed.rejected, ...result.rejected] });
  }
  if (url.pathname === '/v2/machines/uninstall') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const body = await readJsonBody(request);
    if (!isRecord(body) || typeof body.code !== 'string') throw new HttpError(400, 'INVALID_REQUEST', 'Uninstall code is invalid.');
    return await authorizeUninstall(env.RUNTIME_DB, machine, body.code, nowMs)
      ? jsonResponse({ authorized: true }) : errorResponse(401, 'UNINSTALL_CODE_INVALID', 'Uninstall code is invalid, expired, or consumed.');
  }
  if (url.pathname === '/v2/machines/uninstall-operations') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const body = await readJsonBody(request, 4096);
    if (!isRecord(body) || typeof body.operationId !== 'string' || typeof body.code !== 'string'
      || typeof body.confirmationSecretHash !== 'string') {
      throw new HttpError(400, 'INVALID_REQUEST', 'Uninstall operation is invalid.');
    }
    const result = await commitUninstallOperation(env.RUNTIME_DB, machine, {
      operationId: body.operationId, code: body.code, confirmationSecretHash: body.confirmationSecretHash,
    }, nowMs);
    return result ? jsonResponse(result)
      : errorResponse(401, 'UNINSTALL_CODE_INVALID', 'Uninstall code is invalid, expired, or consumed.');
  }
  return errorResponse(404, 'NOT_FOUND', 'Route was not found.');
}
