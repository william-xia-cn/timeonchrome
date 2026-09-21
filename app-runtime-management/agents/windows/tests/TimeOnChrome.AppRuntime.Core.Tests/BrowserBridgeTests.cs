using System.Text.Json;
using System.Security.AccessControl;
using System.Security.Principal;
using System.IO.Pipes;
using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class BrowserBridgeTests
{
    [Fact]
    public async Task NativeFramingRoundTripsEnvelope()
    {
        var envelope = Envelope("heartbeat", JsonSerializer.SerializeToElement(new { status = "active" }));
        await using var stream = new MemoryStream();
        await NativeMessagingFraming.WriteAsync(stream, envelope);
        stream.Position = 0;

        using var document = await NativeMessagingFraming.ReadAsync(stream);
        var actual = JsonSerializer.Deserialize<BrowserBridgeEnvelope>(document!.RootElement.GetRawText(), RuntimeJson.Options);

        Assert.NotNull(actual);
        Assert.Equal(envelope.ProtocolVersion, actual.ProtocolVersion);
        Assert.Equal(envelope.RequestId, actual.RequestId);
        Assert.Equal(envelope.MessageType, actual.MessageType);
        Assert.Equal(envelope.ExtensionId, actual.ExtensionId);
        Assert.Equal(envelope.ProfileId, actual.ProfileId);
        Assert.Equal(envelope.SentAtMs, actual.SentAtMs);
        Assert.Equal(envelope.Payload.GetRawText(), actual.Payload.GetRawText());
    }

    [Fact]
    public void LegacyHeartbeatNormalizesToVersionedEnvelope()
    {
        using var document = JsonDocument.Parse("""
            {"type":"heartbeat","extensionId":"jdcancbiocacabbjdkngadmjpjmkdnih",
             "profile":"6c36e3a4-509f-48d4-bc5c-06408a96c03c","timestamp":42}
            """);

        var envelope = BrowserBridgeProtocol.NormalizeNativeMessage(document.RootElement);
        BrowserBridgeProtocol.Validate(envelope);

        Assert.Equal(1, envelope.ProtocolVersion);
        Assert.Equal("heartbeat", envelope.MessageType);
        Assert.Equal(42, envelope.SentAtMs);
    }

    [Fact]
    public void ProtocolRejectsUnexpectedExtension()
    {
        var envelope = Envelope("heartbeat", JsonSerializer.SerializeToElement(new { })) with
        {
            ExtensionId = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        };

        Assert.Throws<InvalidDataException>(() => BrowserBridgeProtocol.Validate(envelope));
    }

    [Fact]
    public void PipeSecurityAllowsAuthenticatedUsersButClientMustMatchInstalledHost()
    {
        var security = BrowserBridgeSecurity.CreatePipeSecurity();
        var rules = security.GetAccessRules(true, false, typeof(SecurityIdentifier))
            .Cast<PipeAccessRule>().ToArray();
        Assert.Contains(rules, rule => ((SecurityIdentifier)rule.IdentityReference).IsWellKnown(WellKnownSidType.LocalSystemSid)
            && rule.AccessControlType == AccessControlType.Allow);
        Assert.Contains(rules, rule => ((SecurityIdentifier)rule.IdentityReference).IsWellKnown(WellKnownSidType.AuthenticatedUserSid)
            && rule.AccessControlType == AccessControlType.Allow);

        var host = Path.Combine(Path.GetTempPath(), "TimeOnChrome.NativeHost.exe");
        Assert.True(BrowserBridgeSecurity.IsAllowedClient(host, host, 1, "S-1-5-21-1-2-3-1001"));
        Assert.False(BrowserBridgeSecurity.IsAllowedClient(Path.Combine(Path.GetTempPath(), "other.exe"), host,
            1, "S-1-5-21-1-2-3-1001"));
        Assert.False(BrowserBridgeSecurity.IsAllowedClient(host, host, -1, "S-1-5-21-1-2-3-1001"));
    }

    [Fact]
    public void PipeClientRequestsImpersonationForServiceSidValidation()
    {
        Assert.Equal(TokenImpersonationLevel.Impersonation,
            BrowserBridgePipeClient.RequiredImpersonationLevel);
        using var client = BrowserBridgePipeClient.Create();
        Assert.NotNull(client);
    }

    [Fact]
    public async Task MirrorStoreIsIdempotentAndKeepsOnlyPrivacySafeFields()
    {
        var root = Path.Combine(Path.GetTempPath(), $"toc-browser-mirror-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var store = new BrowserUsageMirrorStore(Path.Combine(root, "runtime.db"));
            await store.InitializeAsync();
            var segments = new[]
            {
                new BrowserSettledUsageSegment("seg-1", 100, 200, 100, "active", "ACTIVE",
                    "pending_composite", "composite", false, false),
            };

            var profileId = Guid.NewGuid().ToString("D");
            Assert.Equal(1, await store.AppendAsync(1, "opaque-user", profileId,
                BrowserBridgeProtocol.ManagedExtensionId, segments, 300));
            Assert.Equal(0, await store.AppendAsync(1, "opaque-user", profileId,
                BrowserBridgeProtocol.ManagedExtensionId, segments, 301));
            Assert.Equal(1, await store.CountAsync());
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task ManifestWriterUsesAbsoluteExecutableAndBothAliases()
    {
        var root = Path.Combine(Path.GetTempPath(), $"toc-native-manifest-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var executable = Path.Combine(root, "TimeOnChrome.NativeHost.exe");
            await NativeMessagingManifestWriter.WriteAsync(root, executable);
            foreach (var id in new[] { BrowserBridgeProtocol.NativeHostId, BrowserBridgeProtocol.LegacyNativeHostId })
            {
                using var manifest = JsonDocument.Parse(await File.ReadAllTextAsync(Path.Combine(root, $"{id}.json")));
                Assert.Equal(id, manifest.RootElement.GetProperty("name").GetString());
                Assert.Equal(Path.GetFullPath(executable), manifest.RootElement.GetProperty("path").GetString());
                Assert.Equal($"chrome-extension://{BrowserBridgeProtocol.ManagedExtensionId}/",
                    manifest.RootElement.GetProperty("allowed_origins")[0].GetString());
            }
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task ShadowStoreProjectsBrowserOverChromeContainer()
    {
        var root = Path.Combine(Path.GetTempPath(), $"toc-shadow-store-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        var database = Path.Combine(root, "runtime.db");
        try
        {
            var store = new BrowserUsageMirrorStore(database);
            await store.InitializeAsync();
            var app = UsageSegmentV2.Create(
                "runtime-session", new ApplicationIdentity(RuntimePlatform.Windows, "chrome-id", "chrome"),
                UsageChannel.Active, ActivityBasis.ForegroundInteraction, "epoch", 0, 100, 0, 100,
                SegmentEndReason.StateCorrection, EstimatedMetadata.Exact, 100, 100,
                policySnapshot: new AccountingPolicySnapshot(1, "composite"));
            await using (var connection = new SqliteConnection(new SqliteConnectionStringBuilder
            {
                DataSource = database,
                Pooling = false,
            }.ToString()))
            {
                await connection.OpenAsync();
                await using var command = connection.CreateCommand();
                command.CommandText = """
                    CREATE TABLE machine_usage_segments_v2(local_user_id TEXT NOT NULL,payload_json TEXT NOT NULL);
                    INSERT INTO machine_usage_segments_v2(local_user_id,payload_json) VALUES($user,$payload);
                    """;
                command.Parameters.AddWithValue("$user", "opaque-user");
                command.Parameters.AddWithValue("$payload", JsonSerializer.Serialize(app, RuntimeJson.Options));
                await command.ExecuteNonQueryAsync();
            }
            var profile = Guid.NewGuid().ToString("D");
            await store.AppendAsync(1, "opaque-user", profile, BrowserBridgeProtocol.ManagedExtensionId,
                [new BrowserSettledUsageSegment("web", 20, 80, 60, "active", "ACTIVE",
                    "study", "study", false, false)], 100);

            var shadow = await store.RebuildShadowAsync("opaque-user", 0, 100);

            Assert.Collection(shadow,
                item => Assert.Equal((0L, 20L, SharedQuotaShadowSource.Application),
                    (item.StartMs, item.EndMs, item.Source)),
                item => Assert.Equal((20L, 80L, SharedQuotaShadowSource.Browser),
                    (item.StartMs, item.EndMs, item.Source)),
                item => Assert.Equal((80L, 100L, SharedQuotaShadowSource.Application),
                    (item.StartMs, item.EndMs, item.Source)));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    private static BrowserBridgeEnvelope Envelope(string type, JsonElement payload) => new(
        BrowserBridgeProtocol.Version,
        Guid.NewGuid().ToString("D"),
        type,
        BrowserBridgeProtocol.ManagedExtensionId,
        Guid.NewGuid().ToString("D"),
        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
        payload);
}
