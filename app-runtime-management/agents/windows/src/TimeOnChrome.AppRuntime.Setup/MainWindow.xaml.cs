using System.IO;
using System.IO.Pipes;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using TimeOnChrome.AppRuntime.Infrastructure;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class MainWindow : Window
{
    private readonly DispatcherTimer statusTimer = new() { Interval = TimeSpan.FromSeconds(2) };
    private bool requestInProgress;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closed += (_, _) => statusTimer.Stop();
        statusTimer.Tick += async (_, _) => await RefreshConnectionStateAsync().ConfigureAwait(true);
        ApplyState(SetupConnectionState.Unpaired);
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await RefreshConnectionStateAsync().ConfigureAwait(true);
        statusTimer.Start();
    }

    private async void ConnectButton_Click(object sender, RoutedEventArgs e)
    {
        if (requestInProgress) return;
        var code = PairingCode.Text.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$"))
        {
            ApplyState(SetupConnectionState.RequiresPairing,
                heading: "配对码格式不正确",
                description: "请输入家长控制台显示的 XXXX-XXXX-XXXX 机器配对码。");
            PairingCode.Focus();
            return;
        }
        requestInProgress = true;
        ApplyState(SetupConnectionState.Connecting);
        try
        {
            var response = await SendAsync(new MachineControlCommand("enroll", code, Environment.MachineName)).ConfigureAwait(true);
            if (!response.Success)
            {
                ApplyState(SetupConnectionState.RequiresPairing,
                    heading: response.ErrorCode == "PAIRING_CODE_INVALID" ? "配对码无效或已过期" : "未能完成机器配对",
                    description: "请在家长控制台重新生成机器配对码后再试。");
                return;
            }
            PairingCode.Clear();
            ApplyResponse(response.State == "alreadyEnrolled"
                ? await SendAsync(new MachineControlCommand("status")).ConfigureAwait(true)
                : response);
        }
        catch (Exception exception) when (exception is IOException or TimeoutException or UnauthorizedAccessException)
        {
            ApplyState(SetupConnectionState.ConnectionIssue,
                heading: "Runtime Service 暂时不可用",
                description: "请确认 2.0 Service 已安装并正在运行，然后点击“重新检查”。");
        }
        finally
        {
            requestInProgress = false;
        }
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e) =>
        await RefreshConnectionStateAsync().ConfigureAwait(true);

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private void UninstallButton_Click(object sender, RoutedEventArgs e)
    {
        UninstallPanel.Visibility = Visibility.Visible;
        UninstallButton.Visibility = Visibility.Collapsed;
        UninstallCode.Focus();
    }

    private async void ConfirmUninstallButton_Click(object sender, RoutedEventArgs e)
    {
        var code = UninstallCode.Text.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$"))
        {
            ApplyState(SetupConnectionState.ConnectionIssue,
                heading: "卸载码格式不正确",
                description: "请在家长控制台生成 10 分钟单次卸载码后输入。");
            return;
        }
        try
        {
            var response = await SendAsync(new MachineControlCommand("uninstall", code)).ConfigureAwait(true);
            if (!response.Success) throw new InvalidOperationException("Uninstall was not authorized.");
            var productCode = FindInstalledProduct();
            if (productCode is null) throw new InvalidOperationException("Installed product was not found.");
            _ = Process.Start(new ProcessStartInfo("msiexec.exe", $"/x {productCode} /passive") { UseShellExecute = true });
            Close();
        }
        catch (Exception exception) when (exception is IOException or TimeoutException or UnauthorizedAccessException or InvalidOperationException)
        {
            ApplyState(SetupConnectionState.ConnectionIssue,
                heading: "卸载未获授权",
                description: "卸载码无效、已过期或已使用。请由家长重新生成后再试。");
        }
    }

    private async Task RefreshConnectionStateAsync()
    {
        if (requestInProgress) return;
        requestInProgress = true;
        try
        {
            ApplyResponse(await SendAsync(new MachineControlCommand("status")).ConfigureAwait(true));
        }
        catch (Exception exception) when (exception is IOException or TimeoutException or UnauthorizedAccessException)
        {
            ApplyState(SetupConnectionState.ConnectionIssue,
                heading: "Runtime Service 未响应",
                description: "机器级 Service 未运行或尚未安装。请修复安装后重新检查。");
        }
        finally
        {
            requestInProgress = false;
        }
    }

    private void ApplyResponse(MachineControlResponse response)
    {
        switch (response.State)
        {
            case "unpaired":
                ApplyState(SetupConnectionState.Unpaired);
                break;
            case "enrolled":
            case "pendingPolicy":
                ApplyState(SetupConnectionState.AwaitingFirstSync, response,
                    heading: "机器已配对，正在等待策略",
                    description: "Service 已安全保存机器凭据。首次收到有效策略前不会采集。家长控制台下发后会自动开始。");
                break;
            case "online":
                ApplyState(SetupConnectionState.Online, response,
                    heading: "这台电脑已受管理",
                    description: "Runtime Service 在线，机器策略已缓存并应用。关闭此窗口不会停止后台 Service。");
                break;
            default:
                ApplyState(SetupConnectionState.ConnectionIssue);
                break;
        }
    }

    private static async Task<MachineControlResponse> SendAsync(MachineControlCommand command)
    {
        await using var pipe = new NamedPipeClientStream(".", SessionPipeNames.Control,
            PipeDirection.InOut, PipeOptions.Asynchronous);
        await pipe.ConnectAsync(5_000).ConfigureAwait(false);
        using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
        using var reader = new StreamReader(pipe, leaveOpen: true);
        await writer.WriteLineAsync(JsonSerializer.Serialize(command, RuntimeJson.Options)).ConfigureAwait(false);
        var response = await reader.ReadLineAsync().WaitAsync(TimeSpan.FromSeconds(20)).ConfigureAwait(false);
        return JsonSerializer.Deserialize<MachineControlResponse>(response ?? string.Empty, RuntimeJson.Options)
            ?? throw new InvalidDataException("Runtime Service returned an empty response.");
    }

    private void ApplyState(
        SetupConnectionState state,
        MachineControlResponse? service = null,
        string? heading = null,
        string? description = null)
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
        PairingPanel.Visibility = presentation.ShowPairing ? Visibility.Visible : Visibility.Collapsed;
        PairingCode.IsEnabled = presentation.PairingEnabled;
        ConnectButton.IsEnabled = presentation.PairingEnabled;
        Progress.Visibility = state == SetupConnectionState.Connecting ? Visibility.Visible : Visibility.Collapsed;
        DeviceDetails.Visibility = presentation.ShowDetails ? Visibility.Visible : Visibility.Collapsed;
        RefreshButton.Visibility = presentation.ShowRefresh ? Visibility.Visible : Visibility.Collapsed;
        UninstallButton.Visibility = state == SetupConnectionState.Online && UninstallPanel.Visibility != Visibility.Visible
            ? Visibility.Visible : Visibility.Collapsed;
        if (state != SetupConnectionState.Online) UninstallPanel.Visibility = Visibility.Collapsed;
        CloseButton.Content = presentation.CloseLabel;
        CloseButton.IsEnabled = presentation.CloseEnabled;
        DeviceNameValue.Text = Environment.MachineName;
        AgentVersionValue.Text = service?.ServiceVersion ?? "等待 Service 报告";
        LastHeartbeatValue.Text = service is null || service.UpdatedAtMs <= 0
            ? "等待首次确认"
            : DateTimeOffset.FromUnixTimeMilliseconds(service.UpdatedAtMs).ToLocalTime().ToString("yyyy/M/d HH:mm:ss");
    }

    private static Brush Brush(string value) => (Brush)new BrushConverter().ConvertFromString(value)!;

    private static string? FindInstalledProduct()
    {
        var value = new StringBuilder(39);
        var result = MsiEnumRelatedProducts("{7DEBE72B-8D64-438F-8C51-8B9969C039D9}", 0, 0, value);
        return result == 0 ? value.ToString() : null;
    }

    [DllImport("msi.dll", CharSet = CharSet.Unicode)]
    private static extern uint MsiEnumRelatedProducts(
        string upgradeCode,
        uint reserved,
        uint productIndex,
        StringBuilder productCode);
}
