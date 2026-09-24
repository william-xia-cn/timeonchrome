namespace TimeOnChrome.AppRuntime.Core;

/// <summary>
/// A browser snapshot owns its credited seconds. This calculator only proves an integer-second
/// overlap with application time. Ambiguous fractional placement is not rounded into a claim.
/// </summary>
public static class BrowserOverlapCalculator
{
    public static BrowserOverlapResult Calculate(
        IReadOnlyList<BrowserCreditedInterval> browser,
        IReadOnlyList<ApplicationTimeInterval> applications)
    {
        ArgumentNullException.ThrowIfNull(browser);
        ArgumentNullException.ThrowIfNull(applications);
        var appUnion = Merge(applications);
        long adjustment = 0;
        foreach (var interval in browser)
        {
            if (interval.EndMs <= interval.StartMs || interval.CreditedSeconds < 0)
                return new BrowserOverlapResult(false, 0, "BROWSER_EVIDENCE_INVALID");
            if (interval.CreditedSeconds == 0) continue;
            var lengthMs = interval.EndMs - interval.StartMs;
            var overlappingMs = appUnion.Sum(app => Math.Max(0,
                Math.Min(interval.EndMs, app.EndMs) - Math.Max(interval.StartMs, app.StartMs)));
            if (overlappingMs == 0) continue;
            if (overlappingMs == lengthMs)
            {
                adjustment = checked(adjustment + interval.CreditedSeconds);
                continue;
            }
            var outsideMs = lengthMs - overlappingMs;
            var lower = Math.Max(0, interval.CreditedSeconds - CeilSeconds(outsideMs));
            var upper = Math.Min(interval.CreditedSeconds, CeilSeconds(overlappingMs));
            if (lower != upper)
                return new BrowserOverlapResult(false, 0, "FRACTIONAL_OVERLAP_AMBIGUOUS");
            adjustment = checked(adjustment + lower);
        }
        return new BrowserOverlapResult(true, adjustment, null);
    }

    private static long CeilSeconds(long milliseconds) => milliseconds / 1000 + (milliseconds % 1000 == 0 ? 0 : 1);

    private static IReadOnlyList<ApplicationTimeInterval> Merge(IReadOnlyList<ApplicationTimeInterval> input)
    {
        var merged = new List<ApplicationTimeInterval>();
        foreach (var current in input.Where(item => item.EndMs > item.StartMs).OrderBy(item => item.StartMs))
        {
            if (merged.Count == 0 || current.StartMs > merged[^1].EndMs)
            {
                merged.Add(current);
                continue;
            }
            var previous = merged[^1];
            merged[^1] = previous with { EndMs = Math.Max(previous.EndMs, current.EndMs) };
        }
        return merged;
    }
}

public sealed record BrowserCreditedInterval(long StartMs, long EndMs, long CreditedSeconds);
public sealed record ApplicationTimeInterval(long StartMs, long EndMs);
public sealed record BrowserOverlapResult(bool Available, long AdjustmentSeconds, string? UnavailableReasonCode);
