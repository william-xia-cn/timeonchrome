using System.Text.Json;
using System.Text.RegularExpressions;
using System.Xml.Linq;

namespace TimeOnChrome.AppRuntime.Windows;

public sealed record DistributionManifestIdentity(string DistributionKey, string DisplayName, string? InstallLocation);

/// <summary>
/// Extracts public, stable product identifiers from trusted local launcher records.
/// The raw manifest, local path, account and launch arguments never leave this adapter.
/// </summary>
public static partial class WindowsDistributionIdentity
{
    private static readonly HashSet<string> Platforms = new(StringComparer.Ordinal)
        { "steam", "microsoft-store", "ea", "epic", "ubisoft", "gog" };

    public static string MicrosoftStore(string packageFamily) => Normalize("microsoft-store", packageFamily);

    public static string? FromRegistry(string keyName, IReadOnlyDictionary<string, string?> values)
    {
        var steam = SteamKey().Match(keyName);
        if (steam.Success) return Normalize("steam", steam.Groups[1].Value);
        foreach (var candidate in new[] {
            ("gog", "GOGGameId"),
            ("ea", "OfferId"), ("ea", "ContentId"),
            ("epic", "CatalogItemId"), ("epic", "AppName"),
            ("ubisoft", "ProductId"), ("ubisoft", "UplayId") })
        {
            if (values.TryGetValue(candidate.Item2, out var value) && !string.IsNullOrWhiteSpace(value))
                return Normalize(candidate.Item1, value);
        }
        return null;
    }

    public static string? FromSteamManifest(string text)
    {
        return ParseSteamManifest(text, null)?.DistributionKey;
    }

    public static DistributionManifestIdentity? ParseSteamManifest(string text, string? libraryRoot)
    {
        var appId = SteamAppId().Match(text);
        if (!appId.Success) return null;
        var name = SteamName().Match(text);
        var installDir = SteamInstallDir().Match(text);
        var displayName = name.Success ? name.Groups[1].Value.Trim() : $"Steam {appId.Groups[1].Value}";
        var location = !string.IsNullOrWhiteSpace(libraryRoot) && installDir.Success
            ? Path.Combine(libraryRoot, "steamapps", "common", installDir.Groups[1].Value) : null;
        return new(Normalize("steam", appId.Groups[1].Value), displayName, location);
    }

    public static string? FromEpicManifest(string json)
    {
        return ParseEpicManifest(json)?.DistributionKey;
    }

    public static DistributionManifestIdentity? ParseEpicManifest(string json)
    {
        using var document = JsonDocument.Parse(json);
        foreach (var name in new[] { "CatalogItemId", "AppName" })
            if (document.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(value.GetString()))
            {
                var displayName = document.RootElement.TryGetProperty("DisplayName", out var display)
                    && display.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(display.GetString())
                    ? display.GetString()! : value.GetString()!;
                var location = document.RootElement.TryGetProperty("InstallLocation", out var install)
                    && install.ValueKind == JsonValueKind.String ? install.GetString() : null;
                return new(Normalize("epic", value.GetString()!), displayName, location);
            }
        return null;
    }

    public static string? FromLauncherManifest(string platform, string text)
    {
        return ParseLauncherManifest(platform, text)?.DistributionKey;
    }

    public static DistributionManifestIdentity? ParseLauncherManifest(string platform, string text, string? installLocation = null)
    {
        if (!IsIndependentLauncher(platform) || string.IsNullOrWhiteSpace(text)) return null;
        var idKeys = IdentifierKeys(platform);
        var nameKeys = new[] { "displayName", "gameName", "title", "name" };
        var locationKeys = new[] { "installLocation", "installDir", "installPath", "path" };
        string? id = null, displayName = null, localLocation = installLocation;
        try
        {
            using var document = JsonDocument.Parse(text);
            id = FindJsonString(document.RootElement, idKeys);
            displayName = FindJsonString(document.RootElement, nameKeys);
            localLocation ??= FindJsonString(document.RootElement, locationKeys);
        }
        catch (JsonException) { }
        if (id is null)
        {
            try
            {
                var document = XDocument.Parse(text);
                id = FindXmlValue(document, idKeys);
                displayName ??= FindXmlValue(document, nameKeys);
                localLocation ??= FindXmlValue(document, locationKeys);
            }
            catch (System.Xml.XmlException) { }
        }
        id ??= FindKeyValue(text, idKeys);
        if (id is null) return null;
        displayName ??= FindKeyValue(text, nameKeys);
        var safeName = SafeDisplayName(displayName) ?? $"{platform.ToUpperInvariant()} {id}";
        return new(Normalize(platform, id), safeName, localLocation);
    }

    public static DistributionManifestIdentity? ParseLauncherRegistry(string platform, string keyName,
        IReadOnlyDictionary<string, string?> values, bool allowKeyNameFallback = true)
    {
        if (!IsIndependentLauncher(platform)) return null;
        var id = IdentifierKeys(platform).Select(key => values.GetValueOrDefault(key))
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        if (string.IsNullOrWhiteSpace(id) && allowKeyNameFallback && ProductId().IsMatch(keyName)) id = keyName;
        if (string.IsNullOrWhiteSpace(id)) return null;
        var name = new[] { "DisplayName", "GameName", "Title", "Name" }
            .Select(key => values.GetValueOrDefault(key)).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        var location = new[] { "InstallLocation", "InstallDir", "InstallPath", "Path" }
            .Select(key => values.GetValueOrDefault(key)).FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));
        return new(Normalize(platform, id), SafeDisplayName(name) ?? $"{platform.ToUpperInvariant()} {id}", location);
    }

    private static bool IsIndependentLauncher(string platform) => platform is "ea" or "ubisoft" or "gog";
    private static string[] IdentifierKeys(string platform) => platform switch {
        "ea" => ["offerId", "contentId", "gameId", "productId"],
        "ubisoft" => ["productId", "uplayId", "gameId"],
        _ => ["gameId", "gameID", "gogGameId", "productId"],
    };
    private static string? SafeDisplayName(string? value)
    {
        var result = value?.Trim();
        return string.IsNullOrWhiteSpace(result) || result.Length > 256 || result.Any(char.IsControl) ? null : result;
    }
    private static string? FindKeyValue(string text, IEnumerable<string> keys)
    {
        foreach (var key in keys)
        {
            var match = Regex.Match(text, $"(?:\"?{Regex.Escape(key)}\"?)\\s*[:=]\\s*\"?([A-Za-z0-9._-]+)",
                RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (match.Success) return match.Groups[1].Value;
        }
        return null;
    }
    private static string? FindJsonString(JsonElement element, IEnumerable<string> keys)
    {
        var wanted = keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var property in EnumerateJsonProperties(element))
            if (wanted.Contains(property.Name) && property.Value.ValueKind is JsonValueKind.String or JsonValueKind.Number)
                return property.Value.ToString();
        return null;
    }
    private static IEnumerable<JsonProperty> EnumerateJsonProperties(JsonElement element, int depth = 0)
    {
        if (depth > 8) yield break;
        if (element.ValueKind == JsonValueKind.Object)
            foreach (var property in element.EnumerateObject())
            {
                yield return property;
                foreach (var nested in EnumerateJsonProperties(property.Value, depth + 1)) yield return nested;
            }
        else if (element.ValueKind == JsonValueKind.Array)
            foreach (var item in element.EnumerateArray())
                foreach (var nested in EnumerateJsonProperties(item, depth + 1)) yield return nested;
    }
    private static string? FindXmlValue(XDocument document, IEnumerable<string> keys)
    {
        var wanted = keys.ToHashSet(StringComparer.OrdinalIgnoreCase);
        foreach (var element in document.Descendants())
        {
            if (wanted.Contains(element.Name.LocalName) && !string.IsNullOrWhiteSpace(element.Value)) return element.Value.Trim();
            var attribute = element.Attributes().FirstOrDefault(item => wanted.Contains(item.Name.LocalName));
            if (attribute is not null && !string.IsNullOrWhiteSpace(attribute.Value)) return attribute.Value.Trim();
        }
        return null;
    }

    private static string Normalize(string platform, string productId)
    {
        if (!Platforms.Contains(platform)) throw new ArgumentOutOfRangeException(nameof(platform));
        var value = productId.Trim();
        if (value.Length is < 1 or > 128 || !ProductId().IsMatch(value)) throw new InvalidDataException("INVALID_DISTRIBUTION_PRODUCT_ID");
        return $"{platform}:{value.ToLowerInvariant()}";
    }

    [GeneratedRegex("^Steam App ([0-9]+)$", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SteamKey();
    [GeneratedRegex("\\\"appid\\\"\\s+\\\"([0-9]+)\\\"", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SteamAppId();
    [GeneratedRegex("\\\"name\\\"\\s+\\\"([^\\\"]+)\\\"", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SteamName();
    [GeneratedRegex("\\\"installdir\\\"\\s+\\\"([^\\\"]+)\\\"", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant)]
    private static partial Regex SteamInstallDir();
    [GeneratedRegex("^[A-Za-z0-9._-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex ProductId();
}
