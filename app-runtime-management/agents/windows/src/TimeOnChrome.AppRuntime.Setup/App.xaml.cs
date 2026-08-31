using System.Windows;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        if (e.Args.Any(static argument =>
                string.Equals(argument, "--uninstall-cleanup", StringComparison.OrdinalIgnoreCase)))
        {
            new WindowsStartupRegistration().Remove();
            Shutdown();
            return;
        }

        base.OnStartup(e);
    }
}
