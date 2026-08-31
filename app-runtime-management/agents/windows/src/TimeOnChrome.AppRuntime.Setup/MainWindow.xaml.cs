using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Windows;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Setup;

public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
        Loaded += async (_, _) =>
        {
            var credential = await new DpapiRuntimeCredentialStore(RuntimePaths.ForCurrentUser().CredentialPath).LoadAsync();
            if (credential is not null) Status.Text = "已连接。需要更换孩子或设备时，请先在家长控制台吊销并生成重新配对码。";
        };
    }

    private async void ConnectButton_Click(object sender, RoutedEventArgs e)
    {
        var code = PairingCode.Text.Trim().ToUpperInvariant();
        if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$"))
        {
            Status.Text = "配对码格式不正确，请输入 XXXX-XXXX-XXXX。";
            return;
        }
        SetBusy(true, "正在安全连接…");
        try
        {
            using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
            var credential = await new RuntimeApiClient(http).EnrollAsync(
                RuntimeProductConfiguration.ServerUrl, code, Environment.MachineName);
            var paths = RuntimePaths.ForCurrentUser();
            await new DpapiRuntimeCredentialStore(paths.CredentialPath).SaveAsync(credential);
            var agentPath = Path.Combine(AppContext.BaseDirectory, "TimeOnChrome.AppRuntime.Agent.exe");
            if (!File.Exists(agentPath)) throw new InvalidOperationException("安装文件不完整，请重新安装。");
            new WindowsStartupRegistration().Register(agentPath);
            _ = Process.Start(new ProcessStartInfo(agentPath) { UseShellExecute = true });
            PairingCode.Clear();
            Status.Text = "连接成功。应用使用 Agent 已启动，家长控制台将在首次同步后显示状态。";
        }
        catch (RuntimeApiException exception) when (exception.StatusCode is 400 or 401)
        {
            Status.Text = "配对码无效、已使用或已过期，请在家长控制台重新生成。";
        }
        catch (Exception exception)
        {
            Status.Text = $"连接失败：{exception.Message}";
        }
        finally { SetBusy(false, Status.Text); }
    }

    private void SetBusy(bool busy, string status)
    {
        ConnectButton.IsEnabled = !busy;
        PairingCode.IsEnabled = !busy;
        Progress.Visibility = busy ? Visibility.Visible : Visibility.Collapsed;
        Status.Text = status;
    }
}
