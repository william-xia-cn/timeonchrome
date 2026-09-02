using System.Security.Cryptography;
using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Migration;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class MachineRuntimeV2Tests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"app-runtime-v2-{Guid.NewGuid():N}");

    [Fact]
    public async Task LocalMachineCredentialRoundTripsWithoutPlaintextToken()
    {
        var path = Path.Combine(root, "credential.dat");
        var store = new MachineCredentialStore(path);
        var expected = new MachineRuntimeCredential(new Uri("https://runtime.test"), "machine-a", "secret-machine-token", RuntimePlatform.Windows);

        await store.SaveAsync(expected);

        Assert.Equal(expected, await store.LoadAsync());
        var raw = await File.ReadAllBytesAsync(path);
        Assert.DoesNotContain("secret-machine-token", System.Text.Encoding.UTF8.GetString(raw), StringComparison.Ordinal);
    }

    [Fact]
    public void SidHmacIsStablePerMachineAndNeverReturnsSid()
    {
        var first = new MachineUserIdentityDeriver(Enumerable.Repeat((byte)1, 32).ToArray());
        var second = new MachineUserIdentityDeriver(Enumerable.Repeat((byte)2, 32).ToArray());
        const string sid = "S-1-5-21-1000-2000-3000-1001";

        Assert.Equal(first.Derive(sid), first.Derive(sid));
        Assert.NotEqual(first.Derive(sid), second.Derive(sid));
        Assert.DoesNotContain("S-1-", first.Derive(sid), StringComparison.OrdinalIgnoreCase);
        Assert.Matches("^[A-Za-z0-9_-]{43}$", first.Derive(sid));
    }

    [Fact]
    public async Task PolicyStorePreservesLastKnownGoodAndUnprotectedAssignment()
    {
        var store = new MachinePolicyStore(Path.Combine(root, "policy.json"));
        var policy = new AppliedMachinePolicy(
            new MachinePolicy(7, "child-default", [
                new MachineUserAssignment("user-a", 7, "child-default", true),
                new MachineUserAssignment("user-b", 7, null, false),
            ]), 100, 120);

        await store.SaveAsync(policy);
        var loaded = await store.LoadAsync();

        Assert.NotNull(loaded);
        Assert.Equal(policy.Policy.Version, loaded!.Policy.Version);
        Assert.Equal(policy.Policy.DefaultChildId, loaded.Policy.DefaultChildId);
        Assert.Equal(policy.Policy.Users, loaded.Policy.Users);
        Assert.Equal(policy.CachedAtMs, loaded.CachedAtMs);
        Assert.Equal(policy.AppliedAtMs, loaded.AppliedAtMs);
        Assert.False(MachinePolicyStore.AssignmentFor(loaded!.Policy, "user-b")!.Protected);
        Assert.Null(MachinePolicyStore.AssignmentFor(loaded.Policy, "user-b")!.ChildId);
    }

    [Fact]
    public async Task PolicyStoreCachesAppPolicyAndResolvesClassificationWithoutBlocking()
    {
        var store = new MachinePolicyStore(Path.Combine(root, "app-policy.json"));
        var assignment = new MachineUserAssignment("user-a", 8, "child-a", true);
        var timeWindows = AppPolicySchedule.AllOpen().ToDictionary(
            item => item.Key,
            item => (IReadOnlyDictionary<string, IReadOnlyList<AppPolicyTimeWindow>>)item.Value.ToDictionary(
                category => category.Key,
                category => category.Key == "study"
                    ? (IReadOnlyList<AppPolicyTimeWindow>)[new("08:00", "09:00")]
                    : category.Value,
                StringComparer.Ordinal),
            StringComparer.Ordinal);
        var policy = new MachinePolicy(8, "child-a", [assignment], [
            new MachineChildAppPolicy("child-a", new AppPolicyDocument(
                3,
                1_000,
                [new AppPolicyClassification(RuntimePlatform.Windows, "app:editor", "Editor", ApplicationClassification.Study)],
                new AppPolicyQuotaConfig(
                    new Dictionary<string, int?> { ["study"] = 30 },
                    120,
                    [new AppPolicyApplicationQuota(RuntimePlatform.Windows, "app:editor", 10)]),
                timeWindows))
        ]);

        await store.SaveAsync(new AppliedMachinePolicy(policy, 1_000, 1_000));
        var loaded = (await store.LoadAsync())!.Policy;
        var known = MachinePolicyStore.SnapshotFor(
            loaded, assignment, new ApplicationIdentity(RuntimePlatform.Windows, "app:editor", "Renamed"));
        var unknown = MachinePolicyStore.SnapshotFor(
            loaded, assignment, new ApplicationIdentity(RuntimePlatform.Windows, "app:unknown", "Unknown"));

        Assert.Equal(3, known.AppPolicyVersion);
        Assert.Equal(ApplicationClassification.Study, known.ApplicationClassification);
        Assert.Equal("study", known.QuotaBucket);
        Assert.Equal(ApplicationClassification.Unclassified, unknown.ApplicationClassification);
        Assert.Equal("unclassified", unknown.QuotaBucket);
        Assert.False(AppPolicySchedule.IsAllowed(
            loaded.AppPolicies![0].Policy,
            ApplicationClassification.Study,
            new DateTimeOffset(2026, 9, 7, 10, 0, 0, TimeSpan.FromHours(8))));
        Assert.Equal(ApplicationClassification.Study, known.ApplicationClassification);
    }

    [Fact]
    public void LegacyAppPolicyWithoutTimeWindowsDefaultsToAllOpen()
    {
        var policy = new AppPolicyDocument(
            1,
            null,
            [],
            new AppPolicyQuotaConfig(new Dictionary<string, int?>(), null, []));

        Assert.True(AppPolicySchedule.IsAllowed(
            policy,
            ApplicationClassification.Study,
            new DateTimeOffset(2026, 9, 7, 23, 59, 0, TimeSpan.FromHours(8))));
        Assert.All(AppPolicySchedule.Weekdays, day =>
            Assert.All(AppPolicySchedule.Categories, category =>
                Assert.Equal(new AppPolicyTimeWindow("00:00", "24:00"),
                    Assert.Single(AppPolicySchedule.Effective(policy)[day][category]))));
    }

    [Fact]
    public async Task AccountingLaneKeepsPolicySnapshotAcrossDeterministicBoundary()
    {
        var ledger = new MachineSegmentLedger(Path.Combine(root, "policy-boundary.db"));
        await ledger.InitializeAsync("machine-a");
        var session = new MachineAccountingSession(ledger, "user-a", 2, "session-a", "epoch-a");
        var snapshot = new AccountingPolicySnapshot(2, "study", 4, ApplicationClassification.Study);
        var app = new ApplicationIdentity(RuntimePlatform.Windows, "app:editor", "Editor");
        _ = await session.PushAndPersistAsync(new AccountingRuntimeFact(
            0, 0, "epoch-a", AccountingFactKind.Checkpoint,
            Confirmation: CheckpointConfirmation.Confirmed,
            Snapshot: new AccountingRuntimeSnapshot(app, WindowPresentationState.Visible,
                MediaEvidenceLevel.None, MediaPlaybackState.Unknown, UserActivityState.Active,
                UserSessionState.Active, SystemPowerState.Awake),
            PolicySnapshot: snapshot));
        _ = await session.PushAndPersistAsync(new AccountingRuntimeFact(
            1_000, 1_000, "epoch-a", AccountingFactKind.ForegroundChanged,
            Application: new ApplicationIdentity(RuntimePlatform.Windows, "app:other", "Other"),
            WindowState: WindowPresentationState.Visible,
            PolicySnapshot: new AccountingPolicySnapshot(2, "unclassified", 4, ApplicationClassification.Unclassified)));
        var transition = await session.FlushAndPersistAsync();

        var segment = Assert.Single(transition.UsageSegments);
        Assert.Equal(snapshot, segment.PolicySnapshot);
        Assert.Equal("study", segment.PolicySnapshot!.QuotaBucket);
    }

    [Fact]
    public async Task MachineLedgerSeparatesUsersAndAssignmentVersions()
    {
        var ledger = new MachineSegmentLedger(Path.Combine(root, "ledger.db"));
        await ledger.InitializeAsync("machine-a");
        var segment = Segment("segment-a");

        await ledger.PersistAsync("user-a", 1, [segment]);
        await ledger.PersistAsync("user-b", 2, [segment]);
        var pending = await ledger.PendingAsync(10, long.MaxValue);

        Assert.Equal(2, pending.Count);
        Assert.Contains(pending, item => item.LocalUserId == "user-a" && item.AssignmentVersion == 1);
        Assert.Contains(pending, item => item.LocalUserId == "user-b" && item.AssignmentVersion == 2);
        await ledger.MarkAcceptedAsync(new HashSet<(string, string)> { ("user-a", segment.Id) });
        Assert.Equal(1, await ledger.OutboxCountAsync());
    }

    [Fact]
    public async Task AccountingLedgerCommitsOpenStateUsageMediaAndSeparateOutboxesAtomically()
    {
        var ledger = new MachineSegmentLedger(Path.Combine(root, "accounting-ledger.db"));
        await ledger.InitializeAsync("machine-a");
        var app = new ApplicationIdentity(RuntimePlatform.Windows, "app:player", "Player");
        var state = AccountingState("session-a", app, 1000);
        var usage = AccountingUsage("session-a", app, "epoch-a", 0, 1000);
        var media = MediaSegmentV2.Create(
            "session-a", app, MediaKind.Video, MediaPresentation.Background, "epoch-a",
            0, 1000, 0, 1000, SegmentEndReason.MediaStopped,
            EstimatedMetadata.Exact, 1000, 1000);

        await ledger.PersistAccountingTransitionAsync(
            "user-a",
            7,
            new AccountingTransition(state, [usage], [media]));

        var restored = Assert.Single(await ledger.RestoreAccountingSessionsAsync());
        Assert.Equal("user-a", restored.LocalUserId);
        Assert.Equal(7, restored.AssignmentVersion);
        Assert.Equal(state.ForegroundLane, restored.State.ForegroundLane);
        Assert.Equal(usage.Id, Assert.Single(await ledger.PendingAccountingUsageAsync(10, long.MaxValue)).Segment.Id);
        Assert.Equal(media.Id, Assert.Single(await ledger.PendingAccountingMediaAsync(10, long.MaxValue)).Segment.Id);

        await ledger.MarkAccountingUsageAcceptedAsync(new HashSet<(string, string)> { ("user-a", usage.Id) });
        Assert.Empty(await ledger.PendingAccountingUsageAsync(10, long.MaxValue));
        Assert.Single(await ledger.PendingAccountingMediaAsync(10, long.MaxValue));
    }

    [Fact]
    public async Task AccountingTransactionRollbackDoesNotLeavePartialSegmentOrAdvanceOpenState()
    {
        var ledger = new MachineSegmentLedger(Path.Combine(root, "accounting-rollback.db"));
        await ledger.InitializeAsync("machine-a");
        var app = new ApplicationIdentity(RuntimePlatform.Windows, "app:editor", "Editor");
        var existing = AccountingUsage("session-a", app, "epoch-a", 0, 1000);
        await ledger.PersistAccountingTransitionAsync(
            "user-a",
            1,
            new AccountingTransition(AccountingState("session-a", app, 1000), [existing], []));

        var newSegment = AccountingUsage("session-a", app, "epoch-a", 1000, 2000);
        await Assert.ThrowsAsync<InvalidOperationException>(() => ledger.PersistAccountingTransitionAsync(
            "user-a",
            2,
            new AccountingTransition(AccountingState("session-a", app, 2000), [newSegment, existing], [])));

        var pending = await ledger.PendingAccountingUsageAsync(10, long.MaxValue);
        Assert.Single(pending);
        Assert.Equal(existing.Id, pending[0].Segment.Id);
        var restored = Assert.Single(await ledger.RestoreAccountingSessionsAsync());
        Assert.Equal(1, restored.AssignmentVersion);
        Assert.Equal(1000, restored.State.LastProcessedMonotonicTimeMs);
    }

    [Fact]
    public async Task AccountingSessionAdvancesOnlyAfterDurableTransactionAndRetriesPendingFact()
    {
        var path = Path.Combine(root, "accounting-session.db");
        var ledger = new MachineSegmentLedger(path);
        var session = new MachineAccountingSession(
            ledger,
            "user-a",
            1,
            "session-a",
            "epoch-a");
        var fact = new AccountingRuntimeFact(
            0,
            0,
            "epoch-a",
            AccountingFactKind.SessionChanged,
            SessionState: UserSessionState.Active);

        _ = await session.PushAndPersistAsync(fact);
        await Assert.ThrowsAnyAsync<Exception>(() => session.FlushAndPersistAsync());
        Assert.Null(session.DurableState.LastProcessedMonotonicTimeMs);

        await ledger.InitializeAsync("machine-a");
        _ = await session.FlushAndPersistAsync();
        Assert.Equal(0, session.DurableState.LastProcessedMonotonicTimeMs);
        Assert.Single(await ledger.RestoreAccountingSessionsAsync());
    }

    [Fact]
    public async Task RestoredLaneRecoveryIsCappedAtThirtySeconds()
    {
        var ledger = new MachineSegmentLedger(Path.Combine(root, "accounting-recovery.db"));
        await ledger.InitializeAsync("machine-a");
        var app = new ApplicationIdentity(RuntimePlatform.Windows, "app:terminal", "Terminal");
        var state = AccountingState("session-a", app, 1000);
        await ledger.PersistAccountingTransitionAsync(
            "user-a",
            1,
            new AccountingTransition(state, [], []));
        var restored = Assert.Single(await ledger.RestoreAccountingSessionsAsync());
        var session = new MachineAccountingSession(ledger, restored.LocalUserId, restored.AssignmentVersion, restored.State);
        _ = await session.PushAndPersistAsync(new AccountingRuntimeFact(
            121000,
            121000,
            "epoch-a",
            AccountingFactKind.Recovery));
        var transition = await session.FlushAndPersistAsync();

        var segment = Assert.Single(transition.UsageSegments);
        Assert.Equal(30000, segment.MonotonicDurationMilliseconds);
        Assert.True(segment.Estimated.IsEstimated);
        Assert.Null(session.DurableState.ForegroundLane);
    }

    [Fact]
    public void PipeNamesAreSessionScoped()
    {
        Assert.Equal("TimeOnChrome.AppRuntime.v2.session.12", SessionPipeNames.Facts(12));
        Assert.Throws<ArgumentOutOfRangeException>(() => SessionPipeNames.Facts(-1));
    }

    [Fact]
    public async Task MachineControlPipeClientProvidesServiceImpersonationToken()
    {
        var name = $"TimeOnChrome.AppRuntime.test.{Guid.NewGuid():N}";
        await using var server = new System.IO.Pipes.NamedPipeServerStream(
            name,
            System.IO.Pipes.PipeDirection.InOut,
            1,
            System.IO.Pipes.PipeTransmissionMode.Byte,
            System.IO.Pipes.PipeOptions.Asynchronous);
        var connected = server.WaitForConnectionAsync();
        await using var client = MachineControlPipeClient.Create(name);
        await client.ConnectAsync(5_000);
        await connected;
        string? clientSid = null;
        server.RunAsClient(() => clientSid = System.Security.Principal.WindowsIdentity.GetCurrent(true)?.User?.Value);
        Assert.Equal(System.Security.Principal.WindowsIdentity.GetCurrent().User?.Value, clientSid);
    }

    [Fact]
    public async Task LegacyPreflightBlocksOnlyPendingOutbox()
    {
        var legacyRoot = Path.Combine(root, "legacy");
        var store = new SqliteSegmentStore(Path.Combine(legacyRoot, "runtime-test.db"), "device-a");
        await store.InitializeAsync();
        Assert.False(await Program.HasPendingOutboxAsync(legacyRoot));
        await store.PersistAndEnqueueAsync([Segment("legacy-segment")]);
        Assert.True(await Program.HasPendingOutboxAsync(legacyRoot));
        await store.MarkAcceptedAsync(new HashSet<string> { "legacy-segment" });
        Assert.False(await Program.HasPendingOutboxAsync(legacyRoot));
    }

    [Fact]
    public async Task MigrationPackageProbeLoadsSqliteAndCurrentUserDpapi()
    {
        Assert.Equal(0, await Program.RunPackageProbeAsync());
    }

    [Theory]
    [InlineData("S-1-5-21-1000-2000-3000-1001", true)]
    [InlineData("S-1-5-21-1000-2000-3000-1001_Classes", false)]
    [InlineData("S-1-5-18", false)]
    [InlineData(".DEFAULT", false)]
    public void MachineConflictProbeOnlyScansInteractiveProfileSids(string sid, bool expected)
    {
        Assert.Equal(expected, Program.IsInteractiveProfileSid(sid));
    }

    private static UsageSegment Segment(string id) => new(
        id,
        "session-a",
        new ApplicationIdentity(RuntimePlatform.Windows, "app:editor", "Editor"),
        100,
        600,
        500,
        SegmentEndReason.PeriodicSnapshot);

    private static AccountingRuntimeState AccountingState(
        string sessionId,
        ApplicationIdentity app,
        long lastMonotonic)
    {
        return new AccountingRuntimeState
        {
            RuntimeSessionID = sessionId,
            ClockEpochId = "epoch-a",
            ForegroundApplication = app,
            ForegroundWindowState = WindowPresentationState.Visible,
            UserActivity = UserActivityState.Active,
            SessionState = UserSessionState.Active,
            PowerState = SystemPowerState.Awake,
            ForegroundLane = new OpenAccountingLane(
                app,
                UsageChannel.Active,
                ActivityBasis.ForegroundInteraction,
                "epoch-a",
                0,
                0,
                0,
                0),
            LastProcessedWallTimeMs = lastMonotonic,
            LastProcessedMonotonicTimeMs = lastMonotonic,
        };
    }

    private static UsageSegmentV2 AccountingUsage(
        string sessionId,
        ApplicationIdentity app,
        string epoch,
        long start,
        long end)
    {
        return UsageSegmentV2.Create(
            sessionId,
            app,
            UsageChannel.Active,
            ActivityBasis.ForegroundInteraction,
            epoch,
            start,
            end,
            start,
            end,
            SegmentEndReason.PeriodicSnapshot,
            EstimatedMetadata.Exact,
            end,
            end);
    }

    public void Dispose()
    {
        if (!Directory.Exists(root)) return;
        Directory.Delete(root, recursive: true);
        GC.SuppressFinalize(this);
    }
}
