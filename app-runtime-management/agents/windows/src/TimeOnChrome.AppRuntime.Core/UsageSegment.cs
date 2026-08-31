namespace TimeOnChrome.AppRuntime.Core;

public enum SegmentEndReason
{
    ApplicationSwitch,
    UserIdle,
    SessionUnavailable,
    SystemSleep,
    PeriodicSnapshot,
    StateCorrection,
}

public sealed record UsageSegment(
    string Id,
    string RuntimeSessionID,
    ApplicationIdentity Application,
    long StartAtMs,
    long EndAtMs,
    long DurationMilliseconds,
    SegmentEndReason EndReason);
