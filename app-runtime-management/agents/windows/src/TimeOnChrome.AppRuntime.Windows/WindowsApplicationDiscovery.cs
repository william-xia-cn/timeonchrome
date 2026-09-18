using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.Win32;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Windows;

public sealed record DiscoveredApplication(AppEvidence Evidence, string Status, string SourceKind = "runtime",
    string Scope = "user", string? ParentProductKey = null, string VariantRole = "unknown", bool IsProduct = false);
public sealed record InventorySourceResult(string Source, string Status, int ObservationCount, IReadOnlyList<string> WarningCodes);
public sealed record ApplicationDiscoveryResult(IReadOnlyList<DiscoveredApplication> Products,
    IReadOnlyList<DiscoveredApplication> Variants, IReadOnlyList<InventorySourceResult> SourceResults)
{
    public IReadOnlyList<DiscoveredApplication> Applications => Products.Concat(Variants).ToArray();
    public IReadOnlyList<string> FailedSources => SourceResults.Where(item => item.Status == "failed").Select(item => item.Source).ToArray();
}

/// <summary>Explicit read-only inventory. Paths stay inside this adapter and are never returned.</summary>
public sealed class WindowsApplicationDiscovery
{
    private const string Uninstall = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    private static readonly HashSet<string> ControlledSystemApplicationPackageFamilies = new(StringComparer.OrdinalIgnoreCase)
    {
        "MicrosoftCorporationII.QuickAssist_8wekyb3d8bbwe",
        "Microsoft.WindowsNotepad_8wekyb3d8bbwe",
        "Microsoft.WindowsCalculator_8wekyb3d8bbwe",
    };

    public static bool IsControlledSystemApplicationPackage(string? packageFamily) =>
        !string.IsNullOrWhiteSpace(packageFamily) && ControlledSystemApplicationPackageFamilies.Contains(packageFamily);
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
        var products = new List<DiscoveredApplication>();
        var variants = new List<DiscoveredApplication>();
        var sourceResults = new List<InventorySourceResult>();
        var anchors = new List<ProductAnchor>();
        foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
        {
            var source = hive == RegistryHive.LocalMachine ? "registry-machine" : "registry-user";
            var warnings = new List<string>();
            var before = products.Count;
            try
            {
                foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
                {
                    using var root = RegistryKey.OpenBaseKey(hive, view);
                    using var uninstall = root.OpenSubKey(Uninstall, writable: false);
                    foreach (var keyName in uninstall?.GetSubKeyNames() ?? [])
                    {
                        cancellationToken.ThrowIfCancellationRequested();
                        using var key = uninstall!.OpenSubKey(keyName, writable: false);
                        var name = key?.GetValue("DisplayName") as string;
                        if (string.IsNullOrWhiteSpace(name)) continue;
                        var productKey = WindowsApplicationEvidence.Hash($"registry\n{hive}\n{keyName}");
                        var scope = hive == RegistryHive.LocalMachine ? "machine" : "user";
                        var technical = IsTechnicalRegistryProduct(Convert.ToInt32(key?.GetValue("SystemComponent") ?? 0),
                            key?.GetValue("ParentKeyName") is string, key?.GetValue("ReleaseType") is string);
                        var values = new Dictionary<string,string> { ["productKey"] = productKey, ["productName"] = name,
                            ["installationSource"] = "registry" };
                        var distributionKey = WindowsDistributionIdentity.FromRegistry(keyName,
                            new Dictionary<string,string?>(StringComparer.OrdinalIgnoreCase) {
                                ["gameID"] = key?.GetValue("gameID")?.ToString(),
                                ["GOGGameId"] = key?.GetValue("GOGGameId")?.ToString(),
                                ["OfferId"] = key?.GetValue("OfferId")?.ToString(),
                                ["ContentId"] = key?.GetValue("ContentId")?.ToString(),
                                ["GameId"] = key?.GetValue("GameId")?.ToString(),
                                ["CatalogItemId"] = key?.GetValue("CatalogItemId")?.ToString(),
                                ["AppName"] = key?.GetValue("AppName")?.ToString(),
                                ["ProductId"] = key?.GetValue("ProductId")?.ToString(),
                                ["UplayId"] = key?.GetValue("UplayId")?.ToString(),
                            });
                        if (distributionKey is not null) values["distributionKey"] = distributionKey;
                        var evidence = new AppEvidence("windows", "windows:product:" + productKey, name, values,
                            distributionKey is null ? ["productKey"] : ["productKey", "distributionKey"],
                            Discovery: new(technical ? "component" : "application", "installation", ["registry"],
                                "product", null, "unknown", scope, source, "strong"));
                        products.Add(new(evidence, "installed", source, scope, null, "unknown", true));
                        var installLocation = key?.GetValue("InstallLocation") as string;
                        if (!string.IsNullOrWhiteSpace(installLocation)) anchors.Add(new(evidence.RuntimeIdentity, productKey, name, NormalizeDirectory(installLocation)));
                    }
                }
            }
            catch (Exception error) when (error is UnauthorizedAccessException or System.Security.SecurityException or IOException)
            { sourceResults.Add(new(source, "failed", products.Count - before, ["SOURCE_ENUMERATION_FAILED"])); continue; }
            sourceResults.Add(Result(source, products.Count - before, warnings));
        }
        ScanDistributionManifests(products, anchors, sourceResults, cancellationToken);
        foreach (var folder in new[] { Environment.SpecialFolder.CommonPrograms, Environment.SpecialFolder.Programs })
        {
            var source = folder == Environment.SpecialFolder.CommonPrograms ? "start-menu-common" : "start-menu-user";
            var scope = folder == Environment.SpecialFolder.CommonPrograms ? "machine" : "user";
            var warnings = new List<string>();
            var before = variants.Count;
            try
            {
                var root = Environment.GetFolderPath(folder);
                if (!Directory.Exists(root)) { sourceResults.Add(Result(source, 0, warnings)); continue; }
                foreach (var shortcut in Directory.EnumerateFiles(root, "*.lnk", SearchOption.AllDirectories))
                {
                    cancellationToken.ThrowIfCancellationRequested();
                    var details = ShortcutDetails(shortcut);
                    if (details?.TargetPath is null) { warnings.Add("SHORTCUT_TARGET_UNAVAILABLE"); continue; }
                    if (!details.TargetPath.EndsWith(".exe", StringComparison.OrdinalIgnoreCase)) continue;
                    var parent = anchors.Where(item => IsUnder(details.TargetPath, item.InstallLocation))
                        .OrderByDescending(item => item.InstallLocation.Length).FirstOrDefault();
                    variants.Add(ObserveVariant(Path.GetFileNameWithoutExtension(shortcut), details, parent,
                        "shortcut:" + WindowsApplicationEvidence.Hash(shortcut), warnings, source, scope));
                }
            }
            catch (Exception error) when (error is UnauthorizedAccessException or IOException or COMException)
            { sourceResults.Add(new(source, "failed", variants.Count - before, ["SOURCE_ENUMERATION_FAILED"])); continue; }
            sourceResults.Add(Result(source, variants.Count - before, warnings));
        }
        var packageWarnings = new List<string>();
        try
        {
            var package = await PackagesAsync(packageWarnings, cancellationToken).ConfigureAwait(false);
            products.AddRange(package.Products); variants.AddRange(package.Variants);
            sourceResults.Add(Result("user-packages", package.Products.Count + package.Variants.Count, packageWarnings));
        }
        catch (Exception error) when (error is IOException or JsonException or InvalidOperationException or System.ComponentModel.Win32Exception)
        { sourceResults.Add(new("user-packages", "failed", 0, ["SOURCE_ENUMERATION_FAILED"])); }
        return new ApplicationDiscoveryResult(
            products.GroupBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal).Select(MergeObservations)
                .OrderBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal).ToArray(),
            variants.GroupBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal).Select(MergeObservations)
                .OrderBy(item => item.Evidence.RuntimeIdentity, StringComparer.Ordinal).ToArray(), sourceResults);
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
    private sealed record ProductAnchor(string RuntimeIdentity, string ProductKey, string Name, string InstallLocation);
    private sealed record ShortcutInfo(string TargetPath, string Arguments);
    private sealed record PackageDiscovery(IReadOnlyList<DiscoveredApplication> Products, IReadOnlyList<DiscoveredApplication> Variants);

    private static InventorySourceResult Result(string source, int count, IReadOnlyList<string> warnings) =>
        new(source, warnings.Count == 0 ? "complete" : "complete_with_warnings", count,
            warnings.Distinct(StringComparer.Ordinal).Take(64).ToArray());

    private static void ScanDistributionManifests(List<DiscoveredApplication> products, List<ProductAnchor> anchors,
        List<InventorySourceResult> sourceResults, CancellationToken token)
    {
        ScanManifestSource("distribution-steam", SteamLibraryRoots(), "appmanifest_*.acf",
            (text, root) => WindowsDistributionIdentity.ParseSteamManifest(text, Directory.GetParent(root)?.FullName),
            products, anchors, sourceResults, token);
        var epicRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData),
            "Epic", "EpicGamesLauncher", "Data", "Manifests");
        ScanManifestSource("distribution-epic", [epicRoot], "*.item",
            (text, _) => WindowsDistributionIdentity.ParseEpicManifest(text),
            products, anchors, sourceResults, token);
        foreach (var platform in new[] { "ea", "ubisoft", "gog" })
            ScanIndependentLauncher(platform, products, anchors, sourceResults, token);
    }

    private static void ScanIndependentLauncher(string platform, List<DiscoveredApplication> products,
        List<ProductAnchor> anchors, List<InventorySourceResult> sourceResults, CancellationToken token)
    {
        var source = "distribution-" + platform;
        var warnings = new List<string>();
        var before = products.Count;
        var readable = false;
        var unreadable = false;
        foreach (var hive in new[] { RegistryHive.LocalMachine, RegistryHive.CurrentUser })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        foreach (var registryPath in LauncherRegistryPaths(platform))
        {
            try
            {
                using var baseKey = RegistryKey.OpenBaseKey(hive, view);
                using var root = baseKey.OpenSubKey(registryPath, writable: false);
                if (root is null) continue;
                readable = true;
                AddLauncherRegistryRecord(platform, root, Path.GetFileName(registryPath), source, products, anchors, false);
                foreach (var keyName in root.GetSubKeyNames())
                {
                    token.ThrowIfCancellationRequested();
                    try
                    {
                        using var key = root.OpenSubKey(keyName, writable: false);
                        if (key is null) { warnings.Add("DISTRIBUTION_REGISTRY_ITEM_UNAVAILABLE"); continue; }
                        AddLauncherRegistryRecord(platform, key, keyName, source, products, anchors, true);
                    }
                    catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException)
                    { warnings.Add("DISTRIBUTION_REGISTRY_ITEM_UNAVAILABLE"); }
                }
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException)
            { unreadable = true; warnings.Add("DISTRIBUTION_SOURCE_UNAVAILABLE"); }
        }
        foreach (var root in LauncherManifestRoots(platform).Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root)) continue;
            try
            {
                var files = Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
                    .Where(IsLauncherManifestFile).Take(10001).ToArray();
                readable = true;
                if (files.Length > 10000) warnings.Add("DISTRIBUTION_MANIFEST_CAPACITY");
                foreach (var file in files.Take(10000))
                {
                    token.ThrowIfCancellationRequested();
                    try
                    {
                        if (new FileInfo(file).Length > 4 * 1024 * 1024) { warnings.Add("DISTRIBUTION_MANIFEST_INVALID"); continue; }
                        var record = WindowsDistributionIdentity.ParseLauncherManifest(platform, File.ReadAllText(file));
                        if (record is null) { warnings.Add("DISTRIBUTION_MANIFEST_INVALID"); continue; }
                        AddDistributionObservation(record, source, products, anchors);
                    }
                    catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidDataException)
                    { warnings.Add("DISTRIBUTION_MANIFEST_INVALID"); }
                }
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            { unreadable = true; warnings.Add("DISTRIBUTION_SOURCE_UNAVAILABLE"); }
        }
        sourceResults.Add(BuildDistributionSourceResult(source, products.Count - before, warnings, readable, unreadable));
    }

    private static void AddLauncherRegistryRecord(string platform, RegistryKey key, string keyName, string source,
        List<DiscoveredApplication> products, List<ProductAnchor> anchors, bool allowKeyNameFallback)
    {
        var values = new Dictionary<string,string?>(StringComparer.OrdinalIgnoreCase);
        foreach (var name in new[] { "OfferId", "ContentId", "GameId", "ProductId", "UplayId", "gameID", "GOGGameId",
                     "DisplayName", "GameName", "Title", "Name", "InstallLocation", "InstallDir", "InstallPath", "Path" })
            values[name] = key.GetValue(name)?.ToString();
        values["DisplayName"] ??= key.GetValue(null)?.ToString();
        var record = WindowsDistributionIdentity.ParseLauncherRegistry(platform, keyName, values, allowKeyNameFallback);
        if (record is not null) AddDistributionObservation(record, source, products, anchors);
    }

    private static IReadOnlyList<string> LauncherRegistryPaths(string platform) => platform switch
    {
        "ea" => [@"SOFTWARE\EA Games", @"SOFTWARE\Origin Games", @"SOFTWARE\Electronic Arts\EA Desktop\Installed Games"],
        "ubisoft" => [@"SOFTWARE\Ubisoft\Launcher\Installs", @"SOFTWARE\Ubisoft\Ubisoft Game Launcher\Installs"],
        "gog" => [@"SOFTWARE\GOG.com\Games", @"SOFTWARE\GOG.com\Galaxy\Games"],
        _ => throw new ArgumentOutOfRangeException(nameof(platform)),
    };

    private static IReadOnlyList<string> LauncherManifestRoots(string platform)
    {
        var common = Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData);
        var local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        var programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        return platform switch
        {
            "ea" => [Path.Combine(common, "EA Desktop", "InstallData"), Path.Combine(common, "Electronic Arts", "EA Desktop", "InstallData")],
            "ubisoft" => [Path.Combine(common, "Ubisoft", "Ubisoft Game Launcher", "cache", "ownership"),
                Path.Combine(programFilesX86, "Ubisoft", "Ubisoft Game Launcher", "cache", "ownership")],
            "gog" => [Path.Combine(common, "GOG.com", "Galaxy", "storage"), Path.Combine(local, "GOG.com", "Galaxy", "storage")],
            _ => throw new ArgumentOutOfRangeException(nameof(platform)),
        };
    }

    private static bool IsLauncherManifestFile(string path) => Path.GetExtension(path).ToLowerInvariant()
        is ".json" or ".xml" or ".mfst" or ".info" or ".manifest";

    public static InventorySourceResult BuildDistributionSourceResult(string source, int count,
        IReadOnlyList<string> warnings, bool sourceReadable, bool sourceUnreadable) =>
        sourceUnreadable && !sourceReadable
            ? new(source, "failed", count, warnings.Distinct(StringComparer.Ordinal).Take(64).ToArray())
            : Result(source, count, warnings);

    private static void ScanManifestSource(string source, IEnumerable<string> roots, string pattern,
        Func<string,string,DistributionManifestIdentity?> parser, List<DiscoveredApplication> products,
        List<ProductAnchor> anchors, List<InventorySourceResult> sourceResults, CancellationToken token)
    {
        var warnings = new List<string>();
        var before = products.Count;
        foreach (var root in roots.Distinct(StringComparer.OrdinalIgnoreCase))
        {
            if (string.IsNullOrWhiteSpace(root) || !Directory.Exists(root)) continue;
            IEnumerable<string> files;
            try { files = Directory.EnumerateFiles(root, pattern, SearchOption.TopDirectoryOnly).ToArray(); }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException)
            { warnings.Add("DISTRIBUTION_SOURCE_UNAVAILABLE"); continue; }
            foreach (var file in files)
            {
                token.ThrowIfCancellationRequested();
                try
                {
                    var record = parser(File.ReadAllText(file), root);
                    if (record is null) { warnings.Add("DISTRIBUTION_MANIFEST_INVALID"); continue; }
                    AddDistributionObservation(record, source, products, anchors);
                }
                catch (Exception error) when (error is IOException or UnauthorizedAccessException or JsonException or InvalidDataException)
                { warnings.Add("DISTRIBUTION_MANIFEST_INVALID"); }
            }
        }
        sourceResults.Add(Result(source, products.Count - before, warnings));
    }

    private static void AddDistributionObservation(DistributionManifestIdentity record, string source,
        List<DiscoveredApplication> products, List<ProductAnchor> anchors)
    {
        var localLocation = NormalizeDirectory(record.InstallLocation ?? string.Empty);
        var anchor = string.IsNullOrWhiteSpace(localLocation) ? null : anchors
            .Where(item => string.Equals(item.InstallLocation, localLocation, StringComparison.OrdinalIgnoreCase))
            .OrderBy(item => item.RuntimeIdentity, StringComparer.Ordinal).FirstOrDefault();
        var productKey = anchor?.ProductKey ?? WindowsApplicationEvidence.Hash("distribution:" + record.DistributionKey);
        var runtimeIdentity = anchor?.RuntimeIdentity ?? "windows:product:" + productKey;
        var displayName = anchor?.Name ?? record.DisplayName;
        products.Add(new(new AppEvidence("windows", runtimeIdentity, displayName,
            new Dictionary<string,string> { ["productKey"] = productKey, ["productName"] = displayName,
                ["distributionKey"] = record.DistributionKey, ["installationSource"] = source },
            ["productKey", "distributionKey"], Discovery: new("application", "installation", [source],
                "product", null, "unknown", "machine", source, "strong")),
            "installed", source, "machine", null, "unknown", true));
    }

    private static IReadOnlyList<string> SteamLibraryRoots()
    {
        var roots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var defaultRoot = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), "Steam");
        if (!string.IsNullOrWhiteSpace(defaultRoot)) roots.Add(defaultRoot);
        foreach (var hive in new[] { RegistryHive.CurrentUser, RegistryHive.LocalMachine })
        foreach (var view in new[] { RegistryView.Registry64, RegistryView.Registry32 })
        {
            try
            {
                using var root = RegistryKey.OpenBaseKey(hive, view);
                using var steam = root.OpenSubKey(@"SOFTWARE\Valve\Steam", writable:false);
                var path = steam?.GetValue(hive == RegistryHive.CurrentUser ? "SteamPath" : "InstallPath")?.ToString();
                if (!string.IsNullOrWhiteSpace(path)) roots.Add(Environment.ExpandEnvironmentVariables(path));
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.SecurityException) { }
        }
        foreach (var root in roots.ToArray())
        {
            var libraryFile = Path.Combine(root, "steamapps", "libraryfolders.vdf");
            if (!File.Exists(libraryFile)) continue;
            try
            {
                foreach (System.Text.RegularExpressions.Match match in System.Text.RegularExpressions.Regex.Matches(
                    File.ReadAllText(libraryFile), "\\\"path\\\"\\s+\\\"([^\\\"]+)\\\"",
                    System.Text.RegularExpressions.RegexOptions.IgnoreCase | System.Text.RegularExpressions.RegexOptions.CultureInvariant))
                    roots.Add(match.Groups[1].Value.Replace("\\\\", "\\", StringComparison.Ordinal));
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
        }
        return roots.Select(root => Path.Combine(root, "steamapps")).ToArray();
    }

    private static string NormalizeDirectory(string path)
    {
        try { return Path.TrimEndingDirectorySeparator(Path.GetFullPath(Environment.ExpandEnvironmentVariables(path))); }
        catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException) { return string.Empty; }
    }
    private static bool IsUnder(string path, string directory)
    {
        if (string.IsNullOrWhiteSpace(directory)) return false;
        try
        {
            var full = Path.GetFullPath(path);
            return full.StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
        }
        catch (Exception error) when (error is ArgumentException or NotSupportedException or PathTooLongException) { return false; }
    }
    private static bool HostedByBrowser(ShortcutInfo shortcut)
    {
        var stem = Path.GetFileNameWithoutExtension(shortcut.TargetPath);
        return (stem.Equals("chrome_proxy", StringComparison.OrdinalIgnoreCase)
                || stem.Equals("msedge_proxy", StringComparison.OrdinalIgnoreCase))
            && !string.IsNullOrWhiteSpace(shortcut.Arguments);
    }
    public static bool IsTechnicalRegistryProduct(int systemComponent, bool hasParentKeyName, bool hasReleaseType) =>
        systemComponent == 1 || hasParentKeyName || hasReleaseType;
    public static string ClassifyVariantRole(string displayName, string path, bool hasParentProduct)
    {
        var file = Path.GetFileNameWithoutExtension(path);
        var maintenance = new[] { "uninstall", "unins", "update", "updater", "repair", "errorreporter", "crashreporter" };
        if (maintenance.Any(value => file.Contains(value, StringComparison.OrdinalIgnoreCase)
            || displayName.Contains(value, StringComparison.OrdinalIgnoreCase))) return "maintenance";
        if (hasParentProduct) return "suiteMember";
        return "main";
    }
    private static DiscoveredApplication ObserveVariant(string name, ShortcutInfo shortcut, ProductAnchor? parent,
        string localKey, List<string> warnings, string sourceKind, string scope)
    {
        if (HostedByBrowser(shortcut))
        {
            var hosted = WindowsApplicationEvidence.Hash(shortcut.Arguments);
            var hostedEvidence = new AppEvidence("windows", "windows:hosted:" + hosted, name,
                new Dictionary<string,string> { ["hostedAppId"] = hosted, ["productName"] = name }, ["hostedAppId"],
                Discovery: new("candidate", "appList", ["shortcut"], "variant", null, "hosted", scope, sourceKind, "review"));
            return new(hostedEvidence, "installed", sourceKind, scope, null, "hosted");
        }
        var role = ClassifyVariantRole(name, shortcut.TargetPath, parent is not null && !name.Equals(parent.Name, StringComparison.OrdinalIgnoreCase));
        if (File.Exists(shortcut.TargetPath))
        {
            try
            {
                var evidence = WindowsApplicationEvidence.FromExecutable(shortcut.TargetPath, name);
                var values = new Dictionary<string,string>(evidence.Values);
                if (parent is not null) values["productKey"] = parent.ProductKey;
                return new(evidence with { Values = values,
                    VerifiedFields = parent is null ? evidence.VerifiedFields : evidence.VerifiedFields.Append("productKey").Distinct(StringComparer.Ordinal).ToArray(),
                    Discovery = new(role == "maintenance" ? "candidate" : "application", "appList", ["shortcut"], "variant",
                        parent?.ProductKey, role, scope, sourceKind, role == "maintenance" ? "review" : "strong") },
                    "installed", sourceKind, scope, parent?.ProductKey, role);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException)
            { warnings.Add("EXECUTABLE_EVIDENCE_UNAVAILABLE"); }
        }
        else warnings.Add("EXECUTABLE_EVIDENCE_UNAVAILABLE");
        var identity = "windows:variant:" + WindowsApplicationEvidence.Hash(localKey);
        var fallback = new AppEvidence("windows", identity, name,
            new Dictionary<string,string> { ["productName"] = name }, [], Discovery: new("candidate", "appList", ["shortcut"],
                "variant", parent?.ProductKey, role, scope, sourceKind, "weak"));
        return new(fallback, "installed", sourceKind, scope, parent?.ProductKey, role);
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
        var origins = items.Select(item => item.Evidence.Discovery?.ApplicationOrigin)
            .Where(value => value is not null and not "unknown").Distinct(StringComparer.Ordinal).ToArray();
        var origin = origins.Length == 1 ? origins[0] : origins.Length > 1 ? "unknown" : first.Evidence.Discovery?.ApplicationOrigin;
        var originCodes = items.Where(item => item.Evidence.Discovery?.ApplicationOrigin == origin)
            .Select(item => item.Evidence.Discovery?.OriginEvidenceCode).Where(value => value is not null)
            .Distinct(StringComparer.Ordinal).ToArray();
        return first with { Evidence = first.Evidence with { Values = values, VerifiedFields = verified,
            Discovery = (first.Evidence.Discovery ?? new(role, "fallback", sources)) with { Role = role, SourceKinds = sources,
                ApplicationOrigin = origin, OriginEvidenceCode = originCodes.Length == 1 ? originCodes[0] : null } } };
    }

    /// <summary>Pure parser: a package is not a product; visible entrypoints stay separate.</summary>
    public static IReadOnlyList<DiscoveredApplication> ParsePackageManifest(string xml, string family, string fallbackName,
        IReadOnlyDictionary<string,string>? appListNames = null, string? parentProductKey = null)
    {
        var manifest = XDocument.Parse(xml);
        var result = new List<DiscoveredApplication>();
        var systemApplication = IsControlledSystemApplicationPackage(family);
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
                new Dictionary<string,string> { ["packageId"] = aumid, ["distributionKey"] = WindowsDistributionIdentity.MicrosoftStore(family),
                    ["productKey"] = parentProductKey ?? WindowsApplicationEvidence.Hash("package:" + family) }, ["packageId", "distributionKey", "productKey"],
                Discovery: new(role, !string.IsNullOrWhiteSpace(friendly) ? "appList" : literal ? "manifest" : "fallback", ["package"],
                    "variant", parentProductKey, role == "component" ? "helper" : "main", "user", "user-packages", role == "component" ? "review" : "strong",
                    systemApplication && role == "application" ? "operatingSystem" : null,
                    systemApplication && role == "application" ? "exactPackageRule" : null)),
                "installed", "user-packages", "user", parentProductKey, role == "component" ? "helper" : "main"));
        }
        return result;
    }
    private static ShortcutInfo? ShortcutDetails(string path)
    {
        var type = Type.GetTypeFromProgID("WScript.Shell");
        if (type is null) return null;
        object? shell = null, shortcut = null;
        try
        {
            shell = Activator.CreateInstance(type);
            if (shell is null) return null;
            shortcut = type.InvokeMember("CreateShortcut", System.Reflection.BindingFlags.InvokeMethod, null, shell, [path]);
            var target = shortcut?.GetType().InvokeMember("TargetPath", System.Reflection.BindingFlags.GetProperty, null, shortcut, null) as string;
            if (string.IsNullOrWhiteSpace(target)) return null;
            var arguments = shortcut?.GetType().InvokeMember("Arguments", System.Reflection.BindingFlags.GetProperty, null, shortcut, null) as string ?? string.Empty;
            return new(target, arguments);
        }
        finally
        {
            if (shortcut is not null && Marshal.IsComObject(shortcut)) _ = Marshal.FinalReleaseComObject(shortcut);
            if (shell is not null && Marshal.IsComObject(shell)) _ = Marshal.FinalReleaseComObject(shell);
        }
    }
    public const string PackageQueryEncodingCommand = "[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false); ";
    public static ProcessStartInfo CreatePackageQueryStartInfo()
    {
        var system = Environment.GetFolderPath(Environment.SpecialFolder.System);
        var start = new ProcessStartInfo(Path.Combine(system, @"WindowsPowerShell\v1.0\powershell.exe"))
            { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true,
              StandardOutputEncoding = new UTF8Encoding(false, true), StandardErrorEncoding = new UTF8Encoding(false, true) };
        foreach (var arg in new[] { "-NoProfile", "-NonInteractive", "-Command", PackageQueryEncodingCommand + "$ErrorActionPreference='Stop'; $packages=@(Get-AppxPackage | Where-Object { -not $_.IsFramework -and -not $_.IsResourcePackage } | Select-Object Name,PackageFamilyName,InstallLocation); $apps=@(Get-StartApps | Select-Object Name,AppID); ConvertTo-Json -InputObject @{packages=$packages;apps=$apps} -Compress" }) start.ArgumentList.Add(arg);
        return start;
    }
    private static async Task<PackageDiscovery> PackagesAsync(List<string> warnings, CancellationToken token)
    {
        using var process = new Process { StartInfo = CreatePackageQueryStartInfo() };
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
        var products = new List<DiscoveredApplication>();
        var variants = new List<DiscoveredApplication>();
        foreach (var package in document.RootElement.GetProperty("packages").EnumerateArray())
        {
            var family = package.GetProperty("PackageFamilyName").GetString();
            var location = package.GetProperty("InstallLocation").GetString();
            if (string.IsNullOrWhiteSpace(family) || string.IsNullOrWhiteSpace(location)) { warnings.Add("PACKAGE_METADATA_UNAVAILABLE"); continue; }
            var manifestPath = Path.Combine(location, "AppxManifest.xml");
            if (!File.Exists(manifestPath)) { warnings.Add("PACKAGE_MANIFEST_UNAVAILABLE"); continue; }
            try
            {
                var productKey = WindowsApplicationEvidence.Hash("package:" + family);
                var fallbackName = package.GetProperty("Name").GetString() ?? "Windows application";
                var parsed = ParsePackageManifest(File.ReadAllText(manifestPath), family, fallbackName, appListNames, productKey);
                var visible = parsed.Any(item => item.Evidence.Discovery?.Role == "application");
                var systemApplication = IsControlledSystemApplicationPackage(family);
                var productEvidence = new AppEvidence("windows", "windows:product:" + productKey,
                    parsed.FirstOrDefault(item => item.Evidence.Discovery?.Role == "application")?.Evidence.DisplayName ?? fallbackName,
                    new Dictionary<string,string> { ["packageId"] = family, ["distributionKey"] = WindowsDistributionIdentity.MicrosoftStore(family),
                    ["productKey"] = productKey, ["productName"] = fallbackName },
                    ["packageId", "distributionKey", "productKey"], Discovery: new(visible ? "application" : "component", "installation", ["package"],
                        "packageContainer", null, "unknown", "user", "user-packages", "strong",
                        systemApplication && visible ? "operatingSystem" : null,
                        systemApplication && visible ? "exactPackageRule" : null));
                products.Add(new(productEvidence, "installed", "user-packages", "user", null, "unknown", true));
                variants.AddRange(parsed);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Xml.XmlException)
            { warnings.Add("PACKAGE_MANIFEST_UNAVAILABLE"); }
        }
        return new(products, variants);
    }
}
