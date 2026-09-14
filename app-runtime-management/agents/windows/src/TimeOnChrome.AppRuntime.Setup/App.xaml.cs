using System.Security.Principal;
using System.Windows;
using TimeOnChrome.AppRuntime.Windows;
using Forms = System.Windows.Forms;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class App : System.Windows.Application
{
    private Mutex? instanceMutex;
    private bool ownsInstanceMutex;
    private EventWaitHandle? activationEvent;
    private RegisteredWaitHandle? activationRegistration;
    private Forms.NotifyIcon? trayIcon;
    private MainWindow? managerWindow;

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var adminMode = e.Args.Contains("--admin", StringComparer.OrdinalIgnoreCase);
        var mutexName = adminMode
            ? WindowsRuntimeInstanceNames.ManagerAdminMutexName
            : WindowsRuntimeInstanceNames.ManagerMutexName;
        instanceMutex = new Mutex(false, mutexName);
        try { ownsInstanceMutex = instanceMutex.WaitOne(0, false); }
        catch (AbandonedMutexException) { ownsInstanceMutex = true; }

        if (!ownsInstanceMutex)
        {
            if (!adminMode)
            {
                try
                {
                    using var existing = EventWaitHandle.OpenExisting(WindowsRuntimeInstanceNames.ManagerActivationEventName);
                    existing.Set();
                }
                catch (WaitHandleCannotBeOpenedException) { }
            }
            Shutdown();
            return;
        }

        if (adminMode && !IsElevated())
        {
            System.Windows.MessageBox.Show("管理员管理窗口需要 Windows 管理员授权。", "TimeWhereMg",
                MessageBoxButton.OK, MessageBoxImage.Warning);
            Shutdown();
            return;
        }

        managerWindow = new MainWindow(adminMode, keepInTray: !adminMode);
        managerWindow.StatusChanged += UpdateTrayState;
        if (!adminMode)
        {
            CreateTrayIcon();
            activationEvent = new EventWaitHandle(false, EventResetMode.AutoReset,
                WindowsRuntimeInstanceNames.ManagerActivationEventName);
            activationRegistration = ThreadPool.RegisterWaitForSingleObject(
                activationEvent,
                (_, _) => Dispatcher.BeginInvoke(ShowManager),
                null,
                Timeout.Infinite,
                executeOnlyOnce: false);
        }

        await managerWindow.InitializeAsync().ConfigureAwait(true);
        if (adminMode || !e.Args.Contains("--tray", StringComparer.OrdinalIgnoreCase)) ShowManager();
    }

    private static bool IsElevated()
    {
        using var identity = WindowsIdentity.GetCurrent();
        return new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
    }

    private void CreateTrayIcon()
    {
        var menu = new Forms.ContextMenuStrip();
        menu.Items.Add("打开 TimeWhereMg", null, (_, _) => Dispatcher.BeginInvoke(ShowManager));
        trayIcon = new Forms.NotifyIcon
        {
            Text = "TimeWhereMg · 正在检查",
            Icon = System.Drawing.SystemIcons.Information,
            Visible = true,
            ContextMenuStrip = menu,
        };
        trayIcon.DoubleClick += (_, _) => Dispatcher.BeginInvoke(ShowManager);
    }

    private void ShowManager()
    {
        if (managerWindow is null) return;
        managerWindow.Show();
        if (managerWindow.WindowState == WindowState.Minimized) managerWindow.WindowState = WindowState.Normal;
        managerWindow.Activate();
        managerWindow.Topmost = true;
        managerWindow.Topmost = false;
        _ = Dispatcher.BeginInvoke(managerWindow.ResetScrollPosition, System.Windows.Threading.DispatcherPriority.ContextIdle);
    }

    private void UpdateTrayState(string state)
    {
        if (trayIcon is null) return;
        (trayIcon.Text, trayIcon.Icon) = state switch
        {
            "online" => ("TimeWhereMg · 在线", System.Drawing.SystemIcons.Information),
            "pendingSync" => ("TimeWhereMg · 待同步", System.Drawing.SystemIcons.Warning),
            "pendingPolicy" => ("TimeWhereMg · 等待策略", System.Drawing.SystemIcons.Warning),
            "unpaired" => ("TimeWhereMg · 未配对", System.Drawing.SystemIcons.Warning),
            "stopped" => ("TimeWhereMg · 服务已停止", System.Drawing.SystemIcons.Error),
            _ => ("TimeWhereMg · 需要检查", System.Drawing.SystemIcons.Warning),
        };
    }

    protected override void OnExit(ExitEventArgs e)
    {
        activationRegistration?.Unregister(null);
        activationEvent?.Dispose();
        if (trayIcon is not null)
        {
            trayIcon.Visible = false;
            trayIcon.Dispose();
        }
        if (ownsInstanceMutex) instanceMutex?.ReleaseMutex();
        instanceMutex?.Dispose();
        base.OnExit(e);
    }
}
