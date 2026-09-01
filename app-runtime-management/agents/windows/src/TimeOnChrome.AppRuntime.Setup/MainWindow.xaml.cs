using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Security.Cryptography;
using System.Text.Json;
using System.Windows;
using System.Windows.Media;
using System.Windows.Threading;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class MainWindow : Window
{
    private static readonly TimeSpan OnlineFreshness = TimeSpan.FromMinutes(10);
    private readonly RuntimePaths paths = RuntimePaths.ForCurrentUser();
    private readonly DispatcherTimer statusTimer = new() { Interval = TimeSpan.FromSeconds(2) };
    private readonly WindowsStartupRegistration startupRegistration = new();
    private RuntimeCredential? credential;
    private bool connectionInProgress;
    private bool refreshInProgress;

    public MainWindow()
    {
        InitializeComponent();
        Loaded += MainWindow_Loaded;
        Closed += (_, _) => statusTimer.Stop();
        statusTimer.Tick += async (_, _) => await RefreshConnectionStateAsync(startAgent: false);
        ApplyState(SetupConnectionState.Unpaired);
    }

    private async void MainWindow_Loaded(object sender, RoutedEventArgs e)
    {
        await RefreshConnectionStateAsync(startAgent: true);
        statusTimer.Start();
    }

    private async void ConnectButton_Click(object sender, RoutedEventArgs e)
    {
        if (connectionInProgress) return;
        var code = PairingCode.Text.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$"))
        {
            ApplyState(
                SetupConnectionState.RequiresPairing,
                heading: "配对码格式不正确",
                description: "请输入家长控制台显示的 XXXX-XXXX-XXXX 配对码。");
            PairingCode.Focus();
            return;
        }

        connectionInProgress = true;
        ApplyState(SetupConnectionState.Connecting);
        credential = null;
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            var enrolledCredential = await new RuntimeApiClient(http).EnrollAsync(
                RuntimeProductConfiguration.ServerUrl,
                code,
                Environment.MachineName);
            await new DpapiRuntimeCredentialStore(paths.CredentialPath).SaveAsync(enrolledCredential);
            credential = enrolledCredential;
            EnsureAgentStarted();
            PairingCode.Clear();
            ApplyState(SetupConnectionState.AwaitingFirstSync);
        }
        catch (RuntimeApiException exception) when (exception.StatusCode is 400 or 401)
        {
            credential = null;
            ApplyState(SetupConnectionState.RequiresPairing);
        }
        catch (HttpRequestException)
        {
            credential = null;
            ApplyState(
                SetupConnectionState.RequiresPairing,
                heading: "暂时无法连接服务",
                description: "请检查网络后重试。配对码在有效期内仍可继续使用。");
        }
        catch (TaskCanceledException)
        {
            credential = null;
            ApplyState(
                SetupConnectionState.RequiresPairing,
                heading: "连接超时",
                description: "服务暂时没有响应，请检查网络后重试。");
        }
        catch (Exception) when (credential is null)
        {
            ApplyState(
                SetupConnectionState.RequiresPairing,
                heading: "未能完成连接",
                description: "配对信息没有保存。请重新生成配对码后再试。");
        }
        catch (Exception)
        {
            ApplyState(
                SetupConnectionState.ConnectionIssue,
                heading: "本地设置未完成",
                description: "配对信息已保存，但 Agent 尚未完成启动。请点击“重新检查”。");
        }
        finally
        {
            connectionInProgress = false;
        }
    }

    private async void RefreshButton_Click(object sender, RoutedEventArgs e)
    {
        ApplyState(SetupConnectionState.AwaitingFirstSync);
        await RefreshConnectionStateAsync(startAgent: true);
    }

    private void CloseButton_Click(object sender, RoutedEventArgs e) => Close();

    private async Task RefreshConnectionStateAsync(bool startAgent)
    {
        if (connectionInProgress || refreshInProgress) return;
        refreshInProgress = true;
        try
        {
            credential = await new DpapiRuntimeCredentialStore(paths.CredentialPath).LoadAsync();
            if (credential is null)
            {
                var unboundHealth = await new RuntimeAgentHealthStore(paths.HealthPath).LoadAsync();
                ApplyState(unboundHealth?.State == RuntimeAgentHealthState.RequiresPairing
                    ? SetupConnectionState.RequiresPairing
                    : SetupConnectionState.Unpaired);
                return;
            }

            if (startAgent) EnsureAgentStarted();

            var health = await new RuntimeAgentHealthStore(paths.HealthPath).LoadAsync();
            if (health is null ||
                !string.Equals(
                    health.DeviceKey,
                    RuntimePaths.DeviceKey(credential.DeviceId),
                    StringComparison.Ordinal))
            {
                ApplyState(SetupConnectionState.AwaitingFirstSync);
                return;
            }

            var agentRunning = WindowsRuntimeInstanceNames.IsAgentRunning();
            var updatedAt = DateTimeOffset.FromUnixTimeMilliseconds(health.UpdatedAtMs);
            var isFresh = DateTimeOffset.UtcNow - updatedAt <= OnlineFreshness;
            switch (health.State)
            {
                case RuntimeAgentHealthState.Online when agentRunning && isFresh:
                    ApplyState(SetupConnectionState.Online, health: health);
                    break;
                case RuntimeAgentHealthState.RequiresPairing:
                    ApplyState(SetupConnectionState.RequiresPairing);
                    break;
                case RuntimeAgentHealthState.Starting when agentRunning:
                    ApplyState(SetupConnectionState.AwaitingFirstSync, health: health);
                    break;
                default:
                    ApplyState(SetupConnectionState.ConnectionIssue, health: health);
                    break;
            }
        }
        catch (CryptographicException)
        {
            credential = null;
            ApplyState(
                SetupConnectionState.RequiresPairing,
                heading: "本地配对信息无法读取",
                description: "请在家长控制台重新生成配对码。原凭据不会显示或上传。");
        }
        catch (InvalidDataException)
        {
            credential = null;
            ApplyState(
                SetupConnectionState.RequiresPairing,
                heading: "本地配对信息已损坏",
                description: "请在家长控制台重新生成配对码。原凭据不会显示或上传。");
        }
        catch (JsonException)
        {
            credential = null;
            ApplyState(
                SetupConnectionState.RequiresPairing,
                heading: "本地配对信息已损坏",
                description: "请在家长控制台重新生成配对码。原凭据不会显示或上传。");
        }
        catch (Exception)
        {
            ApplyState(
                credential is null ? SetupConnectionState.Unpaired : SetupConnectionState.ConnectionIssue);
        }
        finally
        {
            refreshInProgress = false;
        }
    }

    private void EnsureAgentStarted()
    {
        var agentPath = Path.Combine(AppContext.BaseDirectory, "TimeOnChrome.AppRuntime.Agent.exe");
        if (!File.Exists(agentPath)) throw new FileNotFoundException("Agent executable is missing.", agentPath);
        if (!startupRegistration.IsRegistered()) startupRegistration.Register(agentPath);
        if (WindowsRuntimeInstanceNames.IsAgentRunning()) return;
        _ = Process.Start(new ProcessStartInfo(agentPath) { UseShellExecute = true });
    }

    private void ApplyState(
        SetupConnectionState state,
        RuntimeAgentHealth? health = null,
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
        Progress.Visibility = state == SetupConnectionState.Connecting
            ? Visibility.Visible
            : Visibility.Collapsed;
        DeviceDetails.Visibility = presentation.ShowDetails ? Visibility.Visible : Visibility.Collapsed;
        RefreshButton.Visibility = presentation.ShowRefresh ? Visibility.Visible : Visibility.Collapsed;
        CloseButton.Content = presentation.CloseLabel;
        CloseButton.IsEnabled = presentation.CloseEnabled;
        DeviceNameValue.Text = Environment.MachineName;
        AgentVersionValue.Text = health is null
            ? "等待 Agent 报告"
            : SetupConnectionPresentations.DisplayAgentVersion(health.AgentVersion);
        LastHeartbeatValue.Text = health is null
            ? "等待首次确认"
            : DateTimeOffset.FromUnixTimeMilliseconds(health.UpdatedAtMs)
                .ToLocalTime()
                .ToString("yyyy/M/d HH:mm:ss");
    }

    private static Brush Brush(string value) =>
        (Brush)new BrushConverter().ConvertFromString(value)!;
}
