using System.IO.Pipes;
using System.Security.Principal;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public static class SessionPipeNames
{
    public const string Control = "TimeOnChrome.AppRuntime.v2.control";
    public const string Status = "TimeOnChrome.AppRuntime.v2.status";

    public static string Facts(int sessionId)
    {
        if (sessionId < 0) throw new ArgumentOutOfRangeException(nameof(sessionId));
        return $"TimeOnChrome.AppRuntime.v2.session.{sessionId}";
    }
}

public static class MachineControlPipeClient
{
    public static NamedPipeClientStream Create(string? pipeName = null) => new(
        ".",
        pipeName ?? SessionPipeNames.Control,
        PipeDirection.InOut,
        PipeOptions.Asynchronous,
        TokenImpersonationLevel.Impersonation);

    public static NamedPipeClientStream CreateStatus(string? pipeName = null) => new(
        ".",
        pipeName ?? SessionPipeNames.Status,
        PipeDirection.InOut,
        PipeOptions.Asynchronous,
        TokenImpersonationLevel.Identification);
}

public sealed record SessionFactMessage(int SchemaVersion, RuntimeFact Fact);

public sealed record SessionAccountingFactMessage(int SchemaVersion, AccountingRuntimeFact Fact);
public sealed record SessionApplicationInventoryMessage(int SchemaVersion, IReadOnlyList<AppEvidence> Applications, string Status,
    IReadOnlyList<string>? CompleteIdentitySet = null, ApplicationInventoryScan? Scan = null);

public sealed record MachineControlCommand(string Action, string? Code = null, string? DisplayName = null);

public sealed record MachinePublicStatusResponse(
    bool Success,
    string State,
    string? ErrorCode = null,
    string? ServiceVersion = null,
    long ServiceStartedAtMs = 0,
    long LastHeartbeatSucceededAtMs = 0,
    bool HasPendingUploads = false);

public sealed record MachineControlResponse(
    bool Success,
    string State,
    string? ErrorCode = null,
    string? ServiceVersion = null,
    long UpdatedAtMs = 0,
    long ServiceStartedAtMs = 0,
    long LastPolicySucceededAtMs = 0,
    long LastPolicyFailedAtMs = 0,
    long LastHeartbeatSucceededAtMs = 0,
    long LastHeartbeatFailedAtMs = 0,
    long LastUsageUploadSucceededAtMs = 0,
    long LastUsageUploadFailedAtMs = 0,
    long LastMediaUploadSucceededAtMs = 0,
    long LastMediaUploadFailedAtMs = 0,
    long LastLogUploadSucceededAtMs = 0,
    long LastLogUploadFailedAtMs = 0,
    long DesiredPolicyVersion = 0,
    long AppliedPolicyVersion = 0,
    int LegacyOutboxCount = 0,
    int UsageOutboxCount = 0,
    int MediaOutboxCount = 0,
    int LogOutboxCount = 0,
    int ActiveSessionCount = 0,
    int ProtectedSessionCount = 0,
    int AgentCount = 0,
    int TamperCount = 0,
    int WarningCount24h = 0,
    int ErrorCount24h = 0,
    string? LastStableErrorCode = null,
    string? RemoteLoggingState = null,
    string? RemoteLoggingMinLevel = null,
    long RemoteLoggingExpiresAtMs = 0);
