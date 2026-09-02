using System.Diagnostics;
using System.IO;
using System.Net.Http;
using System.Runtime.InteropServices;
using System.Security;
using System.Security.Cryptography;
using System.Security.Principal;
using System.Text;
using System.Windows;
using Microsoft.Data.Sqlite;
using Microsoft.Win32;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Migration;

public static class Program
{
    private const string LegacyUpgradeCode = "{B646BA2C-3D5F-45B3-8BAA-3277B42C33AD}";
    private const string StartupPath = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string StartupValue = "TimeOnChromeAppRuntime";

    public static async Task<int> Main(string[] args)
    {
        if (args.Contains("--package-probe", StringComparer.OrdinalIgnoreCase))
            return await RunPackageProbeAsync().ConfigureAwait(false);
        if (args.Contains("--machine-conflict-probe", StringComparer.OrdinalIgnoreCase))
            return RunMachineConflictProbe();
        if (args.Contains("--noop", StringComparer.OrdinalIgnoreCase)) return 0;
        if (!OperatingSystem.IsWindows()) return 2;
        try
        {
            var paths = RuntimePaths.ForCurrentUser();
            if (await HasPendingOutboxAsync(paths.RootDirectory).ConfigureAwait(false))
            {
                Notify("当前账户的 1.x 使用记录仍在等待上传。请保持旧 Agent 联网，待上传完成后再运行 2.0 安装程序。");
                return 21;
            }
            var credentialStore = new DpapiRuntimeCredentialStore(paths.CredentialPath);
            var credential = await credentialStore.LoadAsync().ConfigureAwait(false);
            if (credential is not null)
            {
                using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(20) };
                await new MachineRuntimeApiClient(http).RetireLegacyAsync(credential).ConfigureAwait(false);
                var retiredPath = Path.Combine(paths.RootDirectory, "credential-v1.retired.dat");
                if (File.Exists(paths.CredentialPath)) File.Move(paths.CredentialPath, retiredPath, overwrite: true);
            }
            new WindowsStartupRegistration().Remove();
            return await UninstallLegacyMsiAsync().ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is CryptographicException or SecurityException or SqliteException or RuntimeApiException
            or HttpRequestException or IOException or UnauthorizedAccessException)
        {
            Notify($"无法安全迁移 1.x Runtime（{exception.GetType().Name}）。旧配对和本地账本没有被自动清除，请稍后重试。");
            return 22;
        }
    }

    public static int RunMachineConflictProbe()
    {
        if (!OperatingSystem.IsWindows()) return 2;
        try
        {
            using var identity = WindowsIdentity.GetCurrent();
            if (!new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator)) return 27;
            var interactiveSid = GetInteractiveSessionSid();
            if (string.IsNullOrWhiteSpace(interactiveSid)) return 28;
            var conflicts = FindOtherUserConflicts(interactiveSid);
            if (conflicts.Count == 0) return 0;
            Notify("检测到其他 Windows 用户仍在使用 1.x Runtime：\n\n"
                + string.Join("\n", conflicts.Select(item => $"• {item}"))
                + "\n\n请先登录这些账户完成同步或移除旧版，再重新运行 2.0 安装程序。");
            return 20;
        }
        catch (Exception exception) when (exception is SecurityException or IOException or UnauthorizedAccessException)
        {
            Notify($"无法安全检查其他 Windows 用户的 1.x Runtime（{exception.GetType().Name}）。安装尚未修改旧配对或账本。");
            return 28;
        }
    }

    public static async Task<int> RunPackageProbeAsync()
    {
        if (!OperatingSystem.IsWindows()) return 2;
        try
        {
            await using var connection = new SqliteConnection("Data Source=:memory:");
            await connection.OpenAsync().ConfigureAwait(false);
            await using var command = connection.CreateCommand();
            command.CommandText = "SELECT 1;";
            if (Convert.ToInt32(await command.ExecuteScalarAsync().ConfigureAwait(false), System.Globalization.CultureInfo.InvariantCulture) != 1)
                return 24;

            var plaintext = RandomNumberGenerator.GetBytes(32);
            var protectedBytes = ProtectedData.Protect(plaintext, null, DataProtectionScope.CurrentUser);
            var roundTrip = ProtectedData.Unprotect(protectedBytes, null, DataProtectionScope.CurrentUser);
            return CryptographicOperations.FixedTimeEquals(plaintext, roundTrip) ? 0 : 25;
        }
        catch (Exception exception) when (exception is CryptographicException or SecurityException or SqliteException
            or IOException or UnauthorizedAccessException)
        {
            return 26;
        }
    }

    public static async Task<bool> HasPendingOutboxAsync(string root)
    {
        if (!Directory.Exists(root)) return false;
        foreach (var path in Directory.EnumerateFiles(root, "runtime-*.db", SearchOption.TopDirectoryOnly))
        {
            var builder = new SqliteConnectionStringBuilder { DataSource = path, Mode = SqliteOpenMode.ReadOnly, Pooling = false };
            await using var connection = new SqliteConnection(builder.ToString());
            await connection.OpenAsync().ConfigureAwait(false);
            await using var exists = connection.CreateCommand();
            exists.CommandText = "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='runtime_outbox';";
            if (Convert.ToInt32(await exists.ExecuteScalarAsync().ConfigureAwait(false), System.Globalization.CultureInfo.InvariantCulture) == 0) continue;
            await using var count = connection.CreateCommand();
            count.CommandText = "SELECT COUNT(*) FROM runtime_outbox WHERE terminal=0;";
            if (Convert.ToInt32(await count.ExecuteScalarAsync().ConfigureAwait(false), System.Globalization.CultureInfo.InvariantCulture) > 0) return true;
        }
        return false;
    }

    public static bool IsInteractiveProfileSid(string sid) =>
        sid.StartsWith("S-1-5-21-", StringComparison.OrdinalIgnoreCase)
        && !sid.EndsWith("_Classes", StringComparison.OrdinalIgnoreCase);

    private static IReadOnlyList<string> FindOtherUserConflicts(string interactiveSid)
    {
        var result = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        using var profileList = Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList");
        if (profileList is null) throw new SecurityException("Windows profile list is unavailable.");
        foreach (var sid in profileList.GetSubKeyNames())
        {
            if (!IsInteractiveProfileSid(sid) || string.Equals(sid, interactiveSid, StringComparison.OrdinalIgnoreCase)) continue;
            using var run = Registry.Users.OpenSubKey($@"{sid}\{StartupPath}");
            if (run?.GetValue(StartupValue) is string) result.Add(DisplayAccount(sid));
            using var profile = profileList.OpenSubKey(sid);
            var raw = profile?.GetValue("ProfileImagePath") as string;
            if (string.IsNullOrWhiteSpace(raw)) continue;
            var path = Path.GetFullPath(Environment.ExpandEnvironmentVariables(raw));
            if (File.Exists(Path.Combine(path, "AppData", "Local", "TimeOnChrome", "AppRuntime", "credential.dat")))
                result.Add(DisplayAccount(sid));
        }
        return result.ToArray();
    }

    private static string? GetInteractiveSessionSid()
    {
        var sessionId = Process.GetCurrentProcess().SessionId;
        var user = QuerySessionValue(sessionId, WtsInfoClass.UserName);
        if (string.IsNullOrWhiteSpace(user)) return null;
        var domain = QuerySessionValue(sessionId, WtsInfoClass.DomainName);
        var account = string.IsNullOrWhiteSpace(domain) ? user : $"{domain}\\{user}";
        return ((SecurityIdentifier)new NTAccount(account).Translate(typeof(SecurityIdentifier))).Value;
    }

    private static string? QuerySessionValue(int sessionId, WtsInfoClass infoClass)
    {
        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId, infoClass, out var buffer, out _)) return null;
        try { return Marshal.PtrToStringUni(buffer); }
        finally { WTSFreeMemory(buffer); }
    }

    private static string DisplayAccount(string sid)
    {
        try
        {
            return new SecurityIdentifier(sid).Translate(typeof(NTAccount)).Value;
        }
        catch (IdentityNotMappedException)
        {
            return "其他本机账户";
        }
        catch (ArgumentException)
        {
            return "其他本机账户";
        }
    }

    private static void Notify(string message) => MessageBox.Show(
        message,
        "TimeOnChrome 电脑应用使用 2.0",
        MessageBoxButton.OK,
        MessageBoxImage.Warning);

    private static async Task<int> UninstallLegacyMsiAsync()
    {
        var productCode = new StringBuilder(39);
        var enumeration = MsiEnumRelatedProducts(LegacyUpgradeCode, 0, 0, productCode);
        if (enumeration == 259) return 0;
        if (enumeration != 0) return 23;
        using var process = Process.Start(new ProcessStartInfo("msiexec.exe", $"/x {productCode} /qn /norestart")
        {
            UseShellExecute = false,
            CreateNoWindow = true,
        });
        if (process is null) return 23;
        await process.WaitForExitAsync().ConfigureAwait(false);
        return process.ExitCode is 0 or 1605 or 3010 ? 0 : 23;
    }

    [DllImport("msi.dll", CharSet = CharSet.Unicode)]
    private static extern uint MsiEnumRelatedProducts(string upgradeCode, uint reserved, uint productIndex, StringBuilder productCode);

    private enum WtsInfoClass { UserName = 5, DomainName = 7 }

    [DllImport("Wtsapi32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool WTSQuerySessionInformation(
        IntPtr server, int sessionId, WtsInfoClass infoClass, out IntPtr buffer, out int bytesReturned);

    [DllImport("Wtsapi32.dll")]
    private static extern void WTSFreeMemory(IntPtr memory);
}
