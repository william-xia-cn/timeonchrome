namespace TimeOnChrome.AppRuntime.Core;

public sealed class AccountingFactProjectorV2
{
    private readonly long clockJumpToleranceMilliseconds;
    private long? lastWall;
    private long? lastMonotonic;
    private int epochOrdinal;
    private string epochId;

    public AccountingFactProjectorV2(
        string initialClockEpochId,
        long clockJumpToleranceMilliseconds = 2_000)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(initialClockEpochId);
        epochId = initialClockEpochId;
        this.clockJumpToleranceMilliseconds = clockJumpToleranceMilliseconds;
    }

    public IReadOnlyList<AccountingRuntimeFact> Project(
        RuntimeFact source,
        long wallTimeMs,
        long monotonicTimeMs)
    {
        ArgumentNullException.ThrowIfNull(source);
        var result = new List<AccountingRuntimeFact>(2);
        if (lastWall is long previousWall && lastMonotonic is long previousMonotonic)
        {
            var wallDelta = wallTimeMs - previousWall;
            var monotonicDelta = monotonicTimeMs - previousMonotonic;
            if (Math.Abs(wallDelta - monotonicDelta) > clockJumpToleranceMilliseconds)
            {
                var nextEpoch = $"epoch-{++epochOrdinal}";
                result.Add(new AccountingRuntimeFact(
                    wallTimeMs,
                    monotonicTimeMs,
                    epochId,
                    AccountingFactKind.ClockAdjusted,
                    NewClockEpochId: nextEpoch));
                epochId = nextEpoch;
            }
        }

        result.Add(Map(source, wallTimeMs, monotonicTimeMs, epochId));
        lastWall = wallTimeMs;
        lastMonotonic = monotonicTimeMs;
        return result;
    }

    private static AccountingRuntimeFact Map(
        RuntimeFact source,
        long wallTimeMs,
        long monotonicTimeMs,
        string epochId)
    {
        return source.Kind switch
        {
            RuntimeFactKind.ApplicationActivated => new AccountingRuntimeFact(
                wallTimeMs,
                monotonicTimeMs,
                epochId,
                AccountingFactKind.ForegroundChanged,
                Application: source.Application,
                WindowState: source.Application is null
                    ? WindowPresentationState.Unknown
                    : WindowPresentationState.Visible),
            RuntimeFactKind.UserActivityChanged => new AccountingRuntimeFact(
                wallTimeMs,
                monotonicTimeMs,
                epochId,
                AccountingFactKind.UserActivityChanged,
                UserActivity: source.UserActivity),
            RuntimeFactKind.SessionChanged => new AccountingRuntimeFact(
                wallTimeMs,
                monotonicTimeMs,
                epochId,
                AccountingFactKind.SessionChanged,
                SessionState: source.SessionState),
            RuntimeFactKind.PowerChanged => new AccountingRuntimeFact(
                wallTimeMs,
                monotonicTimeMs,
                epochId,
                AccountingFactKind.PowerChanged,
                PowerState: source.PowerState),
            RuntimeFactKind.Snapshot => Snapshot(source, wallTimeMs, monotonicTimeMs, epochId),
            _ => throw new InvalidOperationException($"Unsupported legacy fact kind: {source.Kind}."),
        };
    }

    private static AccountingRuntimeFact Snapshot(
        RuntimeFact source,
        long wallTimeMs,
        long monotonicTimeMs,
        string epochId)
    {
        var snapshot = source.Snapshot
            ?? throw new InvalidOperationException("Snapshot fact requires payload.");
        return new AccountingRuntimeFact(
            wallTimeMs,
            monotonicTimeMs,
            epochId,
            AccountingFactKind.Checkpoint,
            Confirmation: CheckpointConfirmation.Confirmed,
            Snapshot: new AccountingRuntimeSnapshot(
                snapshot.Application,
                snapshot.Application is null
                    ? WindowPresentationState.Unknown
                    : WindowPresentationState.Visible,
                MediaEvidenceLevel.None,
                MediaPlaybackState.Unknown,
                snapshot.UserActivity,
                snapshot.SessionState,
                snapshot.PowerState));
    }
}
