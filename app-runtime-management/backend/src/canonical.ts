import type { AccountingMediaSegment, AccountingUsageSegment, UsageSegment } from './contracts';
import { sha256Hex } from './crypto';

function field(value: string | null | undefined): string {
  return value == null ? '-1:' : `${value.length}:${value}`;
}

export function segmentCanonicalContent(segment: UsageSegment): string {
  return [
    segment.runtimeSessionID,
    segment.application.platform,
    segment.application.runtimeIdentity,
    segment.application.displayName,
    String(segment.startAtMs),
    String(segment.endAtMs),
    String(segment.durationMilliseconds),
    segment.endReason,
  ].map(field).join('');
}

export function segmentContentHash(segment: UsageSegment): Promise<string> {
  return sha256Hex(segmentCanonicalContent(segment));
}

export function accountingUsageCanonicalContent(segment: AccountingUsageSegment): string {
  return [
    'usage-v2',
    segment.runtimeSessionID,
    segment.application?.platform ?? '',
    segment.application?.runtimeIdentity ?? '',
    segment.channel,
    segment.activityBasis,
    segment.clockEpochId,
    String(segment.startWallTimeMs),
    String(segment.endWallTimeMs),
    String(segment.startMonotonicTimeMs),
    String(segment.endMonotonicTimeMs),
    String(segment.monotonicDurationMilliseconds),
    segment.endReason,
    segment.estimated.isEstimated ? '1' : '0',
    segment.estimated.reason ?? '',
    segment.estimated.cappedAtMilliseconds == null ? '' : String(segment.estimated.cappedAtMilliseconds),
    segment.diagnostic ? '1' : '0',
    segment.diagnosticCode ?? '',
  ].join('\n');
}

export function accountingMediaCanonicalContent(segment: AccountingMediaSegment): string {
  return [
    'media-v2',
    segment.runtimeSessionID,
    segment.application.platform,
    segment.application.runtimeIdentity,
    segment.mediaKind,
    segment.presentation,
    segment.clockEpochId,
    String(segment.startWallTimeMs),
    String(segment.endWallTimeMs),
    String(segment.startMonotonicTimeMs),
    String(segment.endMonotonicTimeMs),
    String(segment.monotonicDurationMilliseconds),
    segment.endReason,
    segment.estimated.isEstimated ? '1' : '0',
    segment.estimated.reason ?? '',
    segment.estimated.cappedAtMilliseconds == null ? '' : String(segment.estimated.cappedAtMilliseconds),
  ].join('\n');
}

export function accountingUsageId(segment: AccountingUsageSegment): Promise<string> {
  return sha256Hex(accountingUsageCanonicalContent(segment));
}

export function accountingMediaId(segment: AccountingMediaSegment): Promise<string> {
  return sha256Hex(accountingMediaCanonicalContent(segment));
}
