import type {
  ApplicationIdentity,
  CreateEnrollmentCodeRequest,
  EnrollDeviceRequest,
  RuntimePlatform,
  SegmentEndReason,
  UploadRequest,
  UsageSegment,
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
