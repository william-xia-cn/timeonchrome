using System.Text.Json;
using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class BrowserSharedDailyTests
{
    [Fact]
    public void PreciseOverlapUsesWebAuthorityWithoutReclassifying()
    {
        var result = BrowserSharedDailyProjector.Project(60, true,
            [new BrowserCreditedInterval(0, 60_000, 60)],
            [new ApplicationCreditedInterval(30_000, 90_000, 60_000)], true);
        Assert.True(result.Available);
        Assert.Equal(30, result.OverlapAdjustmentSeconds);
        Assert.Equal(90, result.SharedSeconds);
        Assert.Equal(60, result.BrowserSeconds);
    }

    [Fact]
    public void MissingOrAmbiguousEvidenceNeverPublishesSharedTotal()
    {
        var browser = new[] { new BrowserCreditedInterval(0, 1_500, 1) };
        Assert.False(BrowserSharedDailyProjector.Project(1, false, browser, [], true).Available);
        Assert.Equal("SESSION_MAPPING_INCOMPLETE", BrowserSharedDailyProjector.Project(1, true, browser, [], false).UnavailableReasonCode);
        Assert.Equal("APPLICATION_CLOCK_AMBIGUOUS", BrowserSharedDailyProjector.Project(1, true, browser,
            [new ApplicationCreditedInterval(0, 1_500, 1_000)], true).UnavailableReasonCode);
        Assert.Null(BrowserSharedDailyProjector.Project(1, true, browser,
            [new ApplicationCreditedInterval(500, 1_500, 1_000)], true).SharedSeconds);
    }

    [Fact]
    public async Task SnapshotAndApplicationRebuildUsesSameSessionAndPreservesRevisions()
    {
        var root = Path.Combine(Path.GetTempPath(), $"toc-browser-v3-{Guid.NewGuid():N}");
        Directory.CreateDirectory(root);
        try
        {
            var database = Path.Combine(root, "runtime.db");
            var store = new BrowserDailySnapshotStore(database);
            await store.InitializeAsync();
            await using (var connection = new SqliteConnection($"Data Source={database};Pooling=False"))
            {
                await connection.OpenAsync();
                await using var table = connection.CreateCommand();
                table.CommandText = "CREATE TABLE machine_usage_segments_v2(local_user_id TEXT NOT NULL,payload_json TEXT NOT NULL);";
                await table.ExecuteNonQueryAsync();
            }
            var midnight = new DateTimeOffset(2026, 9, 21, 0, 0, 0, TimeSpan.FromHours(8)).ToUnixTimeMilliseconds();
            var profile = Guid.NewGuid().ToString("D");
            var snapshot = new BrowserDailyUsageSnapshot("2026-09-21", "revision-1", "statistics-1", "corrections-1",
                midnight + 100_000, 60, new Dictionary<string, long> { ["study"] = 60 }, true, [],
                [new BrowserUsageEvidenceInterval(midnight, midnight + 60_000, 60, "study")]);
            await store.RecordRuntimeSessionAsync(1, "opaque-user", "runtime-1");
            Assert.True((await store.ReplaceAsync(1, "opaque-user", profile, snapshot, midnight + 100_001)).Accepted);
            Assert.True((await store.ReplaceAsync(1, "opaque-user", profile, snapshot, midnight + 100_002)).Duplicate);
            var app = UsageSegmentV2.Create("runtime-1", new ApplicationIdentity(RuntimePlatform.Windows, "app-1", "App"),
                UsageChannel.Active, ActivityBasis.ForegroundInteraction, "epoch", midnight + 30_000,
                midnight + 90_000, 30_000, 90_000, SegmentEndReason.StateCorrection,
                EstimatedMetadata.Exact, midnight + 90_000, 90_000);
            await using (var connection = new SqliteConnection($"Data Source={database};Pooling=False"))
            {
                await connection.OpenAsync();
                await using var insert = connection.CreateCommand();
                insert.CommandText = "INSERT INTO machine_usage_segments_v2(local_user_id,payload_json) VALUES($user,$payload);";
                insert.Parameters.AddWithValue("$user", "opaque-user");
                insert.Parameters.AddWithValue("$payload", JsonSerializer.Serialize(app, RuntimeJson.Options));
                await insert.ExecuteNonQueryAsync();
            }
            Assert.True(await store.ProcessNextDirtyDayAsync());
            var shared = await store.ReadSharedDayAsync(1, profile, "2026-09-21");
            Assert.NotNull(shared);
            Assert.True(shared.Available);
            Assert.Equal(90, shared.SharedSeconds);
            await using (var connection = new SqliteConnection($"Data Source={database};Pooling=False"))
            {
                await connection.OpenAsync();
                await using var read = connection.CreateCommand();
                read.CommandText = "SELECT available,browser_seconds,application_seconds,overlap_adjustment_seconds,shared_seconds FROM browser_shared_daily_shadow_v3;";
                await using var reader = await read.ExecuteReaderAsync();
                Assert.True(await reader.ReadAsync());
                Assert.Equal(1, reader.GetInt32(0));
                Assert.Equal(60, reader.GetInt64(1));
                Assert.Equal(60, reader.GetInt64(2));
                Assert.Equal(30, reader.GetInt64(3));
                Assert.Equal(90, reader.GetInt64(4));
            }
            Assert.False(await store.ProcessNextDirtyDayAsync());
            await store.MarkApplicationDaysDirtyAsync(1, "opaque-user", [app]);
            Assert.Null(await store.ReadSharedDayAsync(1, profile, "2026-09-21"));
            Assert.True(await store.ProcessNextDirtyDayAsync());
            var restarted = new BrowserDailySnapshotStore(database);
            await restarted.InitializeAsync();
            Assert.Null(await restarted.ReadSharedDayAsync(1, profile, "2026-09-21"));
            Assert.True(await restarted.ProcessNextDirtyDayAsync());
            Assert.Equal(90, (await restarted.ReadSharedDayAsync(1, profile, "2026-09-21"))?.SharedSeconds);
            var otherSession = app with { Id = "other-session", RuntimeSessionID = "runtime-2" };
            await using (var connection = new SqliteConnection($"Data Source={database};Pooling=False"))
            {
                await connection.OpenAsync();
                await using var insert = connection.CreateCommand();
                insert.CommandText = "INSERT INTO machine_usage_segments_v2(local_user_id,payload_json) VALUES($user,$payload);";
                insert.Parameters.AddWithValue("$user", "opaque-user");
                insert.Parameters.AddWithValue("$payload", JsonSerializer.Serialize(otherSession, RuntimeJson.Options));
                await insert.ExecuteNonQueryAsync();
            }
            await restarted.MarkApplicationDaysDirtyAsync(1, "opaque-user", [otherSession]);
            Assert.True(await restarted.ProcessNextDirtyDayAsync());
            var isolated = await restarted.ReadSharedDayAsync(1, profile, "2026-09-21");
            Assert.Equal("SESSION_MAPPING_INCOMPLETE", isolated?.UnavailableReasonCode);
            Assert.Null(isolated?.SharedSeconds);
        }
        finally { Directory.Delete(root, recursive: true); }
    }
}
