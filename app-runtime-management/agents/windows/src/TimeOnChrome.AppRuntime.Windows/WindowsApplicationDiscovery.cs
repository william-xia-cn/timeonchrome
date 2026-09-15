using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Win32;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Windows;

public sealed record DiscoveredApplication(AppEvidence Evidence, string Status);
public sealed record ApplicationDiscoveryResult(IReadOnlyList<DiscoveredApplication> Applications, IReadOnlyList<string> FailedSources);

/// <summary>Explicit read-only inventory. Paths stay inside this adapter and are never returned.</summary>
public sealed class WindowsApplicationDiscovery
{
    private const string Uninstall = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    public string ChangeStamp()
    {
        var entries = new List<string>();
        foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var root = RegistryKey.OpenBaseKey(hive, view);
                using var uninstall = root.OpenSubKey(Uninstall, writable: false);
                foreach (var name in uninstall?.GetSubKeyNames() ?? [])
                {
                    using var key = uninstall!.OpenSubKey(name, writable: false);
                    entries.Add($"{hive}:{view}:{name}:{key?.GetValue("DisplayVersion")}:{key?.GetValue("DisplayIcon")}");
                }
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException)
            { entries.Add("unavailable:" + hive + view); }
        }
        return WindowsApplicationEvidence.Hash(string.Join('\n', entries.Order(StringComparer.Ordinal)));
    }
    public async Task<ApplicationDiscoveryResult> ScanAsync(CancellationToken cancellationToken = default)
    {
        var applications = new List<DiscoveredApplication>();
        var failed = new List<string>();
        foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var root = RegistryKey.OpenBaseKey(hive, view);
                using var uninstall = root.OpenSubKey(Uninstall, writable: false);
                foreach (var keyName in uninstall?.GetSubKeyNames() ?? [])
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    using var key = uninstall!.OpenSubKey(keyName, writable: false);
                    var name = key?.GetValue("DisplayName") as string;
                    if (string.IsNullOrWhiteSpace(name) || key?.GetValue("SystemComponent") as int? == 1) continue;
                    var icon = ExecutableFromDisplayIcon(key?.GetValue("DisplayIcon") as string);
                    applications.Add(Observe(name, icon, $"registry:{hive}:{view}:{keyName}", failed));
                }
            }
            catch (Exception error) when (error is UnauthorizedAccessException or System.Security.SecurityException or IOException)
            { failed.Add($"registry-{hive}-{view}"); }
        }
        foreach (var folder in new[] { Environment.SpecialFolder.CommonPrograms, Environment.SpecialFolder.Programs })
        {
            try
            {
                var root = Environment.GetFolderPath(folder);
                if (!Directory.Exists(root)) continue;
                foreach (var shortcut in Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories))
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var target = ShortcutTarget(shortcut);
                    if (target is null) failed.Add("shortcut-target-unavailable");
                    if (target is not null && target.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                        applications.Add(Observe(Path.GetFileNameWithoutExtension(shortcut), target, "shortcut:" + WindowsApplicationEvidence.Hash(shortcut), failed));
                }
            }
            catch (Exception error) when (error is UnauthorizedAccessException or IOException or COMException)
            { failed.Add("start-menu-" + folder); }
        }
        try { applications.AddRange(await PackagesAsync(cancellationToken).ConfigureAwait(false)); }
        catch (Exception error) when (error is IOException or JsonException or InvalidOperationException or System.ComponentModel.Win32Exception)
        { failed.Add("user-packages"); }
        return new ApplicationDiscoveryResult(applications.GroupBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal)
            .Select(group => group.First()).OrderBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal).ToArray(), failed);
    }
    public static string? ExecutableFromDisplayIcon(string? icon)
    {
        if (string.IsNullOrWhiteSpace(icon)) return null;
        var value = icon.Trim();
        if (value.StartsWith('"')) { var end = value.IndexOf('"', 1); if (end < 0) return null; value = value[1..end]; }
        else { var comma = value.LastIndexOf(','); if (comma >= 0 && int.TryParse(value[(comma+1)..], out _)) value = value[..comma]; }
        value = Environment.ExpandEnvironmentVariables(value);
        return Path.IsPathFullyQualified(value) && value.EndsWith(".exe", StringComparison.OrdinalIgnoreCase) ? value : null;
    }
    private static DiscoveredApplication Observe(string name, string? path, string localKey, List<string> failed)
    {
        if (path is not null && File.Exists(path))
        {
            try { return new(WindowsApplicationEvidence.FromExecutable(path, name), "installed"); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException) { }
        }
        if (path is not null) failed.Add("executable-evidence-unavailable");
        // Installed metadata without an executable is a weak candidate, not a fabricated product match.
        return new(new AppEvidence("windows", "windows:installed:" + WindowsApplicationEvidence.Hash(localKey), name,
            new Dictionary<string,string> { ["productName"] = name }, []), "installed");
    }
    private static string? ShortcutTarget(string path)
    {
        var type = Type.GetTypeFromProgID("WScript.Shell");
        if (type is null) return null;
        object? shell = null, shortcut = null;
        try
        {
            shell = Activator.CreateInstance(type);
            if (shell is null) return null;
            shortcut = type.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, [path]);
            return shortcut?.GetType().InvokeMember("TargetPath", System.Reflection.BindingFlags.GetProperty, null, shortcut, null) as string;
        }
        finally
        {
            if (shortcut is not null && Marshal.IsComObject(shortcut)) _ = Marshal.FinalReleaseComObject(shortcut);
            if (shell is not null && Marshal.IsComObject(shell)) _ = Marshal.FinalReleaseComObject(shell);
        }
    }
    private static async Task<IReadOnlyList<DiscoveredApplication>> PackagesAsync(CancellationToken token)
    {
        var system = Environment.GetFolderPath(Environment.SpecialFolder.System);
        using var process = new Process { StartInfo = new ProcessStartInfo(Path.Combine(system, @"WindowsPowerShell\v1.0\powershell.exe"))
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; $packages=@(Get-AppxPackage | Where-Object { -not $_.IsFramework -and -not $_.IsResourcePackage } | Select-Object Name,PackageFamilyName,InstallLocation); ConvertTo-Json -InputObject $packages -Compress" }) process.StartInfo.ArgumentList.Add(arg);
        if (!process.Start()) throw new InvalidOperationException("PACKAGE_QUERY_START_FAILED");
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(token);
        timeout.CancelAfter(TimeSpan.FromSeconds(30));
        var output = process.StandardOutput.ReadToEndAsync(timeout.Token);
        var errors = process.StandardError.ReadToEndAsync(timeout.Token);
        try { await process.WaitForExitAsync(timeout.Token).ConfigureAwait(false); }
        catch (OperationCanceledException)
        {
            if (!process.HasExited) process.Kill(entireProcessTree: true);
            token.ThrowIfCancellationRequested();
            throw new IOException("PACKAGE_QUERY_TIMEOUT");
        }
        _ = await errors.ConfigureAwait(false);
        if (process.ExitCode != 0) throw new IOException("PACKAGE_QUERY_FAILED");
        using var document = JsonDocument.Parse(await output.ConfigureAwait(false));
        var result = new List<DiscoveredApplication>();
        foreach (var package in document.RootElement.EnumerateArray())
        {
            var family = package.GetProperty("PackageFamilyName").GetString();
            var location = package.GetProperty("InstallLocation").GetString();
            if (string.IsNullOrWhiteSpace(family) || string.IsNullOrWhiteSpace(location)) throw new IOException("PACKAGE_METADATA_UNAVAILABLE");
            var manifestPath = Path.Combine(location, "AppxManifest.xml");
            if (!File.Exists(manifestPath)) throw new IOException("PACKAGE_MANIFEST_UNAVAILABLE");
            try
            {
                var manifest = XDocument.Load(manifestPath);
                foreach (var app in manifest.Descendants().Where(element => element.Name.LocalName == "Application"))
                {
                    var appId = (string?)app.Attribute("Id"); if (string.IsNullOrWhiteSpace(appId)) continue;
                    var aumid = family + "!" + appId;
                    var identity = WindowsApplicationIdentityDeriver.Derive(null, package.GetProperty("Name").GetString() ?? "Windows application", family, aumid);
                    result.Add(new(new AppEvidence("windows", identity.RuntimeIdentity, identity.DisplayName ?? "Windows application",
                        new Dictionary<string,string> { ["packageId"] = aumid }, ["packageId"]), "installed"));
                }
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Xml.XmlException)
            { throw new IOException("PACKAGE_MANIFEST_UNAVAILABLE", error); }
        }
        return result;
    }
}
