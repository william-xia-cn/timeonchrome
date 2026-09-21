using System.Buffers.Binary;
using System.IO.Pipes;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public static class BrowserBridgeProtocol
{
    public const int Version = 1;
    public const int MaxMessageBytes = 256 * 1024;
    public const string PipeName = "TimeOnChrome.AppRuntime.BrowserBridge.v1";
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
        if (envelope.ProtocolVersion != Version) throw new InvalidDataException("Unsupported browser bridge protocol.");
        if (!Guid.TryParse(envelope.RequestId, out _)) throw new InvalidDataException("Browser bridge request ID is invalid.");
        if (!Guid.TryParse(envelope.ProfileId, out _)) throw new InvalidDataException("Browser profile ID is invalid.");
        if (!string.Equals(envelope.ExtensionId, ManagedExtensionId, StringComparison.Ordinal))
            throw new InvalidDataException("Browser extension is not allowed.");
        if (envelope.SentAtMs < 0) throw new InvalidDataException("Browser bridge timestamp is invalid.");
        if (envelope.MessageType is not ("heartbeat" or "probe" or "settledUsageSegments"))
            throw new InvalidDataException("Browser bridge message type is invalid.");
    }
}

public sealed record BrowserBridgeEnvelope(
    int ProtocolVersion,
    string RequestId,
    string MessageType,
    string ExtensionId,
    string ProfileId,
    long SentAtMs,
    JsonElement Payload);

public sealed record BrowserBridgeResponse(
    bool Ok,
    long ReceivedAt,
    string? RequestId = null,
    string? ErrorCode = null,
    int AcceptedCount = 0);

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

    public static NamedPipeClientStream Create() => new(
        ".", BrowserBridgeProtocol.PipeName, PipeDirection.InOut, PipeOptions.Asynchronous,
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
