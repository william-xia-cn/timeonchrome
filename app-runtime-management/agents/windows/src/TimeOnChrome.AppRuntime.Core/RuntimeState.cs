namespace TimeOnChrome.AppRuntime.Core;

public sealed record OpenUsageSegment(
    ApplicationIdentity Application,
    long StartAtMs);

public sealed record RuntimeState
{
    public required string RuntimeSessionID { get; init; }

    public ApplicationIdentity? Application { get; init; }

    public UserActivityState UserActivity { get; init; } = UserActivityState.Unknown;

    public UserSessionState SessionState { get; init; } = UserSessionState.Unknown;

    public SystemPowerState PowerState { get; init; } = SystemPowerState.Unknown;

    public OpenUsageSegment? OpenSegment { get; init; }

    public long? LastObservedAtMs { get; init; }

    public ulong NextSegmentOrdinal { get; init; }

    public bool IsEligibleForUsage =>
        Application is not null
        && UserActivity == UserActivityState.Active
        && SessionState == UserSessionState.Active
        && PowerState == SystemPowerState.Awake;
}
