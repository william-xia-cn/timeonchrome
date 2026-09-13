using TimeOnChrome.AppRuntime.Infrastructure;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class MachineTerminalLoggingTests : IDisposable
{
    private readonly string root = Path.Combine(Path.GetTempPath(), $"app-runtime-logs-{Guid.NewGuid():N}");

    [Fact]
    public async Task LocalLoggingContinuesButOnlyMatchingEnabledEventsEnterOutbox()
    {
        var store = new MachineTerminalLogStore(Path.Combine(root, "runtime.db"));
        await store.InitializeAsync();
        const long now = 2_000_000;
        await store.WriteAsync("error", "service", "before_enabled", "service", "before_enabled",
            null, "2.0.6", null, now);
        Assert.Empty(await store.PendingAsync(10, now));

        var policy = new MachineLoggingPolicy(4, true, "warning", ["service", "security"], now + 60_000);
        await store.WriteAsync("info", "service", "below_threshold", "service", "below_threshold",
            null, "2.0.6", policy, now + 1);
        await store.WriteAsync("warning", "security", "agent_recovered", "session-supervisor", "agent_recovered",
            new Dictionary<string, object> { ["tamperCount"] = 1, ["recovered"] = true }, "2.0.6", policy, now + 2);

        var pending = await store.PendingAsync(10, now + 2);
        var item = Assert.Single(pending);
        Assert.Equal("agent_recovered", item.Log.EventCode);
        Assert.Equal(4, item.Log.PolicyVersion);
        var summary = await store.SummaryAsync(now + 2);
        Assert.Equal(1, summary.Pending);
        Assert.Equal(1, summary.Warnings24h);
        Assert.Equal(1, summary.Errors24h);
        Assert.Equal("agent_recovered", summary.LastStableErrorCode);
        await store.MarkAcceptedAsync(new HashSet<string>([item.Log.Id]));
        Assert.Empty(await store.PendingAsync(10, now + 3));
    }

    [Fact]
    public async Task ExpiredOrDisabledPolicyNeverCreatesRetroactiveUploadWork()
    {
        var store = new MachineTerminalLogStore(Path.Combine(root, "runtime.db"));
        await store.InitializeAsync();
        const long now = 3_000_000;
        await store.WriteAsync("error", "service", "expired", "service", "expired", null, "2.0.6",
            new MachineLoggingPolicy(1, true, "error", ["service"], now - 1), now);
        await store.WriteAsync("error", "service", "disabled", "service", "disabled", null, "2.0.6",
            new MachineLoggingPolicy(2, false, "error", ["service"], null), now + 1);
        Assert.Empty(await store.PendingAsync(10, now + 2));
    }

    [Fact]
    public async Task UnsafeFreeTextIsRejectedBeforePersistence()
    {
        var store = new MachineTerminalLogStore(Path.Combine(root, "runtime.db"));
        await store.InitializeAsync();
        await Assert.ThrowsAsync<ArgumentException>(() => store.WriteAsync(
            "error", "service", "bad event with spaces", "service", "bad", null, "2.0.6", null, 1));
    }

    [Fact]
    public void LoggingOnlyPolicyChangeDoesNotCutAccountingLanes()
    {
        var users = new[] { new MachineUserAssignment("user-a", 2, "child-a", true) };
        var current = new MachinePolicy(4, "child-a", users, [],
            new MachineLoggingPolicy(1, false, "error", ["service"], null));
        var loggingChanged = current with
        {
            Version = 5,
            LoggingPolicy = new MachineLoggingPolicy(2, true, "warning", ["service"], 9_000),
        };
        Assert.False(MachinePolicyStore.RequiresAccountingBoundary(current, loggingChanged));
        Assert.True(MachinePolicyStore.RequiresAccountingBoundary(current,
            current with { DefaultChildId = "child-b" }));
    }

    public void Dispose()
    {
        if (Directory.Exists(root)) Directory.Delete(root, recursive: true);
    }
}
