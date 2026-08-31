using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using Microsoft.Win32;
using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class InfrastructureTests
{
    [Fact]
    public async Task SqliteStorePersistsImmutableSegmentsAndTransactionalOutbox()
    {
        using var temporary = new TemporaryDirectory();
        var databasePath = Path.Combine(temporary.Path, "runtime.db");
        var store = new SqliteSegmentStore(databasePath);
        await store.InitializeAsync();
        var segment = Segment("session:0");

        await store.PersistAndEnqueueAsync([segment]);
        await store.PersistAndEnqueueAsync([segment]);

        Assert.Equal(segment, await store.SegmentAsync(segment.Id));
        Assert.Single(await store.PendingAsync(50, long.MaxValue));
        Assert.Equal(1, await store.OutboxCountAsync());

        var reopened = new SqliteSegmentStore(databasePath);
        await reopened.InitializeAsync();
        Assert.Single(await reopened.PendingAsync(50, long.MaxValue));

        var conflicting = segment with { EndAtMs = 601, DurationMilliseconds = 501 };
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            store.PersistAndEnqueueAsync([conflicting]));
        Assert.Equal(segment, await store.SegmentAsync(segment.Id));

        await store.RecordFailureAsync(
            new HashSet<string>(StringComparer.Ordinal) { segment.Id },
            "NETWORK",
            10_000);
        Assert.Empty(await store.PendingAsync(50, 9_999));
        var retry = Assert.Single(await store.PendingAsync(50, 10_000));
        Assert.Equal(1, retry.AttemptCount);
        Assert.Equal("NETWORK", retry.LastErrorCode);

        await store.MarkAcceptedAsync(new HashSet<string>(StringComparer.Ordinal) { segment.Id });
        Assert.Equal(0, await store.OutboxCountAsync());
        Assert.Equal(segment, await store.SegmentAsync(segment.Id));
    }

    [Fact]
    public async Task SqliteStoreRollsBackBatchOnIdConflict()
    {
        using var temporary = new TemporaryDirectory();
        var store = new SqliteSegmentStore(Path.Combine(temporary.Path, "runtime.db"));
        await store.InitializeAsync();
        var existing = Segment("existing:0");
        await store.PersistAndEnqueueAsync([existing]);

        var newSegment = Segment("new:0");
        var conflict = existing with { EndAtMs = 700, DurationMilliseconds = 600 };
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            store.PersistAndEnqueueAsync([newSegment, conflict]));

        Assert.Null(await store.SegmentAsync(newSegment.Id));
        Assert.Equal(1, await store.OutboxCountAsync());
    }

    [Fact]
    public async Task DpapiCredentialRoundTripsWithoutPlaintextTokenOnDisk()
    {
        using var temporary = new TemporaryDirectory();
        var path = Path.Combine(temporary.Path, "credential.dat");
        var store = new DpapiRuntimeCredentialStore(path);
        var credential = new RuntimeCredential(
            new Uri("https://runtime.example.test"),
            "device-1",
            "rt_token_plaintext_should_not_appear",
            RuntimePlatform.Windows);

        await store.SaveAsync(credential);

        Assert.Equal(credential, await store.LoadAsync());
        Assert.DoesNotContain(
            credential.DeviceToken,
            Encoding.UTF8.GetString(await File.ReadAllBytesAsync(path)),
            StringComparison.Ordinal);
    }

    [Fact]
    public async Task AgentSettingsCreateSafeDefaultsAndRejectInvalidRanges()
    {
        using var temporary = new TemporaryDirectory();
        var path = Path.Combine(temporary.Path, "runtime-settings.json");
        var store = new RuntimeAgentSettingsStore(path);

        var defaults = await store.LoadOrCreateAsync();
        Assert.Equal(300, defaults.IdleThresholdSeconds);
        Assert.Equal(60, defaults.SnapshotIntervalSeconds);
        Assert.True(File.Exists(path));

        await File.WriteAllTextAsync(path, "{\"idleThresholdSeconds\":1}");
        await Assert.ThrowsAsync<InvalidDataException>(() => store.LoadOrCreateAsync());
    }

    [Fact]
    public async Task UploaderOnlyClearsExplicitAcceptedIds()
    {
        using var temporary = new TemporaryDirectory();
        var store = new SqliteSegmentStore(Path.Combine(temporary.Path, "runtime.db"));
        await store.InitializeAsync();
        var first = Segment("upload:0");
        var second = Segment("upload:1");
        await store.PersistAndEnqueueAsync([first, second]);

        var handler = new StubHttpHandler(request =>
        {
            Assert.Equal("Bearer", request.Headers.Authorization?.Scheme);
            Assert.Equal("device-token", request.Headers.Authorization?.Parameter);
            return JsonResponse(new
            {
                acceptedIds = new[] { first.Id },
                rejected = Array.Empty<object>(),
            });
        });
        var uploader = new RuntimeUploader(
            store,
            store,
            new RuntimeApiClient(new HttpClient(handler)));
        var credential = new RuntimeCredential(
            new Uri("https://runtime.example.test"),
            "device-1",
            "device-token",
            RuntimePlatform.Windows);

        Assert.Equal(1, await uploader.UploadPendingAsync(credential));
        Assert.Equal(1, await store.OutboxCountAsync());
        var remaining = Assert.Single(await store.PendingAsync(50, long.MaxValue));
        Assert.Equal(second.Id, remaining.SegmentID);
        Assert.Equal("ACK_MISSING", remaining.LastErrorCode);
    }

    [Fact]
    public async Task SharedSegmentHashVectorsMatchBackendContract()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "runtime-segment-hash-v1.vectors.json");
        var document = JsonSerializer.Deserialize<HashVectorDocument>(
            await File.ReadAllTextAsync(path),
            RuntimeJson.Options);
        Assert.NotNull(document);
        Assert.Equal(1, document.SchemaVersion);
        foreach (var vector in document.Cases)
        {
            Assert.Equal(vector.ExpectedHash, SegmentCanonicalizer.ContentHash(vector.Segment));
        }
    }

    [Fact]
    public void WindowsSessionAndStartupMappingsAreDeterministic()
    {
        Assert.Equal(
            UserSessionState.Locked,
            WindowsRuntimeEventSource.MapSessionState(SessionSwitchReason.SessionLock));
        Assert.Equal(
            UserSessionState.Active,
            WindowsRuntimeEventSource.MapSessionState(SessionSwitchReason.SessionUnlock));
        Assert.Equal(
            UserSessionState.Inactive,
            WindowsRuntimeEventSource.MapSessionState(SessionSwitchReason.ConsoleDisconnect));
        Assert.Null(WindowsRuntimeEventSource.MapSessionState(SessionSwitchReason.SessionRemoteControl));
        Assert.Equal(
            "\"C:\\Program Files\\TimeOnChrome\\runtime.exe\" run",
            WindowsStartupRegistration.BuildCommand(
                "C:\\Program Files\\TimeOnChrome\\runtime.exe"));
    }

    [Fact]
    public void WindowsNativeProbeReturnsOnlyOpaqueApplicationIdentity()
    {
        var probe = new WindowsRuntimeProbe();
        Assert.True(probe.GetIdleDuration() >= TimeSpan.Zero);

        var application = probe.GetForegroundApplication();
        if (application is not null)
        {
            Assert.Equal(RuntimePlatform.Windows, application.Platform);
            Assert.Matches("^windows:[0-9a-f]{64}$", application.RuntimeIdentity);
            Assert.DoesNotContain("\\", application.RuntimeIdentity, StringComparison.Ordinal);
        }

        if (Environment.UserInteractive)
        {
            using var watcher = new ForegroundWinEventWatcher(() => { });
        }
    }

    [Fact]
    public async Task SqliteStoreRejectsAnotherBoundDevice()
    {
        using var temporary = new TemporaryDirectory();
        var path = Path.Combine(temporary.Path, "runtime.db");
        await new SqliteSegmentStore(path, "device-a").InitializeAsync();
        await Assert.ThrowsAsync<InvalidOperationException>(() =>
            new SqliteSegmentStore(path, "device-b").InitializeAsync());
    }

    [Fact]
    public void ApplicationIdentityUsesStableOrderedSourcesWithoutLeakingPath()
    {
        var packaged = WindowsApplicationIdentityDeriver.Derive(null, "App", "Family_123", "Family_123!App");
        var fallback = WindowsApplicationIdentityDeriver.Derive(null, "notepad");
        Assert.Matches("^windows:[0-9a-f]{64}$", packaged.RuntimeIdentity);
        Assert.Matches("^windows:[0-9a-f]{64}$", fallback.RuntimeIdentity);
        Assert.NotEqual(packaged.RuntimeIdentity, fallback.RuntimeIdentity);
        Assert.DoesNotContain("Family", packaged.RuntimeIdentity, StringComparison.OrdinalIgnoreCase);
    }

    private static UsageSegment Segment(string id) => new(
        id,
        "session",
        new ApplicationIdentity(RuntimePlatform.Windows, "app:editor", "Editor"),
        100,
        600,
        500,
        SegmentEndReason.PeriodicSnapshot);

    private static HttpResponseMessage JsonResponse(object body) => new(HttpStatusCode.OK)
    {
        Content = new StringContent(
            JsonSerializer.Serialize(body, RuntimeJson.Options),
            Encoding.UTF8,
            "application/json"),
    };

    private sealed record HashVectorDocument(int SchemaVersion, IReadOnlyList<HashVector> Cases);

    private sealed record HashVector(string Name, UsageSegment Segment, string ExpectedHash);

    private sealed class StubHttpHandler(Func<HttpRequestMessage, HttpResponseMessage> response)
        : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(
            HttpRequestMessage request,
            CancellationToken cancellationToken) => Task.FromResult(response(request));
    }

    private sealed class TemporaryDirectory : IDisposable
    {
        internal TemporaryDirectory()
        {
            Path = System.IO.Path.Combine(
                System.IO.Path.GetTempPath(),
                $"timeonchrome-runtime-{Guid.NewGuid():N}");
            Directory.CreateDirectory(Path);
        }

        internal string Path { get; }

        public void Dispose()
        {
            SqliteConnection.ClearAllPools();
            Directory.Delete(Path, recursive: true);
        }
    }
}
