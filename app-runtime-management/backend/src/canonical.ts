import type { UsageSegment } from './contracts';
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
