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
                    // DisplayIcon can point at an icon host or uninstaller, not the actual application.
                    applications.Add(Observe(name, null, $"registry:{hive}:{keyName}", failed, "registry"));
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
                        applications.Add(Observe(Path.GetFileNameWithoutExtension(shortcut), target, "shortcut:" + WindowsApplicationEvidence.Hash(shortcut), failed, "shortcut"));
                }
            }
            catch (Exception error) when (error is UnauthorizedAccessException or IOException or COMException)
            { failed.Add("start-menu-" + folder); }
        }
        try { applications.AddRange(await PackagesAsync(failed, cancellationToken).ConfigureAwait(false)); }
        catch (Exception error) when (error is IOException or JsonException or InvalidOperationException or System.ComponentModel.Win32Exception)
        { failed.Add("user-packages"); }
        return new ApplicationDiscoveryResult(applications.GroupBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal)
            .Select(MergeObservations).OrderBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal).ToArray(), failed.Distinct(StringComparer.Ordinal).ToArray());
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
    private static DiscoveredApplication Observe(string name, string? path, string localKey, List<string> failed, string source)
    {
        if (path is not null && File.Exists(path))
        {
            try { return new(WindowsApplicationEvidence.FromExecutable(path, name) with { Discovery = new("application", "installation", [source]) }, "installed"); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException) { }
        }
        if (path is not null) failed.Add("executable-evidence-unavailable");
        // Installed metadata without an executable is a weak candidate, not a fabricated product match.
        return new(new AppEvidence("windows", "windows:installed:" + WindowsApplicationEvidence.Hash(localKey), name,
            new Dictionary<string,string> { ["productName"] = name }, [], Discovery: new("candidate", "installation", [source])), "installed");
    }
    public static DiscoveredApplication MergeObservations(IEnumerable<DiscoveredApplication> observations)
    {
        var items = observations.ToArray();
        if (items.Length == 0 || items.Select(item => item.Evidence.RuntimeIdentity).Distinct(StringComparer.Ordinal).Count() != 1)
            throw new InvalidDataException("AMBIGUOUS_APPLICATION_OBSERVATIONS");
        var first = items.OrderBy(item => item.Evidence.Discovery?.NameSource == "appList" ? 0 : item.Evidence.Discovery?.NameSource == "fallback" ? 2 : 1).First();
        var sources = items.SelectMany(item => item.Evidence.Discovery?.SourceKinds ?? []).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        var values = new Dictionary<string,string>();
        var verified = new List<string>();
        foreach (var field in items.SelectMany(item => item.Evidence.Values.Keys).Distinct(StringComparer.Ordinal))
        {
            var distinct = items.Select(item => item.Evidence.Values.GetValueOrDefault(field)).Where(value => value is not null).Distinct(StringComparer.Ordinal).ToArray();
            if (distinct.Length != 1) continue; // Conflicting proof is not silently promoted.
            values[field] = distinct[0]!;
            if (items.Any(item => item.Evidence.VerifiedFields.Contains(field))) verified.Add(field);
        }
        var role = items.Any(item => item.Evidence.Discovery?.Role == "application") ? "application" : first.Evidence.Discovery?.Role ?? "candidate";
        return first with { Evidence = first.Evidence with { Values = values, VerifiedFields = verified,
            Discovery = new(role, first.Evidence.Discovery?.NameSource ?? "fallback", sources) } };
    }

    /// <summary>Pure parser: a package is not a product; visible entrypoints stay separate.</summary>
    public static IReadOnlyList<DiscoveredApplication> ParsePackageManifest(string xml, string family, string fallbackName,
        IReadOnlyDictionary<string,string>? appListNames = null)
    {
        var manifest = XDocument.Parse(xml);
        var result = new List<DiscoveredApplication>();
        foreach (var app in manifest.Descendants().Where(element => element.Name.LocalName == "Application"))
        {
            var appId = (string?)app.Attribute("Id"); if (string.IsNullOrWhiteSpace(appId)) continue;
            var aumid = family + "!" + appId;
            var visual = app.Elements().FirstOrDefault(element => element.Name.LocalName == "VisualElements");
            var declaredName = (string?)visual?.Attribute("DisplayName");
            var friendly = appListNames?.GetValueOrDefault(aumid);
            var literal = !string.IsNullOrWhiteSpace(declaredName) && !declaredName.StartsWith("ms-resource:", StringComparison.OrdinalIgnoreCase);
            var name = !string.IsNullOrWhiteSpace(friendly) ? friendly : literal ? declaredName! : fallbackName + " · " + appId;
            var role = visual is null || string.Equals((string?)visual.Attribute("AppListEntry"), "none", StringComparison.OrdinalIgnoreCase) ? "component" : "application";
            var identity = WindowsApplicationIdentityDeriver.Derive(null, name, family, aumid);
            result.Add(new(new AppEvidence("windows", identity.RuntimeIdentity, name,
                new Dictionary<string,string> { ["packageId"] = aumid }, ["packageId"],
                Discovery: new(role, !string.IsNullOrWhiteSpace(friendly) ? "appList" : literal ? "manifest" : "fallback", ["package"])), "installed"));
        }
        return result;
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
    private static async Task<IReadOnlyList<DiscoveredApplication>> PackagesAsync(List<string> failed, CancellationToken token)
    {
        var system = Environment.GetFolderPath(Environment.SpecialFolder.System);
        using var process = new Process { StartInfo = new ProcessStartInfo(Path.Combine(system, @"WindowsPowerShell\v1.0\powershell.exe"))
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true } };
        foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-Command", "$ErrorActionPreference='Stop'; $packages=@(Get-AppxPackage | Where-Object { -not $_.IsFramework -and -not $_.IsResourcePackage } | Select-Object Name,PackageFamilyName,InstallLocation); $apps=@(Get-StartApps | Select-Object Name,AppID); ConvertTo-Json -InputObject @{packages=$packages;apps=$apps} -Compress" }) process.StartInfo.ArgumentList.Add(arg);
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
        var appListNames = document.RootElement.GetProperty("apps").EnumerateArray()
            .GroupBy(app => app.GetProperty("AppID").GetString() ?? "", StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First().GetProperty("Name").GetString() ?? "", StringComparer.Ordinal);
        var result = new List<DiscoveredApplication>();
        foreach (var package in document.RootElement.GetProperty("packages").EnumerateArray())
        {
            var family = package.GetProperty("PackageFamilyName").GetString();
            var location = package.GetProperty("InstallLocation").GetString();
            if (string.IsNullOrWhiteSpace(family) || string.IsNullOrWhiteSpace(location)) { failed.Add("package-metadata-unavailable"); continue; }
            var manifestPath = Path.Combine(location, "AppxManifest.xml");
            if (!File.Exists(manifestPath)) { failed.Add("package-manifest-unavailable"); continue; }
            try
            {
                result.AddRange(ParsePackageManifest(File.ReadAllText(manifestPath), family,
                    package.GetProperty("Name").GetString() ?? "Windows application", appListNames));
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Xml.XmlException)
            { failed.Add("package-manifest-unavailable"); }
        }
        return result;
    }
}
