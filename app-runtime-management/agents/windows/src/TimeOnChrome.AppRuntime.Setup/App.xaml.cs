using System.Diagnostics;
using System.IO;
using System.Windows;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class App : Application
{
    private Mutex? instanceMutex;
    private bool ownsInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
        if (e.Args.Any(static argument =>
                string.Equals(argument, "--uninstall-cleanup", StringComparison.OrdinalIgnoreCase)))
        {
            new WindowsStartupRegistration().Remove();
            Shutdown();
            return;
        }

        if (e.Args.Any(static argument =>
                string.Equals(argument, "--install-repair", StringComparison.OrdinalIgnoreCase)))
        {
            RepairInstallation();
            Shutdown();
            return;
        }

        instanceMutex = new Mutex(false, WindowsRuntimeInstanceNames.SetupMutexName);
        try
        {
            ownsInstanceMutex = instanceMutex.WaitOne(0, false);
        }
        catch (AbandonedMutexException)
        {
            ownsInstanceMutex = true;
        }

        if (!ownsInstanceMutex)
        {
            MessageBox.Show(
                "电脑应用使用设置已经打开，请切换到现有窗口。",
                "TimeOnChrome 电脑应用使用",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            Shutdown();
            return;
        }

        base.OnStartup(e);
    }

    protected override void OnExit(ExitEventArgs e)
    {
        if (ownsInstanceMutex) instanceMutex?.ReleaseMutex();
        instanceMutex?.Dispose();
        base.OnExit(e);
    }

    private static void RepairInstallation()
    {
        try
        {
            var paths = RuntimePaths.ForCurrentUser();
            var credential = new DpapiRuntimeCredentialStore(paths.CredentialPath)
                .LoadAsync()
                .GetAwaiter()
                .GetResult();
            if (credential is null) return;

            var agentPath = Path.Combine(
                AppContext.BaseDirectory,
                "TimeOnChrome.AppRuntime.Agent.exe");
            if (!File.Exists(agentPath)) return;

            new WindowsStartupRegistration().Register(agentPath);
            if (!WindowsRuntimeInstanceNames.IsAgentRunning())
            {
                _ = Process.Start(new ProcessStartInfo(agentPath)
                {
                    UseShellExecute = true,
                });
            }
        }
        catch
        {
            // Installer repair is best effort. Setup will expose a recoverable state
            // the next time the user opens it instead of failing the MSI transaction.
        }
    }
}
