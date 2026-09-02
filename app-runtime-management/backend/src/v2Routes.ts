import { requireAccountModule, requireMachine } from './auth';
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
  queryAppUsage,
  queryClassificationRecords,
  querySegmentDetails,
} from './appPolicy';

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
    if (url.pathname === '/v2/module/app-classification-records') {
      if (request.method !== 'GET') return methodNotAllowed('GET');
      const childId = requireChild();
      const platform = url.searchParams.get('platform');
      if (platform != null && platform !== 'windows' && platform !== 'macos') {
        throw new HttpError(400, 'INVALID_PLATFORM', 'Platform is invalid.');
      }
      return jsonResponse(await queryClassificationRecords(
        env.RUNTIME_DB, claims.account_id, childId, platform || undefined,
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
      return jsonResponse(await queryAppUsage(env.RUNTIME_DB, claims.account_id, childId,
        range.fromMs, range.toMs, {
          machineId: url.searchParams.get('machineId') || undefined,
          localUserId: url.searchParams.get('userId') || undefined,
          platform: platform || undefined,
        }));
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
    return result ? jsonResponse(result, { status: 201 })
      : errorResponse(401, 'ENROLLMENT_INVALID', 'Enrollment code is invalid, expired, or consumed.');
  }

  const machine = await requireMachine(request, env.RUNTIME_DB, nowMs);
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
    for (const field of ['serviceVersion', 'windowsVersion', 'architecture'] as const) {
      if (typeof body[field] !== 'string' || body[field].length < 1 || body[field].length > 128) {
        throw new HttpError(400, 'INVALID_REQUEST', `${field} is invalid.`);
      }
    }
    if (!Number.isSafeInteger(body.tamperCount) || Number(body.tamperCount) < 0
      || typeof body.policyState !== 'string' || !policyStates.has(body.policyState)) {
      throw new HttpError(400, 'INVALID_REQUEST', 'Heartbeat state is invalid.');
    }
    await recordMachineHeartbeat(env.RUNTIME_DB, machine, {
      serviceVersion: String(body.serviceVersion), windowsVersion: String(body.windowsVersion),
      architecture: String(body.architecture), tamperCount: Number(body.tamperCount),
      policyState: body.policyState as 'pending' | 'cached' | 'applied' | 'failed' | 'offline',
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
  if (url.pathname === '/v2/machines/uninstall') {
    if (request.method !== 'POST') return methodNotAllowed('POST');
    const body = await readJsonBody(request);
    if (!isRecord(body) || typeof body.code !== 'string') throw new HttpError(400, 'INVALID_REQUEST', 'Uninstall code is invalid.');
    return await authorizeUninstall(env.RUNTIME_DB, machine, body.code, nowMs)
      ? jsonResponse({ authorized: true }) : errorResponse(401, 'UNINSTALL_CODE_INVALID', 'Uninstall code is invalid, expired, or consumed.');
  }
  return errorResponse(404, 'NOT_FOUND', 'Route was not found.');
}
