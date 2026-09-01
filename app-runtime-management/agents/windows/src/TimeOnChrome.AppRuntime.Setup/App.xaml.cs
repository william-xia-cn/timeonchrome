using System.Windows;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class App : Application
{
    private Mutex? instanceMutex;
    private bool ownsInstanceMutex;

    protected override void OnStartup(StartupEventArgs e)
    {
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
}
