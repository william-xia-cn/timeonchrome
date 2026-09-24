using System.Buffers.Binary;
using System.IO.Pipes;
using System.Globalization;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public static class BrowserBridgeProtocol
{
    public const int Version = 1;
    public const int CurrentVersion = 2;
    public const int SnapshotVersion = 3;
    public const int MaxMessageBytes = 256 * 1024;
    public const string PipeName = "TimeOnChrome.AppRuntime.BrowserBridge.v1";
    public const string PipeNameV2 = "TimeOnChrome.AppRuntime.BrowserBridge.v2";
    public const string PipeNameV3 = "TimeOnChrome.AppRuntime.BrowserBridge.v3";
    public const string NativeHostId = "com.timeonchrome.nativehost";
    public const string LegacyNativeHostId = "com.timeonchrome.guardian";
    public const string ManagedExtensionId = "jdcancbiocacabbjdkngadmjpjmkdnih";

    public static BrowserBridgeEnvelope NormalizeNativeMessage(JsonElement root)
    {
        if (root.ValueKind != JsonValueKind.Object) throw new InvalidDataException("Native message must be an object.");
        if (root.TryGetProperty("protocolVersion", out _))
        {
            return JsonSerializer.Deserialize<BrowserBridgeEnvelope>(root.GetRawText(), RuntimeJson.Options)
                ?? throw new InvalidDataException("Native envelope is empty.");
        }

        var type = root.TryGetProperty("type", out var typeValue) ? typeValue.GetString() : null;
        var extensionId = root.TryGetProperty("extensionId", out var extensionValue) ? extensionValue.GetString() : null;
        var profileId = root.TryGetProperty("profile", out var profileValue) ? profileValue.GetString() : null;
        var sentAt = root.TryGetProperty("timestamp", out var timeValue) && timeValue.TryGetInt64(out var value)
            ? value : DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        return new BrowserBridgeEnvelope(
            Version,
            Guid.NewGuid().ToString("D"),
            type == "probe" ? "probe" : "heartbeat",
            extensionId ?? string.Empty,
            profileId ?? string.Empty,
            sentAt,
            root.Clone());
    }

    public static void Validate(BrowserBridgeEnvelope envelope)
    {
        if (envelope.ProtocolVersion is not (Version or CurrentVersion or SnapshotVersion)) throw new InvalidDataException("Unsupported browser bridge protocol.");
        if (!Guid.TryParse(envelope.RequestId, out _)) throw new InvalidDataException("Browser bridge request ID is invalid.");
        if (!Guid.TryParse(envelope.ProfileId, out _)) throw new InvalidDataException("Browser profile ID is invalid.");
        if (!string.Equals(envelope.ExtensionId, ManagedExtensionId, StringComparison.Ordinal))
            throw new InvalidDataException("Browser extension is not allowed.");
        if (envelope.SentAtMs < 0) throw new InvalidDataException("Browser bridge timestamp is invalid.");
        if (envelope.MessageType is not ("heartbeat" or "probe" or "settledUsageSegments" or "dailyUsageSnapshot"))
            throw new InvalidDataException("Browser bridge message type is invalid.");
        if (envelope.ProtocolVersion == Version && envelope.MessageType == "dailyUsageSnapshot")
            throw new InvalidDataException("Browser snapshot requires protocol v3.");
        if (envelope.ProtocolVersion == CurrentVersion)
        {
            if (envelope.Channel is not ("health" or "ledger"))
                throw new InvalidDataException("Browser bridge channel is invalid.");
            if (envelope.Channel == "health" && envelope.MessageType is not ("heartbeat" or "probe"))
                throw new InvalidDataException("Health channel message type is invalid.");
            if (envelope.Channel == "ledger")
            {
                if (envelope.MessageType != "settledUsageSegments"
                    || !Guid.TryParse(envelope.BridgeEpochId, out _)
                    || !Guid.TryParse(envelope.BatchId, out _))
                    throw new InvalidDataException("Ledger channel metadata is invalid.");
            }
        }
        if (envelope.ProtocolVersion == SnapshotVersion)
        {
            if (envelope.Channel == "health" && envelope.MessageType is ("heartbeat" or "probe")) return;
            if (envelope.Channel == "statistics" && envelope.MessageType == "dailyUsageSnapshot") return;
            throw new InvalidDataException("Browser bridge v3 channel or message type is invalid.");
        }
    }

    public static string PipeFor(int protocolVersion) => protocolVersion switch
    {
        SnapshotVersion => PipeNameV3,
        CurrentVersion => PipeNameV2,
        _ => PipeName,
    };
}

public sealed record BrowserBridgeEnvelope(
    int ProtocolVersion,
    string RequestId,
    string MessageType,
    string ExtensionId,
    string ProfileId,
    long SentAtMs,
    JsonElement Payload,
    string? Channel = null,
    string? BridgeEpochId = null,
    string? BatchId = null);

public sealed record BrowserBridgeResponse(
    bool Ok,
    long ReceivedAt,
    string? RequestId = null,
    string? ErrorCode = null,
    int AcceptedCount = 0,
    IReadOnlyList<int>? SupportedProtocols = null,
    IReadOnlyList<string>? Capabilities = null,
    IReadOnlyList<string>? AcceptedIds = null,
    IReadOnlyList<string>? DuplicateIds = null,
    IReadOnlyList<BrowserBridgeRejectedSegment>? Rejected = null,
    int? RetryAfterMs = null,
    string? AcceptedRevision = null,
    bool Duplicate = false,
    bool Stale = false);

public sealed record BrowserBridgeRejectedSegment(string SegmentId, string ErrorCode, bool Retryable);
public sealed record BrowserBridgeAppendResult(
    IReadOnlyList<string> AcceptedIds,
    IReadOnlyList<string> DuplicateIds,
    IReadOnlyList<BrowserBridgeRejectedSegment> Rejected);

public sealed record BrowserBridgeHealthSummary(
    int ProtocolVersion,
    long LastHeartbeatAtMs,
    long LastProbeAtMs,
    long LastLedgerAckAtMs,
    int PendingSendCount,
    int PendingProjectionCount,
    long AcceptedCount,
    long DuplicateCount,
    long RejectedCount,
    string? LastErrorCode);

public sealed record BrowserSettledUsageSegment(
    string SegmentId,
    long StartMs,
    long EndMs,
    long DurationMs,
    string Channel,
    string SourceState,
    string? QuotaBucket,
    string? Mode,
    bool Estimated,
    bool Diagnostic);

public sealed record BrowserSettledUsagePayload(IReadOnlyList<BrowserSettledUsageSegment> Segments);

public sealed record BrowserUsageEvidenceInterval(long StartMs, long EndMs, long CreditedSeconds, string QuotaBucket);

public sealed record BrowserDailyUsageSnapshot(
    string Date,
    string SnapshotRevision,
    string StatisticsRevision,
    string CorrectionRevision,
    long ComputedAtMs,
    long ActiveSeconds,
    IReadOnlyDictionary<string, long> QuotaBucketSeconds,
    bool Complete,
    IReadOnlyList<string> IncompleteReasonCodes,
    IReadOnlyList<BrowserUsageEvidenceInterval> Intervals);

public static class BrowserDailySnapshotValidator
{
    public static void Validate(BrowserDailyUsageSnapshot snapshot)
    {
        ArgumentNullException.ThrowIfNull(snapshot);
        if (!DateOnly.TryParseExact(snapshot.Date, "yyyy-MM-dd", CultureInfo.InvariantCulture,
                DateTimeStyles.None, out var date))
            throw new InvalidDataException("Browser snapshot date is invalid.");
        if (string.IsNullOrWhiteSpace(snapshot.SnapshotRevision) || snapshot.SnapshotRevision.Length > 128
            || string.IsNullOrWhiteSpace(snapshot.StatisticsRevision) || snapshot.StatisticsRevision.Length > 128
            || string.IsNullOrWhiteSpace(snapshot.CorrectionRevision) || snapshot.CorrectionRevision.Length > 128
            || snapshot.ComputedAtMs < 0 || snapshot.ActiveSeconds < 0
            || snapshot.QuotaBucketSeconds is null || snapshot.Intervals is null
            || snapshot.IncompleteReasonCodes is null || snapshot.Intervals.Count > 2000)
            throw new InvalidDataException("Browser snapshot metadata is invalid.");
        if (snapshot.QuotaBucketSeconds.Any(entry => string.IsNullOrWhiteSpace(entry.Key)
                || entry.Key.Length > 64 || entry.Value < 0))
            throw new InvalidDataException("Browser snapshot quota buckets are invalid.");
        var bucketTotal = checked(snapshot.QuotaBucketSeconds.Values.Sum());
        if (bucketTotal > snapshot.ActiveSeconds || (snapshot.Complete && bucketTotal != snapshot.ActiveSeconds))
            throw new InvalidDataException("Browser snapshot quota total is not conserved.");
        if (snapshot.Complete && snapshot.IncompleteReasonCodes.Count != 0)
            throw new InvalidDataException("Complete browser snapshot has missing evidence.");
        var dayStart = new DateTimeOffset(date.Year, date.Month, date.Day, 0, 0, 0,
            TimeSpan.FromHours(8)).ToUnixTimeMilliseconds();
        var dayEnd = dayStart + 86_400_000;
        var evidenceByBucket = new Dictionary<string, long>(StringComparer.Ordinal);
        long previousEnd = dayStart;
        foreach (var interval in snapshot.Intervals.OrderBy(item => item.StartMs))
        {
            if (interval.StartMs < dayStart || interval.EndMs > dayEnd || interval.EndMs <= interval.StartMs
                || interval.StartMs < previousEnd || interval.CreditedSeconds < 0
                || interval.CreditedSeconds > (interval.EndMs - interval.StartMs + 999) / 1000
                || string.IsNullOrWhiteSpace(interval.QuotaBucket)
                || !snapshot.QuotaBucketSeconds.ContainsKey(interval.QuotaBucket))
                throw new InvalidDataException("Browser snapshot interval evidence is invalid.");
            evidenceByBucket[interval.QuotaBucket] = checked(
                evidenceByBucket.GetValueOrDefault(interval.QuotaBucket) + interval.CreditedSeconds);
            previousEnd = interval.EndMs;
        }
        foreach (var bucket in snapshot.QuotaBucketSeconds)
        {
            var evidence = evidenceByBucket.GetValueOrDefault(bucket.Key);
            if (evidence > bucket.Value || (snapshot.Complete && evidence != bucket.Value))
                throw new InvalidDataException("Browser snapshot evidence does not match authoritative quota seconds.");
        }
    }
}

public static class NativeMessagingFraming
{
    public static async Task<JsonDocument?> ReadAsync(Stream input, CancellationToken cancellationToken = default)
    {
        var header = new byte[4];
        var first = await input.ReadAsync(header.AsMemory(0, 4), cancellationToken).ConfigureAwait(false);
        if (first == 0) return null;
        while (first < 4)
        {
            var read = await input.ReadAsync(header.AsMemory(first, 4 - first), cancellationToken).ConfigureAwait(false);
            if (read == 0) throw new EndOfStreamException("Native message header is incomplete.");
            first += read;
        }
        var length = BinaryPrimitives.ReadInt32LittleEndian(header);
        if (length <= 0 || length > BrowserBridgeProtocol.MaxMessageBytes)
            throw new InvalidDataException("Native message length is invalid.");
        var payload = new byte[length];
        var offset = 0;
        while (offset < length)
        {
            var read = await input.ReadAsync(payload.AsMemory(offset, length - offset), cancellationToken).ConfigureAwait(false);
            if (read == 0) throw new EndOfStreamException("Native message payload is incomplete.");
            offset += read;
        }
        return JsonDocument.Parse(payload);
    }

    public static async Task WriteAsync<T>(Stream output, T value, CancellationToken cancellationToken = default)
    {
        var payload = JsonSerializer.SerializeToUtf8Bytes(value, RuntimeJson.Options);
        if (payload.Length > BrowserBridgeProtocol.MaxMessageBytes)
            throw new InvalidDataException("Native response is too large.");
        var header = new byte[4];
        BinaryPrimitives.WriteInt32LittleEndian(header, payload.Length);
        await output.WriteAsync(header, cancellationToken).ConfigureAwait(false);
        await output.WriteAsync(payload, cancellationToken).ConfigureAwait(false);
        await output.FlushAsync(cancellationToken).ConfigureAwait(false);
    }
}

public static class BrowserBridgePipeClient
{
    public const TokenImpersonationLevel RequiredImpersonationLevel = TokenImpersonationLevel.Impersonation;

    public static NamedPipeClientStream Create(int protocolVersion = BrowserBridgeProtocol.Version) => new(
        ".", BrowserBridgeProtocol.PipeFor(protocolVersion), PipeDirection.InOut, PipeOptions.Asynchronous,
        RequiredImpersonationLevel);
}

public static class BrowserBridgeSecurity
{
    public static PipeSecurity CreatePipeSecurity()
    {
        var security = new PipeSecurity();
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
            PipeAccessRights.FullControl, AccessControlType.Allow));
        security.AddAccessRule(new PipeAccessRule(
            new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null),
            PipeAccessRights.ReadWrite, AccessControlType.Allow));
        return security;
    }

    public static bool IsAllowedClient(string? processPath, string installedHostPath, int sessionId, string? sid)
    {
        if (sessionId < 0 || string.IsNullOrWhiteSpace(sid)) return false;
        try
        {
            if (!string.Equals(Path.GetFullPath(processPath ?? string.Empty), Path.GetFullPath(installedHostPath),
                    StringComparison.OrdinalIgnoreCase)) return false;
        }
        catch (Exception exception) when (exception is ArgumentException or NotSupportedException or PathTooLongException)
        {
            return false;
        }
        try { _ = new SecurityIdentifier(sid); }
        catch (ArgumentException) { return false; }
        return true;
    }
}
