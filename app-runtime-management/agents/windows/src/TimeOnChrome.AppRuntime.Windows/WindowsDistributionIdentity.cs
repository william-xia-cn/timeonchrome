using System.Text.Json;
using System.Text.RegularExpressions;

namespace TimeOnChrome.AppRuntime.Windows;

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
            ("gog", "gameID"), ("gog", "GOGGameId"),
            ("ea", "OfferId"), ("ea", "ContentId"), ("ea", "GameId"),
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
        var match = SteamAppId().Match(text);
        return match.Success ? Normalize("steam", match.Groups[1].Value) : null;
    }

    public static string? FromEpicManifest(string json)
    {
        using var document = JsonDocument.Parse(json);
        foreach (var name in new[] { "CatalogItemId", "AppName" })
            if (document.RootElement.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
                && !string.IsNullOrWhiteSpace(value.GetString())) return Normalize("epic", value.GetString()!);
        return null;
    }

    public static string? FromLauncherManifest(string platform, string text)
    {
        if (!Platforms.Contains(platform) || platform is "steam" or "epic" or "microsoft-store") return null;
        foreach (var key in platform switch {
            "ea" => new[] { "offerId", "contentId", "gameId" },
            "ubisoft" => new[] { "productId", "uplayId", "gameId" },
            _ => new[] { "gameId", "gameID", "productId" },
        })
        {
            var match = Regex.Match(text, $"(?:\"?{Regex.Escape(key)}\"?)\\s*[:=]\\s*\"?([A-Za-z0-9._-]+)", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
            if (match.Success) return Normalize(platform, match.Groups[1].Value);
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
    [GeneratedRegex("^[A-Za-z0-9._-]+$", RegexOptions.CultureInvariant)]
    private static partial Regex ProductId();
}
