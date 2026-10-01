import { requireAccountModule, requireMachine } from './auth';
import { routeApplicationAccounts } from './applicationAccounts';
import { computerUsageReadPage } from '@timeonchrome/app-runtime-contracts/computer-usage';
import { resolveRuntimeOsVersion } from '@timeonchrome/app-runtime-contracts';
import { commitUninstallOperation, readUninstallReceipt } from './uninstallOperations';
import { machineUsageCorrections } from './applicationUsageCorrections';
import { readCachedApplicationUsage } from './applicationUsageCache';
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

export async function routeV2(request: Request, env: Env, nowMs: number): Promise<Response | null> {
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
      const binding=env.GUARDIAN_COMPUTER_USAGE as unknown as {getComputerUsage(accountId:string,childId:string,from:string,to:string,computer?:string):Promise<import('@timeonchrome/app-runtime-contracts/computer-usage').ComputerUsageResult>;getIndependentUsage(accountId:string,childId:string,from:string,to:string,source:string):Promise<unknown>};
      const source=url.searchParams.get('source');
      if(source){if(!['application','web','media'].includes(source))throw new HttpError(400,'INVALID_SOURCE','统计来源无效。');return jsonResponse(await binding.getIndependentUsage(claims.account_id,childId,from,to,source));}
      const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||100);
      if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>100)
        throw new HttpError(400,'INVALID_CURSOR','时间线分页无效。');
      const detail=url.searchParams.get('detail')||'summary';
      if(!['summary','timeline','products'].includes(detail)||detail!=='summary'&&!url.searchParams.get('revision')||offset>0&&!url.searchParams.get('revision'))
        throw new HttpError(400,'INVALID_CURSOR','明细须使用同一汇总版本。');
      const expected=url.searchParams.get('revision'),product=url.searchParams.get('product');
      if(expected&&!/^computer-v1:[a-f0-9]{64}$/.test(expected)||product&&detail!=='timeline')
        throw new HttpError(400,'INVALID_CURSOR','明细请求无效。');
      const snapshot=await binding.getComputerUsage(claims.account_id,childId,from,to,url.searchParams.get('computer')||undefined);
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
      const result=await readCachedApplicationUsage(env.RUNTIME_DB, claims.account_id, childId,
        range.fromMs, range.toMs, {
          machineId: url.searchParams.get('machineId') || undefined,
          localUserId: url.searchParams.get('userId') || undefined,
          platform: platform || undefined,
        });
      return jsonResponse(result.value,{headers:{'x-application-usage-cache':result.cacheStatus}});
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
    url.pathname !== '/v2/machines/heartbeat');
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
