using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.ServiceProcess;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using TimeOnChrome.AppRuntime.Infrastructure;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class MainWindow : Window
{
    private const string RuntimeServiceName = "TimeOnChromeAppRuntime";
    private readonly DispatcherTimer statusTimer = new() { Interval = TimeSpan.FromSeconds(5) };
    private readonly bool adminMode;
    private readonly bool keepInTray;
    private bool requestInProgress;
    private bool allowClose;

    public MainWindow(bool adminMode, bool keepInTray)
    {
        this.adminMode = adminMode;
        this.keepInTray = keepInTray;
        InitializeComponent();
        AdminPanel.Visibility = adminMode ? Visibility.Visible : Visibility.Collapsed;
        AdminButton.Visibility = adminMode ? Visibility.Collapsed : Visibility.Visible;
        CloseButton.Content = keepInTray ? "隐藏到托盘" : "关闭";
        Closing += MainWindow_Closing;
        Closed += (_, _) =>
        {
            statusTimer.Stop();
            if (ShouldShutdownOnWindowClosed(keepInTray))
                System.Windows.Application.Current.Shutdown();
        };
        statusTimer.Tick += async (_, _) => await RefreshConnectionStateAsync().ConfigureAwait(true);
    }

    public event Action<string>? StatusChanged;

    public async Task InitializeAsync()
    {
        ApplyWindowBounds(SystemParameters.WorkArea.Width, SystemParameters.WorkArea.Height);
        await RefreshConnectionStateAsync().ConfigureAwait(true);
        statusTimer.Start();
    }

    public void ResetScrollPosition() => ContentScroll.ScrollToTop();

    private void MainWindow_Closing(object? sender, CancelEventArgs e)
    {
        if (!keepInTray || allowClose) return;
        e.Cancel = true;
        Hide();
    }

    private async void ConnectButton_Click(object sender, RoutedEventArgs e)
    {
        if (!adminMode || requestInProgress) return;
        var code = PairingCode.Text.Trim().ToUpperInvariant();
        if (!IsCode(code))
        {
            ApplyState(SetupConnectionState.RequiresPairing, heading: "配对码格式不正确",
                description: "请输入家长控制台显示的 XXXX-XXXX-XXXX 机器配对码。");
            PairingCode.Focus();
            return;
        }
        requestInProgress = true;
        ApplyState(SetupConnectionState.Connecting);
        try
        {
            var response = await SendAsync(new MachineControlCommand("enroll", code, Environment.MachineName), true).ConfigureAwait(true);
            if (!response.Success)
            {
                ApplyState(SetupConnectionState.RequiresPairing,
                    heading: response.ErrorCode == "PAIRING_CODE_INVALID" ? "配对码无效或已过期" : "未能完成机器配对",
                    description: "请在家长控制台重新生成机器配对码后再试。");
                return;
            }
            PairingCode.Clear();
            ApplyResponse(response.State == "alreadyEnrolled"
                ? await SendAsync(new MachineControlCommand("adminStatus"), true).ConfigureAwait(true)
                : response);
        }
        catch (Exception exception) when (IsControlException(exception))
        {
            ApplyState(SetupConnectionState.ConnectionIssue, heading: "Runtime Service 暂时不可用",
                description: "请确认 Service 正在运行，然后点击“重新检查”。");
        }
        finally { requestInProgress = false; }
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e) =>
        await RefreshConnectionStateAsync().ConfigureAwait(true);

    private void AdminButton_Click(object sender, RoutedEventArgs e)
    {
        try
        {
            _ = Process.Start(new ProcessStartInfo(Environment.ProcessPath!, "--admin")
            {
                UseShellExecute = true,
                Verb = "runas",
            });
        }
        catch (Win32Exception exception) when (exception.NativeErrorCode == 1223)
        {
            Status.Text = "管理员授权已取消，当前仍保持只读状态。";
        }
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e)
    {
        if (keepInTray) Hide();
        else { allowClose = true; Close(); System.Windows.Application.Current.Shutdown(); }
    }

    private async void StartServiceButton_Click(object sender, RoutedEventArgs e)
    {
        await RunServiceActionAsync(async service =>
        {
            if (service.Status == ServiceControllerStatus.Running) return;
            service.Start();
            await WaitForStatusAsync(service, ServiceControllerStatus.Running).ConfigureAwait(true);
        }, "Runtime Service 已启动。").ConfigureAwait(true);
    }

    private async void StopServiceButton_Click(object sender, RoutedEventArgs e)
    {
        if (System.Windows.MessageBox.Show(
            "停止后，本次开机期间不再记录应用使用；重启 Windows 后会自动恢复。确认停止吗？",
            "停止 Runtime Service", MessageBoxButton.YesNo, MessageBoxImage.Warning) != MessageBoxResult.Yes) return;
        await RunServiceActionAsync(async service =>
        {
            if (service.Status != ServiceControllerStatus.Running) return;
            var prepared = await SendAsync(new MachineControlCommand("prepareStop"), true).ConfigureAwait(true);
            if (!prepared.Success) throw new InvalidOperationException("SERVICE_NOT_PREPARED");
            service.Stop();
            await WaitForStatusAsync(service, ServiceControllerStatus.Stopped).ConfigureAwait(true);
        }, "Runtime Service 已停止；重启 Windows 后会自动恢复。", refreshAfter: true).ConfigureAwait(true);
    }

    private async void RestartServiceButton_Click(object sender, RoutedEventArgs e)
    {
        await RunServiceActionAsync(async service =>
        {
            if (service.Status == ServiceControllerStatus.Running)
            {
                var prepared = await SendAsync(new MachineControlCommand("prepareRestart"), true).ConfigureAwait(true);
                if (!prepared.Success) throw new InvalidOperationException("SERVICE_NOT_PREPARED");
                service.Stop();
                await WaitForStatusAsync(service, ServiceControllerStatus.Stopped).ConfigureAwait(true);
            }
            service.Start();
            await WaitForStatusAsync(service, ServiceControllerStatus.Running).ConfigureAwait(true);
        }, "Runtime Service 已重新启动。", refreshAfter: true).ConfigureAwait(true);
    }

    private async void SyncNowButton_Click(object sender, RoutedEventArgs e)
    {
        if (requestInProgress) return;
        requestInProgress = true;
        SetAdminActionsEnabled(false);
        Status.Text = "正在同步策略、账本和在线状态…";
        try
        {
            ApplyResponse(await SendAsync(new MachineControlCommand("syncNow"), true, 60_000).ConfigureAwait(true));
            Status.Text = "同步检查已完成。";
        }
        catch (Exception exception) when (IsControlException(exception))
        {
            Status.Text = "同步未完成，请检查网络和 Runtime Service 后重试。";
        }
        finally { requestInProgress = false; SetAdminActionsEnabled(true); }
    }

    private void RepairButton_Click(object sender, RoutedEventArgs e)
    {
        var productCode = FindInstalledProduct();
        if (productCode is null)
        {
            Status.Text = "未找到已安装的 Runtime MSI，无法启动修复。";
            return;
        }
        _ = Process.Start(new ProcessStartInfo("msiexec.exe", $"/fa {productCode} /passive") { UseShellExecute = true });
        Status.Text = "Windows Installer 已开始修复；机器身份和本地账本会保留。";
    }

    private void UninstallButton_Click(object sender, RoutedEventArgs e)
    {
        UninstallPanel.Visibility = Visibility.Visible;
        UninstallCode.Focus();
        Dispatcher.BeginInvoke(DispatcherPriority.Loaded, new Action(() => UninstallPanel.BringIntoView()));
    }

    private async void ConfirmUninstallButton_Click(object sender, RoutedEventArgs e)
    {
        var code = UninstallCode.Text.Trim().ToUpperInvariant();
        if (!IsCode(code))
        {
            Status.Text = "卸载码格式不正确。请在家长控制台生成 10 分钟单次卸载码。";
            return;
        }
        try
        {
            var response = await SendAsync(new MachineControlCommand("uninstall", code), true).ConfigureAwait(true);
            if (!response.Success) throw new InvalidOperationException("UNINSTALL_NOT_AUTHORIZED");
            var productCode = FindInstalledProduct() ?? throw new InvalidOperationException("PRODUCT_NOT_FOUND");
            _ = Process.Start(new ProcessStartInfo("msiexec.exe", $"/x {productCode} /passive") { UseShellExecute = true });
            allowClose = true;
            Close();
            System.Windows.Application.Current.Shutdown();
        }
        catch (Exception exception) when (IsControlException(exception) || exception is InvalidOperationException)
        {
            Status.Text = "卸载未获授权。卸载码可能无效、过期或已经使用。";
        }
    }

    private async Task RunServiceActionAsync(Func<ServiceController, Task> action, string success, bool refreshAfter = true)
    {
        if (!adminMode || requestInProgress) return;
        requestInProgress = true;
        SetAdminActionsEnabled(false);
        try
        {
            using var service = new ServiceController(RuntimeServiceName);
            service.Refresh();
            await action(service).ConfigureAwait(true);
            Status.Text = success;
        }
        catch (Exception exception) when (exception is InvalidOperationException or Win32Exception or System.ServiceProcess.TimeoutException)
        {
            Status.Text = "操作未完成。请确认 Service 已安装，并重新尝试。";
        }
        finally
        {
            requestInProgress = false;
            SetAdminActionsEnabled(true);
            if (refreshAfter) await RefreshConnectionStateAsync().ConfigureAwait(true);
        }
    }

    private static Task WaitForStatusAsync(ServiceController service, ServiceControllerStatus status) =>
        Task.Run(() => service.WaitForStatus(status, TimeSpan.FromSeconds(30)));

    private async Task RefreshConnectionStateAsync()
    {
        if (requestInProgress) return;
        requestInProgress = true;
        try
        {
            var serviceState = GetServiceState();
            ServiceStateValue.Text = ServiceStateLabel(serviceState);
            if (serviceState != ServiceControllerStatus.Running)
            {
                ApplyServiceUnavailable(serviceState);
                return;
            }
            var response = adminMode
                ? await SendAsync(new MachineControlCommand("adminStatus"), true).ConfigureAwait(true)
                : FromPublic(await SendPublicStatusAsync().ConfigureAwait(true));
            ApplyResponse(response);
        }
        catch (Exception exception) when (IsControlException(exception))
        {
            ApplyState(SetupConnectionState.ConnectionIssue, heading: "Runtime Service 未响应",
                description: "Service 进程存在，但本机状态通道没有响应。管理员可以尝试重启或修复。", stateCode: "issue");
        }
        finally { requestInProgress = false; }
    }

    private static ServiceControllerStatus? GetServiceState()
    {
        try
        {
            using var service = new ServiceController(RuntimeServiceName);
            service.Refresh();
            return service.Status;
        }
        catch (InvalidOperationException) { return null; }
    }

    private void ApplyServiceUnavailable(ServiceControllerStatus? state)
    {
        var missing = state is null;
        StatusCard.Background = Brush("#FEF2F2");
        StatusCard.BorderBrush = Brush("#B91C1C");
        StatusDot.Fill = Brush("#B91C1C");
        StatusBadge.Foreground = Brush("#B91C1C");
        StatusBadge.Text = missing ? "未安装" : "已停止";
        StatusHeading.Text = missing ? "未找到 Runtime Service" : "Runtime Service 已停止";
        Status.Text = missing ? "请重新运行 TimeOnChrome App Runtime 安装器。" : "当前不会采集或上传应用使用；管理员可以重新启动服务。";
        ManagedValue.Text = "无法确认";
        LastHeartbeatValue.Text = "Service 启动后确认";
        BrowserBridgePublicValue.Text = "Service 启动后确认";
        PairingPanel.Visibility = Visibility.Collapsed;
        SetAdminActionsEnabled(true);
        StartServiceButton.IsEnabled = !missing;
        StatusChanged?.Invoke(missing ? "issue" : "stopped");
    }

    private void ApplyResponse(MachineControlResponse response)
    {
        switch (ConnectionStateForResponse(response.State))
        {
            case SetupConnectionState.Unpaired:
                ApplyState(SetupConnectionState.Unpaired, response, stateCode: "unpaired");
                break;
            case SetupConnectionState.AwaitingFirstSync:
                ApplyState(SetupConnectionState.AwaitingFirstSync, response,
                    heading: "机器已配对，正在等待策略",
                    description: "Service 已安全保存机器凭据；首次收到有效策略前不会采集。",
                    stateCode: "pendingPolicy");
                break;
            case SetupConnectionState.Online:
                var pending = response.LegacyOutboxCount + response.UsageOutboxCount
                    + response.MediaOutboxCount + response.LogOutboxCount > 0;
                ApplyState(SetupConnectionState.Online, response,
                    heading: pending ? "本机服务正常，数据待同步" : "这台电脑已受管理",
                    description: pending
                        ? "Runtime Service 正在运行；本地待上传数据会在网络恢复后自动重试。"
                        : "Runtime Service 在线，机器策略已缓存并应用。关闭窗口不会停止后台服务。",
                    stateCode: pending ? "pendingSync" : "online");
                break;
            default:
                ApplyState(SetupConnectionState.ConnectionIssue, response, stateCode: "issue");
                break;
        }
    }

    internal static SetupConnectionState ConnectionStateForResponse(string? state) => state switch
    {
        "unpaired" => SetupConnectionState.Unpaired,
        "enrolled" or "pendingPolicy" => SetupConnectionState.AwaitingFirstSync,
        "online" => SetupConnectionState.Online,
        _ => SetupConnectionState.ConnectionIssue,
    };

    internal static bool ShouldShutdownOnWindowClosed(bool keepInTray) => !keepInTray;

    private void ApplyState(SetupConnectionState state, MachineControlResponse? service = null,
        string? heading = null, string? description = null, string stateCode = "issue")
    {
        var presentation = SetupConnectionPresentations.For(state);
        var accent = Brush(presentation.Accent);
        StatusCard.Background = Brush(presentation.Surface);
        StatusCard.BorderBrush = accent;
        StatusDot.Fill = accent;
        StatusBadge.Foreground = accent;
        StatusBadge.Text = presentation.Badge;
        StatusHeading.Text = heading ?? presentation.Heading;
        Status.Text = description ?? presentation.Description;
        ManagedValue.Text = state switch
        {
            SetupConnectionState.Online or SetupConnectionState.AwaitingFirstSync => "已配对",
            SetupConnectionState.Unpaired or SetupConnectionState.RequiresPairing => "未配对",
            _ => "无法确认",
        };
        ServiceStateValue.Text = "正在运行";
        LastHeartbeatValue.Text = FormatTime(service?.LastHeartbeatSucceededAtMs ?? 0, "尚未完成云端确认");
        var bridgeLastSuccess = Math.Max(service?.BrowserBridgeLastHeartbeatAtMs ?? 0,
            service?.BrowserBridgeLastLedgerAckAtMs ?? 0);
        BrowserBridgePublicValue.Text = (service?.BrowserBridgeProtocolVersion ?? 0) <= 0
            ? "尚未连接"
            : $"v{service!.BrowserBridgeProtocolVersion} · {FormatTime(bridgeLastSuccess, "等待首次成功")}";
        PairingPanel.Visibility = adminMode && presentation.ShowPairing ? Visibility.Visible : Visibility.Collapsed;
        PairingCode.IsEnabled = presentation.PairingEnabled;
        ConnectButton.IsEnabled = presentation.PairingEnabled;
        Progress.Visibility = state == SetupConnectionState.Connecting ? Visibility.Visible : Visibility.Collapsed;
        StartServiceButton.IsEnabled = false;
        RestartServiceButton.IsEnabled = adminMode;
        SyncNowButton.IsEnabled = adminMode && state != SetupConnectionState.Unpaired;
        StopServiceButton.IsEnabled = adminMode;
        UninstallButton.IsEnabled = adminMode && state != SetupConnectionState.Unpaired;
        if (state != SetupConnectionState.Online) UninstallPanel.Visibility = Visibility.Collapsed;
        ApplyHealth(service);
        StatusChanged?.Invoke(stateCode);
    }

    private void ApplyHealth(MachineControlResponse? value)
    {
        if (!adminMode || value is null) return;
        HealthSummary.Text = $"Service {SetupConnectionPresentations.DisplayAgentVersion(value.ServiceVersion ?? "—")} · "
            + $"策略 {value.AppliedPolicyVersion}/{value.DesiredPolicyVersion} · "
            + $"会话 {value.ActiveSessionCount}，受保护 {value.ProtectedSessionCount}，采集 Agent {value.AgentCount}";
        OutboxSummary.Text = $"待上传：主账本 {value.UsageOutboxCount + value.LegacyOutboxCount} · 媒体 {value.MediaOutboxCount} · 日志 {value.LogOutboxCount}";
        BrowserBridgeSummary.Text = $"浏览器桥：v{value.BrowserBridgeProtocolVersion} · 待发送 {value.BrowserBridgePendingSendCount} · "
            + $"待投影 {value.BrowserBridgePendingProjectionCount} · 接收 {value.BrowserBridgeAcceptedCount} / 重复 {value.BrowserBridgeDuplicateCount} / 拒绝 {value.BrowserBridgeRejectedCount} · "
            + $"最近 heartbeat {FormatTime(value.BrowserBridgeLastHeartbeatAtMs, "无")} · Probe {FormatTime(value.BrowserBridgeLastProbeAtMs, "无")} · Ledger ACK {FormatTime(value.BrowserBridgeLastLedgerAckAtMs, "无")} · "
            + $"错误 {value.BrowserBridgeLastErrorCode ?? "无"}";
        var remote = value.RemoteLoggingState switch
        {
            "enabled" => $"远程日志已开启（最低 {value.RemoteLoggingMinLevel}，到期 {FormatTime(value.RemoteLoggingExpiresAtMs, "—")}）",
            "expired" => "远程日志策略已过期",
            _ => "远程日志已关闭",
        };
        LogSummary.Text = $"诊断：24 小时 warning {value.WarningCount24h} / error {value.ErrorCount24h} · "
            + $"最近错误码 {value.LastStableErrorCode ?? "无"} · {remote}";
    }

    private void SetAdminActionsEnabled(bool enabled)
    {
        if (!adminMode) return;
        StartServiceButton.IsEnabled = enabled;
        RestartServiceButton.IsEnabled = enabled;
        SyncNowButton.IsEnabled = enabled;
        RepairButton.IsEnabled = enabled;
        StopServiceButton.IsEnabled = enabled;
        UninstallButton.IsEnabled = enabled;
    }

    private void ApplyWindowBounds(double workAreaWidth, double workAreaHeight)
    {
        var bounds = SetupWindowLayout.Resolve(workAreaWidth, workAreaHeight, adminMode);
        MaxWidth = bounds.MaxWidth;
        MaxHeight = bounds.MaxHeight;
        MinWidth = bounds.MinWidth;
        MinHeight = bounds.MinHeight;
        Width = bounds.Width;
        Height = bounds.Height;
    }

    private static async Task<MachineControlResponse> SendAsync(
        MachineControlCommand command, bool administrator, int timeoutMs = 20_000)
    {
        await using var pipe = administrator ? MachineControlPipeClient.Create() : MachineControlPipeClient.CreateStatus();
        await pipe.ConnectAsync(5_000).ConfigureAwait(false);
        using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
        using var reader = new StreamReader(pipe, leaveOpen: true);
        await writer.WriteLineAsync(JsonSerializer.Serialize(command, RuntimeJson.Options)).ConfigureAwait(false);
        var response = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromMilliseconds(timeoutMs)).ConfigureAwait(false);
        return JsonSerializer.Deserialize<MachineControlResponse>(response ?? string.Empty, RuntimeJson.Options)
            ?? throw new InvalidDataException("Runtime Service returned an empty response.");
    }

    private static async Task<MachinePublicStatusResponse> SendPublicStatusAsync()
    {
        await using var pipe = MachineControlPipeClient.CreateStatus();
        await pipe.ConnectAsync(5_000).ConfigureAwait(false);
        using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
        using var reader = new StreamReader(pipe, leaveOpen: true);
        await writer.WriteLineAsync(JsonSerializer.Serialize(new MachineControlCommand("status"), RuntimeJson.Options)).ConfigureAwait(false);
        var response = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(20)).ConfigureAwait(false);
        return JsonSerializer.Deserialize<MachinePublicStatusResponse>(response ?? string.Empty, RuntimeJson.Options)
            ?? throw new InvalidDataException("Runtime Service returned an empty public status response.");
    }

    internal static MachineControlResponse FromPublic(MachinePublicStatusResponse value) => new(
        value.Success,
        value.State,
        value.ErrorCode,
        value.ServiceVersion,
        ServiceStartedAtMs: value.ServiceStartedAtMs,
        LastHeartbeatSucceededAtMs: value.LastHeartbeatSucceededAtMs,
        UsageOutboxCount: value.HasPendingUploads ? 1 : 0,
        BrowserBridgeProtocolVersion: value.BrowserBridgeProtocolVersion,
        BrowserBridgeLastHeartbeatAtMs: value.BrowserBridgeLastSuccessAtMs,
        BrowserBridgeLastLedgerAckAtMs: value.BrowserBridgeLastSuccessAtMs);

    internal static bool IsCode(string value) =>
        System.Text.RegularExpressions.Regex.IsMatch(value, "^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$");

    internal static string ServiceStateLabel(ServiceControllerStatus? state) => state switch
    {
        ServiceControllerStatus.Running => "正在运行",
        ServiceControllerStatus.Stopped => "已停止",
        ServiceControllerStatus.StartPending => "正在启动",
        ServiceControllerStatus.StopPending => "正在停止",
        null => "未安装",
        _ => "状态变化中",
    };

    internal static string FormatTime(long value, string fallback) => value <= 0
        ? fallback
        : DateTimeOffset.FromUnixTimeMilliseconds(value).ToLocalTime().ToString("yyyy/M/d HH:mm:ss");

    private static bool IsControlException(Exception exception) =>
        exception is IOException or InvalidDataException or System.TimeoutException or UnauthorizedAccessException
            or JsonException or InvalidOperationException;

    private static System.Windows.Media.Brush Brush(string value) =>
        (System.Windows.Media.Brush)new BrushConverter().ConvertFromString(value)!;

    private static string? FindInstalledProduct()
    {
        var value = new StringBuilder(39);
        var result = MsiEnumRelatedProducts("{7DEBE72B-8D64-438F-8C51-8B9969C039D9}", 0, 0, value);
        return result == 0 ? value.ToString() : null;
    }

    [System.Runtime.InteropServices.DllImport("msi.dll", CharSet = System.Runtime.InteropServices.CharSet.Unicode)]
    private static extern uint MsiEnumRelatedProducts(string upgradeCode, uint reserved, uint productIndex, StringBuilder productCode);
}
