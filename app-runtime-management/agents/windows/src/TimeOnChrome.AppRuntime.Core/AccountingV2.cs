using System.Security.Cryptography;
using System.Text;

namespace TimeOnChrome.AppRuntime.Core;

public static class AccountingV2Constants
{
    public const int SchemaVersion = 2;
    public const long IdleThresholdMilliseconds = 180_000;
    public const long CheckpointIntervalMilliseconds = 60_000;
    public const long EstimatedGapCapMilliseconds = 30_000;
    public const long ReorderWindowMilliseconds = 500;
}

public enum AccountingFactKind
{
    ForegroundChanged,
    UserActivityChanged,
    SessionChanged,
    PowerChanged,
    PipChanged,
    MediaChanged,
    Checkpoint,
    ClockAdjusted,
    Recovery,
}

public enum UsageChannel
{
    Active,
    PipActive,
    Diagnostic,
}

public enum ActivityBasis
{
    ForegroundInteraction,
    ForegroundStrongMedia,
    PipStrongMedia,
    EstimatedCheckpoint,
    EstimatedBackfill,
    EstimatedRecovery,
    Diagnostic,
}

public enum WindowPresentationState
{
    Unknown,
    Visible,
    Hidden,
    Minimized,
}

public enum MediaEvidenceLevel
{
    None,
    Weak,
    Strong,
}

public enum MediaPlaybackState
{
    Unknown,
    Playing,
    Paused,
    Stopped,
}

public enum MediaKind
{
    Audio,
    Video,
}

public enum MediaPresentation
{
    Foreground,
    Background,
    Pip,
}

public enum PipState
{
    Inactive,
    Active,
}

public enum CheckpointConfirmation
{
    Confirmed,
    Failed,
}

public enum ApplicationClassification
{
    Study,
    Composite,
    RestrictedEntertainment,
    Unclassified,
    Blocked,
}

public sealed record AccountingPolicySnapshot(
    long? AssignmentVersion,
    string? QuotaBucket,
    long? AppPolicyVersion = null,
    ApplicationClassification? ApplicationClassification = null);

public sealed record AccountingRuntimeSnapshot(
    ApplicationIdentity? ForegroundApplication,
    WindowPresentationState ForegroundWindowState,
    MediaEvidenceLevel ForegroundMediaEvidence,
    MediaPlaybackState ForegroundPlaybackState,
    UserActivityState UserActivity,
    UserSessionState SessionState,
    SystemPowerState PowerState);

public sealed record AccountingRuntimeFact(
    long WallTimeMs,
    long MonotonicTimeMs,
    string ClockEpochId,
    AccountingFactKind Kind,
    ApplicationIdentity? Application = null,
    UserActivityState? UserActivity = null,
    UserSessionState? SessionState = null,
    SystemPowerState? PowerState = null,
    WindowPresentationState WindowState = WindowPresentationState.Unknown,
    MediaEvidenceLevel MediaEvidence = MediaEvidenceLevel.None,
    MediaPlaybackState PlaybackState = MediaPlaybackState.Unknown,
    PipState? PipState = null,
    MediaKind? MediaKind = null,
    MediaPresentation? MediaPresentation = null,
    CheckpointConfirmation? Confirmation = null,
    AccountingRuntimeSnapshot? Snapshot = null,
    string? NewClockEpochId = null,
    string? DiagnosticHint = null,
    AccountingPolicySnapshot? PolicySnapshot = null)
{
    public int SafetyPriority => Kind switch
    {
        AccountingFactKind.ClockAdjusted => 0,
        AccountingFactKind.SessionChanged when SessionState != UserSessionState.Active => 1,
        AccountingFactKind.PowerChanged when PowerState != SystemPowerState.Awake => 2,
        AccountingFactKind.UserActivityChanged when UserActivity == UserActivityState.Idle => 3,
        AccountingFactKind.PipChanged when PipState == TimeOnChrome.AppRuntime.Core.PipState.Inactive => 4,
        AccountingFactKind.MediaChanged when PlaybackState != MediaPlaybackState.Playing => 5,
        AccountingFactKind.ForegroundChanged => 10,
        AccountingFactKind.UserActivityChanged => 11,
        AccountingFactKind.SessionChanged => 12,
        AccountingFactKind.PowerChanged => 13,
        AccountingFactKind.PipChanged => 14,
        AccountingFactKind.MediaChanged => 15,
        AccountingFactKind.Recovery => 20,
        AccountingFactKind.Checkpoint => 30,
        _ => 40,
    };
}

public sealed record EstimatedMetadata(bool IsEstimated, string? Reason, long? CappedAtMilliseconds)
{
    public static EstimatedMetadata Exact { get; } = new(false, null, null);
}

public sealed record UsageSegmentV2(
    string Id,
    int SchemaVersion,
    string RuntimeSessionID,
    ApplicationIdentity? Application,
    UsageChannel Channel,
    ActivityBasis ActivityBasis,
    string ClockEpochId,
    long StartWallTimeMs,
    long EndWallTimeMs,
    long StartMonotonicTimeMs,
    long EndMonotonicTimeMs,
    long MonotonicDurationMilliseconds,
    SegmentEndReason EndReason,
    EstimatedMetadata Estimated,
    long? LastEvidenceWallTimeMs,
    long? LastEvidenceMonotonicTimeMs,
    bool Diagnostic,
    string? DiagnosticCode,
    string? DiagnosticMessage,
    AccountingPolicySnapshot? PolicySnapshot)
{
    public bool AuthoritativeForUsage => !Diagnostic && Channel != UsageChannel.Diagnostic;

    public static UsageSegmentV2 Create(
        string runtimeSessionID,
        ApplicationIdentity? application,
        UsageChannel channel,
        ActivityBasis activityBasis,
        string clockEpochId,
        long startWallTimeMs,
        long endWallTimeMs,
        long startMonotonicTimeMs,
        long endMonotonicTimeMs,
        SegmentEndReason endReason,
        EstimatedMetadata estimated,
        long? lastEvidenceWallTimeMs,
        long? lastEvidenceMonotonicTimeMs,
        bool diagnostic = false,
        string? diagnosticCode = null,
        string? diagnosticMessage = null,
        AccountingPolicySnapshot? policySnapshot = null)
    {
        var duration = Math.Max(0, endMonotonicTimeMs - startMonotonicTimeMs);
        if (duration == 0 && !diagnostic)
        {
            channel = UsageChannel.Diagnostic;
            activityBasis = ActivityBasis.Diagnostic;
            endReason = SegmentEndReason.Diagnostic;
            estimated = EstimatedMetadata.Exact;
            diagnostic = true;
            diagnosticCode = "zeroDurationBoundary";
            diagnosticMessage ??= "A same-millisecond boundary did not produce billable duration.";
        }
        var canonical = AccountingSegmentId.CanonicalUsage(
            runtimeSessionID,
            application,
            channel,
            activityBasis,
            clockEpochId,
            startWallTimeMs,
            endWallTimeMs,
            startMonotonicTimeMs,
            endMonotonicTimeMs,
            duration,
            endReason,
            estimated,
            diagnostic,
            diagnosticCode);
        return new UsageSegmentV2(
            AccountingSegmentId.Sha256(canonical),
            AccountingV2Constants.SchemaVersion,
            runtimeSessionID,
            application,
            channel,
            activityBasis,
            clockEpochId,
            startWallTimeMs,
            endWallTimeMs,
            startMonotonicTimeMs,
            endMonotonicTimeMs,
            duration,
            endReason,
            estimated,
            lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs,
            diagnostic,
            diagnosticCode,
            diagnosticMessage,
            policySnapshot);
    }
}

public sealed record MediaSegmentV2(
    string Id,
    int SchemaVersion,
    string RuntimeSessionID,
    ApplicationIdentity Application,
    MediaKind MediaKind,
    MediaPresentation Presentation,
    string ClockEpochId,
    long StartWallTimeMs,
    long EndWallTimeMs,
    long StartMonotonicTimeMs,
    long EndMonotonicTimeMs,
    long MonotonicDurationMilliseconds,
    SegmentEndReason EndReason,
    EstimatedMetadata Estimated,
    long LastEvidenceWallTimeMs,
    long LastEvidenceMonotonicTimeMs,
    bool AuthoritativeForUsage = false)
{
    public static MediaSegmentV2 Create(
        string runtimeSessionID,
        ApplicationIdentity application,
        MediaKind mediaKind,
        MediaPresentation presentation,
        string clockEpochId,
        long startWallTimeMs,
        long endWallTimeMs,
        long startMonotonicTimeMs,
        long endMonotonicTimeMs,
        SegmentEndReason endReason,
        EstimatedMetadata estimated,
        long lastEvidenceWallTimeMs,
        long lastEvidenceMonotonicTimeMs)
    {
        var duration = Math.Max(0, endMonotonicTimeMs - startMonotonicTimeMs);
        var canonical = AccountingSegmentId.CanonicalMedia(
            runtimeSessionID,
            application,
            mediaKind,
            presentation,
            clockEpochId,
            startWallTimeMs,
            endWallTimeMs,
            startMonotonicTimeMs,
            endMonotonicTimeMs,
            duration,
            endReason,
            estimated);
        return new MediaSegmentV2(
            AccountingSegmentId.Sha256(canonical),
            AccountingV2Constants.SchemaVersion,
            runtimeSessionID,
            application,
            mediaKind,
            presentation,
            clockEpochId,
            startWallTimeMs,
            endWallTimeMs,
            startMonotonicTimeMs,
            endMonotonicTimeMs,
            duration,
            endReason,
            estimated,
            lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs,
            false);
    }
}

public static class AccountingSegmentId
{
    public static string Sha256(string canonical)
    {
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(canonical))).ToLowerInvariant();
    }

    public static string CanonicalUsage(
        string runtimeSessionID,
        ApplicationIdentity? application,
        UsageChannel channel,
        ActivityBasis basis,
        string clockEpochId,
        long startWall,
        long endWall,
        long startMonotonic,
        long endMonotonic,
        long duration,
        SegmentEndReason endReason,
        EstimatedMetadata estimated,
        bool diagnostic,
        string? diagnosticCode)
    {
        return string.Join('\n', new[]
        {
            "usage-v2",
            runtimeSessionID,
            application?.Platform.ToString().ToLowerInvariant() ?? string.Empty,
            application?.RuntimeIdentity ?? string.Empty,
            Wire(channel),
            Wire(basis),
            clockEpochId,
            startWall.ToString(System.Globalization.CultureInfo.InvariantCulture),
            endWall.ToString(System.Globalization.CultureInfo.InvariantCulture),
            startMonotonic.ToString(System.Globalization.CultureInfo.InvariantCulture),
            endMonotonic.ToString(System.Globalization.CultureInfo.InvariantCulture),
            duration.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Wire(endReason),
            estimated.IsEstimated ? "1" : "0",
            estimated.Reason ?? string.Empty,
            estimated.CappedAtMilliseconds?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty,
            diagnostic ? "1" : "0",
            diagnosticCode ?? string.Empty,
        });
    }

    public static string CanonicalMedia(
        string runtimeSessionID,
        ApplicationIdentity application,
        MediaKind kind,
        MediaPresentation presentation,
        string clockEpochId,
        long startWall,
        long endWall,
        long startMonotonic,
        long endMonotonic,
        long duration,
        SegmentEndReason endReason,
        EstimatedMetadata estimated)
    {
        return string.Join('\n', new[]
        {
            "media-v2",
            runtimeSessionID,
            application.Platform.ToString().ToLowerInvariant(),
            application.RuntimeIdentity,
            Wire(kind),
            Wire(presentation),
            clockEpochId,
            startWall.ToString(System.Globalization.CultureInfo.InvariantCulture),
            endWall.ToString(System.Globalization.CultureInfo.InvariantCulture),
            startMonotonic.ToString(System.Globalization.CultureInfo.InvariantCulture),
            endMonotonic.ToString(System.Globalization.CultureInfo.InvariantCulture),
            duration.ToString(System.Globalization.CultureInfo.InvariantCulture),
            Wire(endReason),
            estimated.IsEstimated ? "1" : "0",
            estimated.Reason ?? string.Empty,
            estimated.CappedAtMilliseconds?.ToString(System.Globalization.CultureInfo.InvariantCulture) ?? string.Empty,
        });
    }

    public static string Wire<T>(T value) where T : struct, Enum
    {
        var text = value.ToString();
        return char.ToLowerInvariant(text[0]) + text[1..];
    }
}

public sealed record OpenAccountingLane(
    ApplicationIdentity Application,
    UsageChannel Channel,
    ActivityBasis ActivityBasis,
    string ClockEpochId,
    long StartWallTimeMs,
    long StartMonotonicTimeMs,
    long LastEvidenceWallTimeMs,
    long LastEvidenceMonotonicTimeMs,
    AccountingPolicySnapshot? PolicySnapshot = null);

public sealed record OpenMediaLane(
    ApplicationIdentity Application,
    MediaKind MediaKind,
    MediaPresentation Presentation,
    string ClockEpochId,
    long StartWallTimeMs,
    long StartMonotonicTimeMs,
    long LastEvidenceWallTimeMs,
    long LastEvidenceMonotonicTimeMs);

public sealed record PipObservation(
    ApplicationIdentity Application,
    WindowPresentationState WindowState,
    MediaEvidenceLevel MediaEvidence,
    MediaPlaybackState PlaybackState);

public sealed record MediaObservation(
    ApplicationIdentity Application,
    MediaKind MediaKind,
    MediaPresentation Presentation,
    MediaEvidenceLevel MediaEvidence,
    MediaPlaybackState PlaybackState);

public sealed record AccountingTransition(
    AccountingRuntimeState State,
    IReadOnlyList<UsageSegmentV2> UsageSegments,
    IReadOnlyList<MediaSegmentV2> MediaSegments);

public sealed record AccountingRuntimeState
{
    public required string RuntimeSessionID { get; init; }
    public string ClockEpochId { get; init; } = "epoch-0";
    public ApplicationIdentity? ForegroundApplication { get; init; }
    public WindowPresentationState ForegroundWindowState { get; init; } = WindowPresentationState.Unknown;
    public MediaEvidenceLevel ForegroundMediaEvidence { get; init; } = MediaEvidenceLevel.None;
    public MediaPlaybackState ForegroundPlaybackState { get; init; } = MediaPlaybackState.Unknown;
    public UserActivityState UserActivity { get; init; } = UserActivityState.Unknown;
    public UserSessionState SessionState { get; init; } = UserSessionState.Unknown;
    public SystemPowerState PowerState { get; init; } = SystemPowerState.Unknown;
    public OpenAccountingLane? ForegroundLane { get; init; }
    public IReadOnlyDictionary<string, PipObservation> PipObservations { get; init; } = new Dictionary<string, PipObservation>();
    public IReadOnlyDictionary<string, OpenAccountingLane> PipLanes { get; init; } = new Dictionary<string, OpenAccountingLane>();
    public IReadOnlyDictionary<string, MediaObservation> MediaObservations { get; init; } = new Dictionary<string, MediaObservation>();
    public IReadOnlyDictionary<string, OpenMediaLane> MediaLanes { get; init; } = new Dictionary<string, OpenMediaLane>();
    public long? LastProcessedWallTimeMs { get; init; }
    public long? LastProcessedMonotonicTimeMs { get; init; }
}
