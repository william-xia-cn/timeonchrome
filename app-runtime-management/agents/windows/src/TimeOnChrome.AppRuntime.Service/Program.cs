using System.ServiceProcess;

namespace TimeOnChrome.AppRuntime.Service;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (!OperatingSystem.IsWindows()) return 2;
        if (args.Contains("--console", StringComparer.OrdinalIgnoreCase))
        {
            await using var coordinator = new RuntimeServiceCoordinator();
            await coordinator.StartAsync().ConfigureAwait(false);
            await Task.Delay(Timeout.InfiniteTimeSpan).ConfigureAwait(false);
            return 0;
        }
        ServiceBase.Run(new RuntimeWindowsService());
        return 0;
    }
}

internal sealed class RuntimeWindowsService : ServiceBase
{
    private RuntimeServiceCoordinator? coordinator;

    public RuntimeWindowsService()
    {
        ServiceName = "TimeOnChromeAppRuntime";
        CanHandleSessionChangeEvent = true;
        CanShutdown = true;
        AutoLog = true;
    }

    protected override void OnStart(string[] args)
    {
        coordinator = new RuntimeServiceCoordinator();
        coordinator.StartAsync().GetAwaiter().GetResult();
    }

    protected override void OnSessionChange(SessionChangeDescription changeDescription)
    {
        base.OnSessionChange(changeDescription);
        if (changeDescription.Reason is SessionChangeReason.SessionLogoff
            or SessionChangeReason.SessionLock
            or SessionChangeReason.ConsoleDisconnect
            or SessionChangeReason.RemoteDisconnect)
        {
            coordinator?.HandleSessionUnavailableAsync(changeDescription.SessionId).GetAwaiter().GetResult();
        }
    }

    protected override void OnStop()
    {
        coordinator?.DisposeAsync().AsTask().GetAwaiter().GetResult();
        coordinator = null;
    }

    protected override void OnShutdown() => OnStop();
}
