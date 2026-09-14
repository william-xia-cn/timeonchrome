using System.Globalization;

namespace TimeOnChrome.AppRuntime.Core;

public sealed class RuntimeTransitionException : Exception
{
    private RuntimeTransitionException(
        string code,
        long? value = null,
        long? previous = null,
        long? received = null)
        : base(code)
    {
        Code = code;
        Value = value;
        Previous = previous;
        Received = received;
    }

    public string Code { get; }

    public long? Value { get; }

    public long? Previous { get; }

    public long? Received { get; }

    internal static RuntimeTransitionException NegativeTimestamp(long value) =>
        new("negativeTimestamp", value: value);

    internal static RuntimeTransitionException NonMonotonicTimestamp(long previous, long received) =>
        new("nonMonotonicTimestamp", previous: previous, received: received);
}

public sealed class RuntimeStateMachine
{
    public RuntimeStateMachine(string runtimeSessionID)
    {
        State = new RuntimeState { RuntimeSessionID = runtimeSessionID };
    }

    public RuntimeState State { get; private set; }

    public IReadOnlyList<UsageSegment> Apply(RuntimeFact fact)
    {
        ArgumentNullException.ThrowIfNull(fact);

        if (fact.ObservedAtMs < 0)
        {
            throw RuntimeTransitionException.NegativeTimestamp(fact.ObservedAtMs);
        }

        if (State.LastObservedAtMs is long previous && fact.ObservedAtMs < previous)
        {
            throw RuntimeTransitionException.NonMonotonicTimestamp(previous, fact.ObservedAtMs);
        }

        var next = State;
        var endReason = ApplyFact(fact, ref next);
        var isCheckpoint = fact.Kind == RuntimeFactKind.Snapshot;
        var applicationChanged = HasApplicationIdentityChanged(State.Application, next.Application);
        var completed = new List<UsageSegment>(capacity: 1);

        if (State.OpenSegment is { } open
            && (isCheckpoint || applicationChanged || !next.IsEligibleForUsage))
        {
            if (fact.ObservedAtMs > open.StartAtMs)
            {
                completed.Add(new UsageSegment(
                    Id: string.Concat(
                        State.RuntimeSessionID,
                        ":",
                        State.NextSegmentOrdinal.ToString(CultureInfo.InvariantCulture)),
                    RuntimeSessionID: State.RuntimeSessionID,
                    Application: open.Application,
                    StartAtMs: open.StartAtMs,
                    EndAtMs: fact.ObservedAtMs,
                    DurationMilliseconds: fact.ObservedAtMs - open.StartAtMs,
                    EndReason: endReason));
                next = next with { NextSegmentOrdinal = next.NextSegmentOrdinal + 1 };
            }

            next = next with { OpenSegment = null };
        }

        if (next.OpenSegment is null
            && next.IsEligibleForUsage
            && next.Application is { } application)
        {
            next = next with
            {
                OpenSegment = new OpenUsageSegment(application, fact.ObservedAtMs),
            };
        }

        State = next with { LastObservedAtMs = fact.ObservedAtMs };
        return completed;
    }

    private static SegmentEndReason ApplyFact(RuntimeFact fact, ref RuntimeState state)
    {
        switch (fact.Kind)
        {
            case RuntimeFactKind.ApplicationActivated:
                state = state with { Application = fact.Application };
                return SegmentEndReason.ApplicationSwitch;

            case RuntimeFactKind.UserActivityChanged:
                var activity = Require(fact.UserActivity, nameof(fact.UserActivity));
                state = state with { UserActivity = activity };
                return activity == UserActivityState.Idle
                    ? SegmentEndReason.UserIdle
                    : SegmentEndReason.StateCorrection;

            case RuntimeFactKind.SessionChanged:
                var session = Require(fact.SessionState, nameof(fact.SessionState));
                state = state with { SessionState = session };
                return session == UserSessionState.Active
                    ? SegmentEndReason.StateCorrection
                    : SegmentEndReason.SessionUnavailable;

            case RuntimeFactKind.PowerChanged:
                var power = Require(fact.PowerState, nameof(fact.PowerState));
                state = state with { PowerState = power };
                return power == SystemPowerState.Asleep
                    ? SegmentEndReason.SystemSleep
                    : SegmentEndReason.StateCorrection;

            case RuntimeFactKind.Snapshot:
                var snapshot = fact.Snapshot
                    ?? throw new InvalidOperationException("Snapshot fact requires snapshot payload.");
                state = state with
                {
                    Application = snapshot.Application,
                    UserActivity = snapshot.UserActivity,
                    SessionState = snapshot.SessionState,
                    PowerState = snapshot.PowerState,
                };
                return SegmentEndReason.PeriodicSnapshot;

            default:
                throw new InvalidOperationException($"Unsupported runtime fact kind: {fact.Kind}.");
        }
    }

    private static T Require<T>(T? value, string propertyName)
        where T : struct =>
        value ?? throw new InvalidOperationException($"Runtime fact requires {propertyName} payload.");

    private static bool HasApplicationIdentityChanged(
        ApplicationIdentity? previous,
        ApplicationIdentity? current) =>
        previous?.Platform != current?.Platform
        || !string.Equals(
            previous?.RuntimeIdentity,
            current?.RuntimeIdentity,
            StringComparison.Ordinal);
}
