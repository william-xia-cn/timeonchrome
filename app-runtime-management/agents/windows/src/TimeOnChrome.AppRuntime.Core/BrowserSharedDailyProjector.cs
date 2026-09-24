namespace TimeOnChrome.AppRuntime.Core;

/// <summary>Only reconciles two already-settled local ledgers. Never classifies browser usage.</summary>
public static class BrowserSharedDailyProjector
{
    public static BrowserSharedDailyResult Project(
        long browserSeconds,
        bool browserComplete,
        IReadOnlyList<BrowserCreditedInterval> browserEvidence,
        IReadOnlyList<ApplicationCreditedInterval> applicationEvidence,
        bool sessionMappingComplete)
    {
        if (!browserComplete)
            return Unavailable(browserSeconds, "BROWSER_EVIDENCE_INCOMPLETE");
        if (!sessionMappingComplete)
            return Unavailable(browserSeconds, "SESSION_MAPPING_INCOMPLETE");
        if (browserEvidence.Sum(item => item.CreditedSeconds) != browserSeconds)
            return Unavailable(browserSeconds, "BROWSER_TOTAL_MISMATCH");
        if (applicationEvidence.Any(item => item.EndMs <= item.StartMs || item.MonotonicDurationMs < 0
                || item.EndMs - item.StartMs != item.MonotonicDurationMs))
            return Unavailable(browserSeconds, "APPLICATION_CLOCK_AMBIGUOUS");
        var applicationIntervals = applicationEvidence
            .Select(item => new ApplicationTimeInterval(item.StartMs, item.EndMs))
            .OrderBy(item => item.StartMs).ToArray();
        long applicationUnionMs = 0;
        long end = long.MinValue;
        foreach (var interval in applicationIntervals)
        {
            var start = Math.Max(interval.StartMs, end);
            if (interval.EndMs > start) applicationUnionMs = checked(applicationUnionMs + interval.EndMs - start);
            end = Math.Max(end, interval.EndMs);
        }
        if (applicationUnionMs % 1000 != 0)
            return Unavailable(browserSeconds, "APPLICATION_FRACTIONAL_SECOND");
        var overlap = BrowserOverlapCalculator.Calculate(browserEvidence, applicationIntervals);
        if (!overlap.Available)
            return Unavailable(browserSeconds, overlap.UnavailableReasonCode ?? "OVERLAP_AMBIGUOUS");
        var appSeconds = applicationUnionMs / 1000;
        if (overlap.AdjustmentSeconds > Math.Min(appSeconds, browserSeconds))
            return Unavailable(browserSeconds, "OVERLAP_EXCEEDS_USAGE");
        return new BrowserSharedDailyResult(true, null, browserSeconds, appSeconds,
            overlap.AdjustmentSeconds, checked(browserSeconds + appSeconds - overlap.AdjustmentSeconds));
    }

    private static BrowserSharedDailyResult Unavailable(long browserSeconds, string reason) =>
        new(false, reason, browserSeconds, 0, 0, null);
}

public sealed record ApplicationCreditedInterval(long StartMs, long EndMs, long MonotonicDurationMs);
public sealed record BrowserSharedDailyResult(bool Available, string? UnavailableReasonCode,
    long BrowserSeconds, long ApplicationSeconds, long OverlapAdjustmentSeconds, long? SharedSeconds);
