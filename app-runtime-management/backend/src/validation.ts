import type {
  ApplicationIdentity,
  CreateEnrollmentCodeRequest,
  EnrollDeviceRequest,
  RuntimePlatform,
  SegmentEndReason,
  UploadRequest,
  UsageSegment,
  MachineSegmentEnvelope,
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
): { envelopes: MachineSegmentEnvelope[]; rejected: Array<{ id: string; code: string }> } {
  if (!isRecord(value) || value.schemaVersion !== 2 || !Array.isArray(value.segments)
    || value.segments.length < 1 || value.segments.length > 100) {
    throw new HttpError(400, 'INVALID_UPLOAD', 'Machine upload is invalid.');
  }
  const envelopes: MachineSegmentEnvelope[] = [];
  const rejected: Array<{ id: string; code: string }> = [];
  value.segments.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.localUserId !== 'string'
      || !/^[A-Za-z0-9_-]{32,128}$/u.test(entry.localUserId)
      || !Number.isSafeInteger(entry.assignmentVersion) || Number(entry.assignmentVersion) < 1) {
      rejected.push({ id: isRecord(entry) && typeof entry.id === 'string' ? entry.id : `item:${index}`, code: 'INVALID_ENVELOPE' });
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
  return { envelopes, rejected };
}

export type SegmentValidation =
  | { ok: true; segment: UsageSegment }
  | { ok: false; id: string; code: string };

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
