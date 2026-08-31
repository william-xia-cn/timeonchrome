namespace TimeOnChrome.AppRuntime.Core;

public enum UserActivityState
{
    Unknown,
    Active,
    Idle,
}

public enum UserSessionState
{
    Unknown,
    Active,
    Inactive,
    Locked,
}

public enum SystemPowerState
{
    Unknown,
    Awake,
    Asleep,
}

public enum RuntimeFactKind
{
    ApplicationActivated,
    UserActivityChanged,
    SessionChanged,
    PowerChanged,
    Snapshot,
}

public sealed record RuntimeSnapshot(
    ApplicationIdentity? Application,
    UserActivityState UserActivity,
    UserSessionState SessionState,
    SystemPowerState PowerState);

public sealed record RuntimeFact
{
    public required long ObservedAtMs { get; init; }

    public required RuntimeFactKind Kind { get; init; }

    public ApplicationIdentity? Application { get; init; }

    public UserActivityState? UserActivity { get; init; }

    public UserSessionState? SessionState { get; init; }

    public SystemPowerState? PowerState { get; init; }

    public RuntimeSnapshot? Snapshot { get; init; }
}
