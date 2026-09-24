namespace TimeOnChrome.AppRuntime.Core;

public enum SharedQuotaShadowSource
{
    Application,
    Browser,
}

public sealed record SharedQuotaApplicationInterval(
    string SegmentId,
    long StartMs,
    long EndMs,
    string ApplicationId,
    string? QuotaBucket,
    bool IsBrowserContainer,
    string Channel = "active");

public sealed record SharedQuotaBrowserInterval(
    string SegmentId,
    long StartMs,
    long EndMs,
    string? QuotaBucket,
    string Channel = "active",
    bool Diagnostic = false);

public sealed record SharedQuotaShadowSlice(
    long StartMs,
    long EndMs,
    SharedQuotaShadowSource Source,
    string SegmentId,
    string QuotaBucket,
    string? ApplicationId);

public static class SharedQuotaShadowProjector
{
    public static IReadOnlyList<SharedQuotaShadowSlice> Project(
        IEnumerable<SharedQuotaApplicationInterval> applicationIntervals,
        IEnumerable<SharedQuotaBrowserInterval> browserIntervals)
    {
        var apps = applicationIntervals
            .Where(IsCounted)
            .OrderBy(item => item.StartMs)
            .ThenBy(item => item.SegmentId, StringComparer.Ordinal)
            .ToArray();
        var browser = browserIntervals
            .Where(IsCounted)
            .OrderBy(item => item.StartMs)
            .ThenBy(item => item.SegmentId, StringComparer.Ordinal)
            .ToArray();
        var boundaries = apps.SelectMany(item => new[] { item.StartMs, item.EndMs })
            .Concat(browser.SelectMany(item => new[] { item.StartMs, item.EndMs }))
            .Distinct()
            .Order()
            .ToArray();
        var result = new List<SharedQuotaShadowSlice>();

        for (var index = 0; index + 1 < boundaries.Length; index += 1)
        {
            var start = boundaries[index];
            var end = boundaries[index + 1];
            if (end <= start) continue;
            var activeApps = apps.Where(item => item.StartMs < end && item.EndMs > start).ToArray();
            var activeBrowser = browser.FirstOrDefault(item => item.StartMs < end && item.EndMs > start);
            var foregroundApp = activeApps.FirstOrDefault(item => !item.IsBrowserContainer);

            SharedQuotaShadowSlice? slice = null;
            if (foregroundApp is not null)
            {
                slice = new SharedQuotaShadowSlice(start, end, SharedQuotaShadowSource.Application,
                    foregroundApp.SegmentId, NormalizeBucket(foregroundApp.QuotaBucket), foregroundApp.ApplicationId);
            }
            else if (activeBrowser is not null)
            {
                slice = new SharedQuotaShadowSlice(start, end, SharedQuotaShadowSource.Browser,
                    activeBrowser.SegmentId, NormalizeBucket(activeBrowser.QuotaBucket), null);
            }
            else
            {
                var browserContainer = activeApps.FirstOrDefault(item => item.IsBrowserContainer);
                if (browserContainer is not null)
                {
                    slice = new SharedQuotaShadowSlice(start, end, SharedQuotaShadowSource.Application,
                        browserContainer.SegmentId, NormalizeBucket(browserContainer.QuotaBucket), browserContainer.ApplicationId);
                }
            }

            if (slice is not null) AddOrMerge(result, slice);
        }
        return result;
    }

    private static bool IsCounted(SharedQuotaApplicationInterval item) =>
        item.EndMs > item.StartMs && string.Equals(item.Channel, "active", StringComparison.OrdinalIgnoreCase);

    private static bool IsCounted(SharedQuotaBrowserInterval item) =>
        item.EndMs > item.StartMs && !item.Diagnostic
        && string.Equals(item.Channel, "active", StringComparison.OrdinalIgnoreCase);

    private static string NormalizeBucket(string? value) => value?.Trim().ToLowerInvariant() switch
    {
        "study" => "study",
        "rest" => "rest",
        "restricted" => "rest",
        "restrictedentertainment" => "rest",
        "composite" => "composite",
        "pending_composite" => "composite",
        "unclassified" => "composite",
        _ => "composite",
    };

    private static void AddOrMerge(List<SharedQuotaShadowSlice> result, SharedQuotaShadowSlice slice)
    {
        if (result.Count > 0)
        {
            var previous = result[^1];
            if (previous.EndMs == slice.StartMs && previous.Source == slice.Source
                && previous.SegmentId == slice.SegmentId && previous.QuotaBucket == slice.QuotaBucket
                && previous.ApplicationId == slice.ApplicationId)
            {
                result[^1] = previous with { EndMs = slice.EndMs };
                return;
            }
        }
        result.Add(slice);
    }
}
