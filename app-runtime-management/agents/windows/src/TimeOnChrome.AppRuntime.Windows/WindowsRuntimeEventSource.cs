using System.Runtime.CompilerServices;
using System.Threading.Channels;
using Microsoft.Win32;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Windows;

public sealed class WindowsRuntimeEventSource : IRuntimeEventSource
{
    private readonly IWindowsRuntimeProbe probe;
    private readonly TimeProvider timeProvider;
    private readonly TimeSpan idleThreshold;
    private readonly TimeSpan pollInterval;
    private readonly TimeSpan snapshotInterval;
    private readonly object stateGate = new();
    private long lastTimestamp = -1;
    private UserActivityState currentActivity = UserActivityState.Unknown;
    private UserSessionState currentSession = UserSessionState.Active;
    private SystemPowerState currentPower = SystemPowerState.Awake;

    public WindowsRuntimeEventSource(
        IWindowsRuntimeProbe probe,
        TimeSpan idleThreshold,
        TimeSpan? pollInterval = null,
        TimeSpan? snapshotInterval = null,
        TimeProvider? timeProvider = null)
    {
        this.probe = probe;
        this.idleThreshold = idleThreshold;
        this.pollInterval = pollInterval ?? TimeSpan.FromSeconds(1);
        this.snapshotInterval = snapshotInterval ?? TimeSpan.FromMinutes(1);
        this.timeProvider = timeProvider ?? TimeProvider.System;

        if (idleThreshold <= TimeSpan.Zero
            || this.pollInterval <= TimeSpan.Zero
            || this.snapshotInterval <= TimeSpan.Zero)
        {
            throw new ArgumentOutOfRangeException(nameof(idleThreshold));
        }
    }

    public async IAsyncEnumerable<RuntimeFact> FactsAsync(
        [EnumeratorCancellation] CancellationToken cancellationToken = default)
    {
        var channel = Channel.CreateUnbounded<RuntimeFact>(new UnboundedChannelOptions
        {
            SingleReader = true,
            SingleWriter = false,
        });
        using var linkedCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        using var foregroundWatcher = new ForegroundWinEventWatcher(() =>
            WriteApplication(channel.Writer));

        SessionSwitchEventHandler sessionHandler = (_, args) =>
        {
            var state = MapSessionState(args.Reason);
            if (state is not null)
            {
                WriteSession(channel.Writer, state.Value);
            }
        };
        PowerModeChangedEventHandler powerHandler = (_, args) =>
        {
            var state = args.Mode switch
            {
                PowerModes.Suspend => SystemPowerState.Asleep,
                PowerModes.Resume => SystemPowerState.Awake,
                _ => (SystemPowerState?)null,
            };
            if (state is not null)
            {
                WritePower(channel.Writer, state.Value);
            }
        };

        SystemEvents.SessionSwitch += sessionHandler;
        SystemEvents.PowerModeChanged += powerHandler;
        var polling = PollAsync(channel.Writer, linkedCancellation.Token);

        try
        {
            await foreach (var fact in channel.Reader.ReadAllAsync(cancellationToken))
            {
                yield return fact;
            }
        }
        finally
        {
            SystemEvents.SessionSwitch -= sessionHandler;
            SystemEvents.PowerModeChanged -= powerHandler;
            linkedCancellation.Cancel();
            channel.Writer.TryComplete();
            try
            {
                await polling.ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (linkedCancellation.IsCancellationRequested)
            {
            }
        }
    }

    private async Task PollAsync(ChannelWriter<RuntimeFact> writer, CancellationToken cancellationToken)
    {
        var lastActivity = ActivityState();
        WriteSnapshot(writer, lastActivity);
        var nextSnapshotAt = timeProvider.GetUtcNow() + snapshotInterval;
        using var timer = new PeriodicTimer(pollInterval, timeProvider);

        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false))
        {
            var activity = ActivityState();
            if (activity != lastActivity)
            {
                lastActivity = activity;
                WriteActivity(writer, activity);
            }

            var now = timeProvider.GetUtcNow();
            if (now >= nextSnapshotAt)
            {
                WriteSnapshot(writer, activity);
                nextSnapshotAt = now + snapshotInterval;
            }
        }
    }

    private void WriteApplication(ChannelWriter<RuntimeFact> writer)
    {
        var application = probe.GetForegroundApplication();
        lock (stateGate)
        {
            _ = writer.TryWrite(new RuntimeFact
            {
                ObservedAtMs = NextTimestampUnsafe(),
                Kind = RuntimeFactKind.ApplicationActivated,
                Application = application,
            });
        }
    }

    private void WriteActivity(ChannelWriter<RuntimeFact> writer, UserActivityState activity)
    {
        lock (stateGate)
        {
            currentActivity = activity;
            _ = writer.TryWrite(new RuntimeFact
            {
                ObservedAtMs = NextTimestampUnsafe(),
                Kind = RuntimeFactKind.UserActivityChanged,
                UserActivity = activity,
            });
        }
    }

    private void WriteSession(ChannelWriter<RuntimeFact> writer, UserSessionState session)
    {
        lock (stateGate)
        {
            currentSession = session;
            _ = writer.TryWrite(new RuntimeFact
            {
                ObservedAtMs = NextTimestampUnsafe(),
                Kind = RuntimeFactKind.SessionChanged,
                SessionState = session,
            });
        }
    }

    private void WritePower(ChannelWriter<RuntimeFact> writer, SystemPowerState power)
    {
        lock (stateGate)
        {
            currentPower = power;
            _ = writer.TryWrite(new RuntimeFact
            {
                ObservedAtMs = NextTimestampUnsafe(),
                Kind = RuntimeFactKind.PowerChanged,
                PowerState = power,
            });
        }
    }

    private void WriteSnapshot(ChannelWriter<RuntimeFact> writer, UserActivityState activity)
    {
        var application = probe.GetForegroundApplication();
        lock (stateGate)
        {
            currentActivity = activity;
            _ = writer.TryWrite(new RuntimeFact
            {
                ObservedAtMs = NextTimestampUnsafe(),
                Kind = RuntimeFactKind.Snapshot,
                Snapshot = new RuntimeSnapshot(
                    application,
                    currentActivity,
                    currentSession,
                    currentPower),
            });
        }
    }

    private UserActivityState ActivityState() =>
        probe.GetIdleDuration() >= idleThreshold
            ? UserActivityState.Idle
            : UserActivityState.Active;

    private long NextTimestampUnsafe()
    {
        var observed = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        if (observed < lastTimestamp)
        {
            observed = lastTimestamp;
        }

        lastTimestamp = observed;
        return observed;
    }

    internal static UserSessionState? MapSessionState(SessionSwitchReason reason) => reason switch
    {
        SessionSwitchReason.SessionLock => UserSessionState.Locked,
        SessionSwitchReason.SessionUnlock => UserSessionState.Active,
        SessionSwitchReason.ConsoleConnect => UserSessionState.Active,
        SessionSwitchReason.RemoteConnect => UserSessionState.Active,
        SessionSwitchReason.ConsoleDisconnect => UserSessionState.Inactive,
        SessionSwitchReason.RemoteDisconnect => UserSessionState.Inactive,
        SessionSwitchReason.SessionLogoff => UserSessionState.Inactive,
        _ => null,
    };
}
