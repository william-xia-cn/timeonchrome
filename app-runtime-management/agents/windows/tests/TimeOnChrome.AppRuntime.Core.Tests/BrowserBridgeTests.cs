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
    public async Task NativeFramingTreatsCleanInputCloseAsNormalEndOfStream()
    {
        await using var stream = new MemoryStream();
        using var document = await NativeMessagingFraming.ReadAsync(stream);

        Assert.Null(document);
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
    public void VersionTwoRequiresChannelAndLedgerBatchIdentity()
    {
        var valid = Envelope("settledUsageSegments", JsonSerializer.SerializeToElement(new { segments = Array.Empty<object>() })) with
        {
            ProtocolVersion = BrowserBridgeProtocol.CurrentVersion,
            Channel = "ledger",
            BridgeEpochId = Guid.NewGuid().ToString("D"),
            BatchId = Guid.NewGuid().ToString("D"),
        };
        BrowserBridgeProtocol.Validate(valid);
        Assert.Equal(BrowserBridgeProtocol.PipeNameV2, BrowserBridgeProtocol.PipeFor(valid.ProtocolVersion));
        Assert.Throws<InvalidDataException>(() => BrowserBridgeProtocol.Validate(valid with { BatchId = null }));
        Assert.Throws<InvalidDataException>(() => BrowserBridgeProtocol.Validate(valid with { Channel = "health" }));
    }

    [Fact]
    public void VersionThreeAllowsOnlyHealthAndAuthoritativeStatistics()
    {
        var snapshot = Envelope("dailyUsageSnapshot", JsonSerializer.SerializeToElement(new { date = "2026-09-25" })) with
        {
            ProtocolVersion = BrowserBridgeProtocol.SnapshotVersion,
            Channel = "statistics",
        };
        BrowserBridgeProtocol.Validate(snapshot);
        Assert.Equal(BrowserBridgeProtocol.PipeNameV3, BrowserBridgeProtocol.PipeFor(snapshot.ProtocolVersion));
        Assert.Throws<InvalidDataException>(() => BrowserBridgeProtocol.Validate(snapshot with { Channel = "ledger" }));
        Assert.Throws<InvalidDataException>(() => BrowserBridgeProtocol.Validate(snapshot with { MessageType = "settledUsageSegments" }));
        BrowserBridgeProtocol.Validate(snapshot with { Channel = "health", MessageType = "heartbeat" });
    }

    [Fact]
    public void SnapshotEvidenceMustConserveAuthoritativeIntegerSeconds()
    {
        var dayStart = new DateTimeOffset(2026, 9, 25, 0, 0, 0, TimeSpan.FromHours(8))
            .ToUnixTimeMilliseconds();
        var valid = new BrowserDailyUsageSnapshot("2026-09-25", "snapshot-1", "stats-1", "correction-1",
            dayStart + 60_000, 60, new Dictionary<string, long> { ["study"] = 60 },
            true, [], [new BrowserUsageEvidenceInterval(dayStart, dayStart + 60_000, 60, "study")]);
        BrowserDailySnapshotValidator.Validate(valid);
        Assert.Throws<InvalidDataException>(() => BrowserDailySnapshotValidator.Validate(valid with
        {
            Intervals = [new BrowserUsageEvidenceInterval(dayStart, dayStart + 60_000, 59, "study")],
        }));
        Assert.Throws<InvalidDataException>(() => BrowserDailySnapshotValidator.Validate(valid with
        {
            QuotaBucketSeconds = new Dictionary<string, long> { ["study"] = 61 },
        }));
        BrowserDailySnapshotValidator.Validate(valid with
        {
            Complete = false,
            IncompleteReasonCodes = ["CORRECTION_PAGE_MISSING"],
            Intervals = [],
        });
    }

    [Fact]
    public async Task SnapshotReplacementIsIdempotentAndRejectsStaleRevision()
    {
        var database = Path.Combine(Path.GetTempPath(), $"browser-snapshot-{Guid.NewGuid():N}.sqlite");
        try
        {
            var store = new BrowserDailySnapshotStore(database);
            await store.InitializeAsync();
            var start = new DateTimeOffset(2026, 9, 25, 0, 0, 0, TimeSpan.FromHours(8))
                .ToUnixTimeMilliseconds();
            var snapshot = new BrowserDailyUsageSnapshot("2026-09-25", "revision-1", "stats-1", "correction-1",
                start + 60_000, 60, new Dictionary<string, long> { ["study"] = 60 },
                true, [], [new BrowserUsageEvidenceInterval(start, start + 60_000, 60, "study")]);
            var profile = Guid.NewGuid().ToString("D");
            Assert.True((await store.ReplaceAsync(1, "opaque-user", profile, snapshot, start + 61_000)).Accepted);
            Assert.True((await store.ReplaceAsync(1, "opaque-user", profile,
                snapshot with { ComputedAtMs = start + 62_000 }, start + 62_000)).Duplicate);
            await Assert.ThrowsAsync<InvalidDataException>(() => store.ReplaceAsync(1, "opaque-user", profile,
                snapshot with { Complete = false, IncompleteReasonCodes = ["EVIDENCE_MISSING"] }, start + 63_000));
            Assert.True((await store.ReplaceAsync(1, "opaque-user", profile,
                snapshot with { SnapshotRevision = "revision-older", ComputedAtMs = start + 59_000 },
                start + 63_000)).Stale);
            Assert.True((await store.ReplaceAsync(1, "opaque-user", profile,
                snapshot with { SnapshotRevision = "revision-2", ComputedAtMs = start + 64_000 },
                start + 64_000)).Accepted);
        }
        finally
        {
            SqliteConnection.ClearAllPools();
            if (File.Exists(database)) File.Delete(database);
        }
    }

    [Fact]
    public void OverlapAdjustmentNeverGuessesFractionalPlacement()
    {
        var browser = new[] { new BrowserCreditedInterval(0, 60_000, 60) };
        var sameAppTwice = new[]
        {
            new ApplicationTimeInterval(10_000, 40_000),
            new ApplicationTimeInterval(20_000, 30_000),
        };
        var exact = BrowserOverlapCalculator.Calculate(browser, sameAppTwice);
        Assert.True(exact.Available);
        Assert.Equal(30, exact.AdjustmentSeconds);

        var ambiguous = BrowserOverlapCalculator.Calculate(
            [new BrowserCreditedInterval(0, 60_100, 60)],
            [new ApplicationTimeInterval(10_000, 40_000)]);
        Assert.False(ambiguous.Available);
        Assert.Equal("FRACTIONAL_OVERLAP_AMBIGUOUS", ambiguous.UnavailableReasonCode);
        Assert.Equal(0, ambiguous.AdjustmentSeconds);
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
    public void PublicStatusOmitsAdministrativeBridgeCountersAndIdentifiers()
    {
        var publicJson = JsonSerializer.Serialize(new MachinePublicStatusResponse(
            true, "online", BrowserBridgeProtocolVersion: 2, BrowserBridgeLastSuccessAtMs: 123), RuntimeJson.Options);
        var adminJson = JsonSerializer.Serialize(new MachineControlResponse(
            true, "online", BrowserBridgeProtocolVersion: 2, BrowserBridgeAcceptedCount: 12,
            BrowserBridgeDuplicateCount: 3, BrowserBridgeRejectedCount: 1), RuntimeJson.Options);

        Assert.Contains("browserBridgeProtocolVersion", publicJson);
        Assert.Contains("browserBridgeLastSuccessAtMs", publicJson);
        Assert.DoesNotContain("browserBridgeAcceptedCount", publicJson);
        Assert.DoesNotContain("profileId", publicJson, StringComparison.OrdinalIgnoreCase);
        Assert.DoesNotContain("segmentId", publicJson, StringComparison.OrdinalIgnoreCase);
        Assert.Contains("browserBridgeAcceptedCount", adminJson);
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
    public async Task VersionTwoReturnsPerItemAckAndPersistsProjectionWorkAtomically()
    {
        var root = Path.Combine(Path.GetTempPath(), $"toc-browser-ack-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var store = new BrowserUsageMirrorStore(Path.Combine(root, "runtime.db"));
            await store.InitializeAsync();
            var profile = Guid.NewGuid().ToString("D");
            var valid = new BrowserSettledUsageSegment("accepted", 100, 200, 100, "active", "ACTIVE",
                "study", "study", false, false);
            var invalid = valid with { SegmentId = "rejected", EndMs = 50 };

            var first = await store.AppendV2Async(1, "opaque-user", profile,
                BrowserBridgeProtocol.ManagedExtensionId, [valid, invalid], 300);
            var replay = await store.AppendV2Async(1, "opaque-user", profile,
                BrowserBridgeProtocol.ManagedExtensionId, [valid], 301);

            Assert.Equal(["accepted"], first.AcceptedIds);
            Assert.Equal("rejected", Assert.Single(first.Rejected).SegmentId);
            Assert.False(first.Rejected[0].Retryable);
            Assert.Equal(["accepted"], replay.DuplicateIds);
            Assert.True(await store.PendingProjectionCountAsync() >= 1);
            Assert.True(await store.ProcessNextDirtyRangeAsync());
            Assert.Equal(0, await store.PendingProjectionCountAsync());
            var health = await store.HealthSummaryAsync(true);
            Assert.Equal(1, health.AcceptedCount);
            Assert.Equal(1, health.DuplicateCount);
            Assert.Equal(1, health.RejectedCount);
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task MirrorRejectsBatchesLargerThanOneHundred()
    {
        var root = Path.Combine(Path.GetTempPath(), $"toc-browser-limit-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var store = new BrowserUsageMirrorStore(Path.Combine(root, "runtime.db"));
            await store.InitializeAsync();
            var segments = Enumerable.Range(0, 101).Select(index =>
                new BrowserSettledUsageSegment($"segment-{index}", index, index + 1, 1, "active", "ACTIVE",
                    null, null, false, false)).ToArray();
            await Assert.ThrowsAsync<InvalidDataException>(() => store.AppendV2Async(1, "opaque-user",
                Guid.NewGuid().ToString("D"), BrowserBridgeProtocol.ManagedExtensionId, segments, 500));
        }
        finally
        {
            Directory.Delete(root, recursive: true);
        }
    }

    [Fact]
    public async Task TenThousandSegmentsStayInBoundedBatchesAndProjectAsOneMergedRange()
    {
        var root = Path.Combine(Path.GetTempPath(), $"toc-browser-volume-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var store = new BrowserUsageMirrorStore(Path.Combine(root, "runtime.db"));
            await store.InitializeAsync();
            var profile = Guid.NewGuid().ToString("D");
            BrowserSettledUsageSegment[]? firstBatch = null;

            for (var batchIndex = 0; batchIndex < 100; batchIndex++)
            {
                var segments = Enumerable.Range(batchIndex * 100, 100).Select(index =>
                    new BrowserSettledUsageSegment($"segment-{index}", index * 10L, (index + 1) * 10L,
                        10, "active", "ACTIVE", "study", "study", false, false)).ToArray();
                firstBatch ??= segments;
                var result = await store.AppendV2Async(1, "opaque-user", profile,
                    BrowserBridgeProtocol.ManagedExtensionId, segments, 20_000 + batchIndex);
                Assert.Equal(100, result.AcceptedIds.Count);
                Assert.Empty(result.DuplicateIds);
            }

            var replay = await store.AppendV2Async(1, "opaque-user", profile,
                BrowserBridgeProtocol.ManagedExtensionId, firstBatch!, 30_000);

            Assert.Empty(replay.AcceptedIds);
            Assert.Equal(100, replay.DuplicateIds.Count);
            Assert.Equal(10_000, await store.CountAsync());
            Assert.Equal(100, await store.PendingProjectionCountAsync());
            Assert.True(await store.ProcessNextDirtyRangeAsync());
            Assert.Equal(0, await store.PendingProjectionCountAsync());
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
