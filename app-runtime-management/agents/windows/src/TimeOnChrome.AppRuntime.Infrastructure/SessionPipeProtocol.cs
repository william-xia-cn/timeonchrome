using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public static class SessionPipeNames
{
    public const string Control = "TimeOnChrome.AppRuntime.v2.control";

    public static string Facts(int sessionId)
    {
        if (sessionId < 0) throw new ArgumentOutOfRangeException(nameof(sessionId));
        return $"TimeOnChrome.AppRuntime.v2.session.{sessionId}";
    }
}

public sealed record SessionFactMessage(int SchemaVersion, RuntimeFact Fact);

public sealed record MachineControlCommand(string Action, string? Code = null, string? DisplayName = null);

public sealed record MachineControlResponse(
    bool Success,
    string State,
    string? ErrorCode = null,
    string? ServiceVersion = null,
    long UpdatedAtMs = 0);
