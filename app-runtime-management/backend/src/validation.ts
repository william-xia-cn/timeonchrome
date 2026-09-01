import type {
  ApplicationIdentity,
  CreateEnrollmentCodeRequest,
  EnrollDeviceRequest,
  RuntimePlatform,
  SegmentEndReason,
  UploadRequest,
  UsageSegment,
  MachineSegmentEnvelope,
  AccountingUsageEnvelope,
  AccountingMediaEnvelope,
  AccountingUsageSegment,
  AccountingMediaSegment,
  AccountingSegmentEndReason,
} from './contracts';
import { HttpError } from './http';

const platforms = new Set<RuntimePlatform>(['macos', 'windows']);
const endReasons = new Set<SegmentEndReason>([
  'applicationSwitch',
  'userIdle',
  'sessionUnavailable',
  'systemSleep',
  'periodicSnapshot',
  'stateCorrection',
]);
const accountingEndReasons = new Set<AccountingSegmentEndReason>([
  ...endReasons,
  'pipEnded',
  'mediaStopped',
  'checkpointUnconfirmed',
  'serviceRecovery',
  'clockAdjustment',
  'lateFact',
  'diagnostic',
]);
const accountingChannels = new Set(['active', 'pipActive', 'diagnostic']);
const activityBases = new Set([
  'foregroundInteraction', 'foregroundStrongMedia', 'pipStrongMedia',
  'estimatedCheckpoint', 'estimatedBackfill', 'estimatedRecovery', 'diagnostic',
]);

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(
  value: unknown,
  name: string,
  minimum: number,
  maximum: number,
): string {
  if (typeof value !== 'string' || value.length < minimum || value.length > maximum) {
    throw new HttpError(400, 'INVALID_REQUEST', `${name} is invalid.`);
  }
  return value;
}

function optionalString(value: unknown, name: string, maximum: number): string | null {
  if (value == null) {
    return null;
  }
  return stringValue(value, name, 1, maximum);
}

export function parseCreateEnrollmentCode(value: unknown): CreateEnrollmentCodeRequest {
  if (!isRecord(value)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Request must be an object.');
  }
  const subjectId = stringValue(value.subjectId, 'subjectId', 1, 128);
  const ttlSeconds = value.ttlSeconds == null ? 600 : value.ttlSeconds;
  if (!Number.isInteger(ttlSeconds) || Number(ttlSeconds) < 60 || Number(ttlSeconds) > 3_600) {
    throw new HttpError(400, 'INVALID_REQUEST', 'ttlSeconds must be between 60 and 3600.');
  }
  return { subjectId, ttlSeconds: Number(ttlSeconds) };
}

export function parseEnrollDevice(value: unknown): EnrollDeviceRequest {
  if (!isRecord(value)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Request must be an object.');
  }
  const code = stringValue(value.code, 'code', 14, 14);
  if (!/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/u.test(code)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'code is invalid.');
  }
  if (typeof value.platform !== 'string' || !platforms.has(value.platform as RuntimePlatform)) {
    throw new HttpError(400, 'INVALID_REQUEST', 'platform is invalid.');
  }
  return {
    code,
    platform: value.platform as RuntimePlatform,
    displayName: optionalString(value.displayName, 'displayName', 128),
  };
}

export function parseUploadRequest(value: unknown): { schemaVersion: 1; rawSegments: unknown[] } {
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.segments)) {
    throw new HttpError(400, 'INVALID_UPLOAD', 'Upload request is invalid.');
  }
  if (value.segments.length < 1 || value.segments.length > 100) {
    throw new HttpError(400, 'INVALID_BATCH_SIZE', 'segments must contain between 1 and 100 items.');
  }
  return { schemaVersion: 1, rawSegments: value.segments };
}

export function parseMachinePairing(value: unknown): { defaultChildId: string; displayName: string | null } {
  if (!isRecord(value)) throw new HttpError(400, 'INVALID_REQUEST', 'Request must be an object.');
  return {
    defaultChildId: stringValue(value.defaultChildId, 'defaultChildId', 1, 128),
    displayName: optionalString(value.displayName, 'displayName', 128),
  };
}

export function parseMachineUsers(value: unknown): Array<{ localUserId: string; displayName: string; sessionActive: boolean }> {
  if (!isRecord(value) || !Array.isArray(value.users) || value.users.length > 100) {
    throw new HttpError(400, 'INVALID_REQUEST', 'Machine users are invalid.');
  }
  return value.users.map((entry) => {
    if (!isRecord(entry) || typeof entry.sessionActive !== 'boolean') {
      throw new HttpError(400, 'INVALID_REQUEST', 'Machine user is invalid.');
    }
    const localUserId = stringValue(entry.localUserId, 'localUserId', 32, 128);
    if (!/^[A-Za-z0-9_-]+$/u.test(localUserId)) throw new HttpError(400, 'INVALID_REQUEST', 'localUserId is invalid.');
    return { localUserId, displayName: stringValue(entry.displayName, 'displayName', 1, 128), sessionActive: entry.sessionActive };
  });
}

export function parseMachineUpload(
  value: unknown,
  expectedPlatform: RuntimePlatform,
): {
  envelopes: MachineSegmentEnvelope[];
  accountingEnvelopes: AccountingUsageEnvelope[];
  rejected: Array<{ id: string; code: string }>;
} {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.segments)
    || value.segments.length < 1 || value.segments.length > 100) {
    throw new HttpError(400, 'INVALID_UPLOAD', 'Machine upload is invalid.');
  }
  const envelopes: MachineSegmentEnvelope[] = [];
  const accountingEnvelopes: AccountingUsageEnvelope[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  value.segments.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.localUserId !== 'string'
      || !/^[A-Za-z0-9_-]{32,128}$/u.test(entry.localUserId)
      || !Number.isSafeInteger(entry.assignmentVersion) || Number(entry.assignmentVersion) < 1) {
      rejected.push({ id: isRecord(entry) && typeof entry.id === 'string' ? entry.id : `item:${index}`, code: 'INVALID_ENVELOPE' });
      return;
    }
    if (entry.schemaVersion === 2 || 'channel' in entry) {
      const validation = validateAccountingUsageSegment(entry, expectedPlatform, index);
      if (!validation.ok) rejected.push({ id: validation.id, code: validation.code });
      else accountingEnvelopes.push({
        localUserId: entry.localUserId,
        assignmentVersion: Number(entry.assignmentVersion),
        segment: validation.segment,
      });
      return;
    }
    const validation = validateSegment(entry, expectedPlatform, index);
    if (!validation.ok) {
      rejected.push({ id: validation.id, code: validation.code });
      return;
    }
    envelopes.push({
      localUserId: entry.localUserId,
      assignmentVersion: Number(entry.assignmentVersion),
      segment: validation.segment,
    });
  });
  return { envelopes, accountingEnvelopes, rejected };
}

export function parseMachineMediaUpload(
  value: unknown,
  expectedPlatform: RuntimePlatform,
): { envelopes: AccountingMediaEnvelope[]; rejected: Array<{ id: string; code: string }> } {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.segments)
    || value.segments.length < 1 || value.segments.length > 100) {
    throw new HttpError(400, 'INVALID_UPLOAD', 'Media upload is invalid.');
  }
  const envelopes: AccountingMediaEnvelope[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  value.segments.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.localUserId !== 'string'
      || !/^[A-Za-z0-9_-]{32,128}$/u.test(entry.localUserId)
      || !Number.isSafeInteger(entry.assignmentVersion) || Number(entry.assignmentVersion) < 1) {
      rejected.push({ id: isRecord(entry) && typeof entry.id === 'string' ? entry.id : `item:${index}`, code: 'INVALID_ENVELOPE' });
      return;
    }
    const validation = validateAccountingMediaSegment(entry, expectedPlatform, index);
    if (!validation.ok) rejected.push({ id: validation.id, code: validation.code });
    else envelopes.push({
      localUserId: entry.localUserId,
      assignmentVersion: Number(entry.assignmentVersion),
      segment: validation.segment,
    });
  });
  return { envelopes, rejected };
}

export type SegmentValidation =
  | { ok: true; segment: UsageSegment }
  | { ok: false; id: string; code: string };

export type AccountingUsageValidation =
  | { ok: true; segment: AccountingUsageSegment }
  | { ok: false; id: string; code: string };

export type AccountingMediaValidation =
  | { ok: true; segment: AccountingMediaSegment }
  | { ok: false; id: string; code: string };

export function validateAccountingUsageSegment(
  value: unknown,
  expectedPlatform: RuntimePlatform,
  index: number,
): AccountingUsageValidation {
  const fallbackId = `item:${index}`;
  if (!isRecord(value)) return { ok: false, id: fallbackId, code: 'INVALID_SEGMENT' };
  const id = typeof value.id === 'string' ? value.id : fallbackId;
  if (!/^[0-9a-f]{64}$/u.test(id)) return { ok: false, id, code: 'INVALID_ID' };
  const application = value.application == null ? null
    : isRecord(value.application) ? parseApplication(value.application) : null;
  if (value.application != null && application == null) return { ok: false, id, code: 'INVALID_APPLICATION' };
  if (application && application.platform !== expectedPlatform) return { ok: false, id, code: 'PLATFORM_MISMATCH' };
  if (typeof value.runtimeSessionID !== 'string' || value.runtimeSessionID.length < 1
    || value.runtimeSessionID.length > 256 || value.schemaVersion !== 2
    || typeof value.channel !== 'string' || !accountingChannels.has(value.channel)
    || typeof value.activityBasis !== 'string' || !activityBases.has(value.activityBasis)
    || typeof value.clockEpochId !== 'string' || value.clockEpochId.length < 1 || value.clockEpochId.length > 128
    || !safeNonNegativeInteger(value.startWallTimeMs) || !safeNonNegativeInteger(value.endWallTimeMs)
    || !safeNonNegativeInteger(value.startMonotonicTimeMs) || !safeNonNegativeInteger(value.endMonotonicTimeMs)
    || !safeNonNegativeInteger(value.monotonicDurationMilliseconds)
    || Number(value.endMonotonicTimeMs) < Number(value.startMonotonicTimeMs)
    || Number(value.monotonicDurationMilliseconds) !== Number(value.endMonotonicTimeMs) - Number(value.startMonotonicTimeMs)
    || typeof value.endReason !== 'string' || !accountingEndReasons.has(value.endReason as AccountingSegmentEndReason)
    || typeof value.diagnostic !== 'boolean' || !isRecord(value.estimated)) {
    return { ok: false, id, code: 'INVALID_SEGMENT' };
  }
  const zeroDuration = Number(value.monotonicDurationMilliseconds) === 0;
  if ((zeroDuration && (!value.diagnostic || value.channel !== 'diagnostic'))
    || (!zeroDuration && value.diagnostic)
    || (!value.diagnostic && application == null)) {
    return { ok: false, id, code: 'INVALID_DIAGNOSTIC' };
  }
  const estimated = parseEstimated(value.estimated);
  if (!estimated) return { ok: false, id, code: 'INVALID_ESTIMATE' };
  const policySnapshot = value.policySnapshot == null ? null : parsePolicySnapshot(value.policySnapshot);
  if (value.policySnapshot != null && policySnapshot == null) {
    return { ok: false, id, code: 'INVALID_POLICY_SNAPSHOT' };
  }
  if ((value.lastEvidenceWallTimeMs != null && !safeNonNegativeInteger(value.lastEvidenceWallTimeMs))
    || (value.lastEvidenceMonotonicTimeMs != null && !safeNonNegativeInteger(value.lastEvidenceMonotonicTimeMs))
    || (value.diagnosticCode != null && (typeof value.diagnosticCode !== 'string' || value.diagnosticCode.length > 64))
    || (value.diagnosticMessage != null
      && (typeof value.diagnosticMessage !== 'string' || value.diagnosticMessage.length > 512))) {
    return { ok: false, id, code: 'INVALID_EVIDENCE' };
  }
  return { ok: true, segment: {
    id,
    schemaVersion: 2,
    runtimeSessionID: value.runtimeSessionID,
    application,
    channel: value.channel as AccountingUsageSegment['channel'],
    activityBasis: value.activityBasis as AccountingUsageSegment['activityBasis'],
    clockEpochId: value.clockEpochId,
    startWallTimeMs: Number(value.startWallTimeMs),
    endWallTimeMs: Number(value.endWallTimeMs),
    startMonotonicTimeMs: Number(value.startMonotonicTimeMs),
    endMonotonicTimeMs: Number(value.endMonotonicTimeMs),
    monotonicDurationMilliseconds: Number(value.monotonicDurationMilliseconds),
    endReason: value.endReason as AccountingSegmentEndReason,
    estimated,
    lastEvidenceWallTimeMs: value.lastEvidenceWallTimeMs == null ? null : Number(value.lastEvidenceWallTimeMs),
    lastEvidenceMonotonicTimeMs: value.lastEvidenceMonotonicTimeMs == null ? null : Number(value.lastEvidenceMonotonicTimeMs),
    diagnostic: value.diagnostic,
    diagnosticCode: value.diagnosticCode == null ? null : String(value.diagnosticCode),
    diagnosticMessage: value.diagnosticMessage == null ? null : value.diagnosticMessage,
    policySnapshot,
  } };
}

export function validateAccountingMediaSegment(
  value: unknown,
  expectedPlatform: RuntimePlatform,
  index: number,
): AccountingMediaValidation {
  const fallbackId = `item:${index}`;
  if (!isRecord(value)) return { ok: false, id: fallbackId, code: 'INVALID_SEGMENT' };
  const id = typeof value.id === 'string' ? value.id : fallbackId;
  const application = isRecord(value.application) ? parseApplication(value.application) : null;
  const estimated = isRecord(value.estimated) ? parseEstimated(value.estimated) : null;
  if (!/^[0-9a-f]{64}$/u.test(id) || !application || application.platform !== expectedPlatform
    || value.schemaVersion !== 2 || typeof value.runtimeSessionID !== 'string'
    || value.runtimeSessionID.length < 1 || value.runtimeSessionID.length > 256
    || (value.mediaKind !== 'audio' && value.mediaKind !== 'video')
    || !['foreground', 'background', 'pip'].includes(String(value.presentation))
    || typeof value.clockEpochId !== 'string' || value.clockEpochId.length < 1 || value.clockEpochId.length > 128
    || !safeNonNegativeInteger(value.startWallTimeMs) || !safeNonNegativeInteger(value.endWallTimeMs)
    || !safeNonNegativeInteger(value.startMonotonicTimeMs) || !safeNonNegativeInteger(value.endMonotonicTimeMs)
    || !safeNonNegativeInteger(value.monotonicDurationMilliseconds)
    || Number(value.endMonotonicTimeMs) < Number(value.startMonotonicTimeMs)
    || Number(value.monotonicDurationMilliseconds) !== Number(value.endMonotonicTimeMs) - Number(value.startMonotonicTimeMs)
    || typeof value.endReason !== 'string' || !accountingEndReasons.has(value.endReason as AccountingSegmentEndReason)
    || !estimated || !safeNonNegativeInteger(value.lastEvidenceWallTimeMs)
    || !safeNonNegativeInteger(value.lastEvidenceMonotonicTimeMs)
    || value.authoritativeForUsage !== false) {
    return { ok: false, id, code: 'INVALID_SEGMENT' };
  }
  return { ok: true, segment: {
    id,
    schemaVersion: 2,
    runtimeSessionID: value.runtimeSessionID,
    application,
    mediaKind: value.mediaKind,
    presentation: value.presentation as AccountingMediaSegment['presentation'],
    clockEpochId: value.clockEpochId,
    startWallTimeMs: Number(value.startWallTimeMs),
    endWallTimeMs: Number(value.endWallTimeMs),
    startMonotonicTimeMs: Number(value.startMonotonicTimeMs),
    endMonotonicTimeMs: Number(value.endMonotonicTimeMs),
    monotonicDurationMilliseconds: Number(value.monotonicDurationMilliseconds),
    endReason: value.endReason as AccountingSegmentEndReason,
    estimated,
    lastEvidenceWallTimeMs: Number(value.lastEvidenceWallTimeMs),
    lastEvidenceMonotonicTimeMs: Number(value.lastEvidenceMonotonicTimeMs),
    authoritativeForUsage: false,
  } };
}

function parseEstimated(value: Record<string, unknown>): AccountingUsageSegment['estimated'] | null {
  if (typeof value.isEstimated !== 'boolean'
    || (value.reason != null && (typeof value.reason !== 'string' || value.reason.length > 64))
    || (value.cappedAtMilliseconds != null && (!safeNonNegativeInteger(value.cappedAtMilliseconds)
      || Number(value.cappedAtMilliseconds) > 30_000))) return null;
  return {
    isEstimated: value.isEstimated,
    reason: value.reason == null ? null : value.reason,
    cappedAtMilliseconds: value.cappedAtMilliseconds == null ? null : Number(value.cappedAtMilliseconds),
  };
}

function parsePolicySnapshot(value: unknown): AccountingUsageSegment['policySnapshot'] {
  if (!isRecord(value)
    || (value.assignmentVersion != null && !safeNonNegativeInteger(value.assignmentVersion))
    || (value.quotaBucket != null
      && (typeof value.quotaBucket !== 'string' || value.quotaBucket.length > 64))) return null;
  return {
    assignmentVersion: value.assignmentVersion == null ? null : Number(value.assignmentVersion),
    quotaBucket: value.quotaBucket == null ? null : value.quotaBucket,
  };
}

export function validateSegment(value: unknown, expectedPlatform: RuntimePlatform, index: number): SegmentValidation {
  const fallbackId = `item:${index}`;
  if (!isRecord(value)) {
    return { ok: false, id: fallbackId, code: 'INVALID_SEGMENT' };
  }
  const id = typeof value.id === 'string' ? value.id : fallbackId;
  if (id.length < 1 || id.length > 200) {
    return { ok: false, id, code: 'INVALID_ID' };
  }
  if (typeof value.runtimeSessionID !== 'string'
      || value.runtimeSessionID.length < 1
      || value.runtimeSessionID.length > 200
      || !isRecord(value.application)) {
    return { ok: false, id, code: 'INVALID_SEGMENT' };
  }
  const application = parseApplication(value.application);
  if (application === null) {
    return { ok: false, id, code: 'INVALID_APPLICATION' };
  }
  if (application.platform !== expectedPlatform) {
    return { ok: false, id, code: 'PLATFORM_MISMATCH' };
  }
  if (!safeNonNegativeInteger(value.startAtMs)
      || !safeNonNegativeInteger(value.endAtMs)
      || !safeNonNegativeInteger(value.durationMilliseconds)
      || Number(value.endAtMs) <= Number(value.startAtMs)
      || Number(value.durationMilliseconds) !== Number(value.endAtMs) - Number(value.startAtMs)
      || typeof value.endReason !== 'string'
      || !endReasons.has(value.endReason as SegmentEndReason)) {
    return { ok: false, id, code: 'INVALID_TIME_RANGE' };
  }

  return {
    ok: true,
    segment: {
      id,
      runtimeSessionID: value.runtimeSessionID,
      application,
      startAtMs: Number(value.startAtMs),
      endAtMs: Number(value.endAtMs),
      durationMilliseconds: Number(value.durationMilliseconds),
      endReason: value.endReason as SegmentEndReason,
    },
  };
}

function parseApplication(value: Record<string, unknown>): ApplicationIdentity | null {
  if (typeof value.platform !== 'string'
      || !platforms.has(value.platform as RuntimePlatform)
      || typeof value.runtimeIdentity !== 'string'
      || value.runtimeIdentity.length < 1
      || value.runtimeIdentity.length > 256) {
    return null;
  }
  if (value.displayName != null
      && (typeof value.displayName !== 'string' || value.displayName.length > 128)) {
    return null;
  }
  return {
    platform: value.platform as RuntimePlatform,
    runtimeIdentity: value.runtimeIdentity,
    displayName: value.displayName == null ? null : value.displayName as string,
  };
}

function safeNonNegativeInteger(value: unknown): boolean {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
