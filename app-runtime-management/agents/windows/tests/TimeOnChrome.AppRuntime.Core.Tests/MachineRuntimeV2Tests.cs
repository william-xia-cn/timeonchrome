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
    public void PipeNamesAreSessionScoped()
    {
        Assert.Equal("TimeOnChrome.AppRuntime.v2.session.12", SessionPipeNames.Facts(12));
        Assert.Throws<ArgumentOutOfRangeException>(() => SessionPipeNames.Facts(-1));
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

    private static UsageSegment Segment(string id) => new(
        id,
        "session-a",
        new ApplicationIdentity(RuntimePlatform.Windows, "app:editor", "Editor"),
        100,
        600,
        500,
        SegmentEndReason.PeriodicSnapshot);

    public void Dispose()
    {
        if (!Directory.Exists(root)) return;
        Directory.Delete(root, recursive: true);
        GC.SuppressFinalize(this);
    }
}
