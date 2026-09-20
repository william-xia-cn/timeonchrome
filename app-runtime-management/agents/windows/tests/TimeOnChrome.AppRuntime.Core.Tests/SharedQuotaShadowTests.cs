using TimeOnChrome.AppRuntime.Core;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class SharedQuotaShadowTests
{
    [Fact]
    public void BrowserPageCoversChromeContainerButForegroundApplicationWins()
    {
        var applications = new[]
        {
            new SharedQuotaApplicationInterval("chrome", 0, 100, "chrome", "composite", true),
            new SharedQuotaApplicationInterval("notepad", 60, 90, "notepad", "study", false),
        };
        var browser = new[]
        {
            new SharedQuotaBrowserInterval("web", 10, 80, "pending_composite"),
        };

        var slices = SharedQuotaShadowProjector.Project(applications, browser);

        Assert.Collection(slices,
            item => AssertSlice(item, 0, 10, SharedQuotaShadowSource.Application, "chrome", "composite"),
            item => AssertSlice(item, 10, 60, SharedQuotaShadowSource.Browser, "web", "composite"),
            item => AssertSlice(item, 60, 90, SharedQuotaShadowSource.Application, "notepad", "study"),
            item => AssertSlice(item, 90, 100, SharedQuotaShadowSource.Application, "chrome", "composite"));
    }

    [Fact]
    public void AuxiliaryMediaAndDiagnosticsDoNotEnterSharedQuota()
    {
        var browser = new[]
        {
            new SharedQuotaBrowserInterval("pip", 0, 100, "rest", "pip"),
            new SharedQuotaBrowserInterval("media", 0, 100, "rest", "backgroundMedia"),
            new SharedQuotaBrowserInterval("diagnostic", 20, 20, "study", "diagnostic", true),
        };

        Assert.Empty(SharedQuotaShadowProjector.Project([], browser));
    }

    [Fact]
    public void UnknownBucketsMapToCompositeWithoutChangingSourceLedger()
    {
        var slices = SharedQuotaShadowProjector.Project(
            [new SharedQuotaApplicationInterval("app", 0, 10, "app", "unclassified", false)], []);

        var slice = Assert.Single(slices);
        Assert.Equal("composite", slice.QuotaBucket);
        Assert.Equal("app", slice.SegmentId);
    }

    private static void AssertSlice(
        SharedQuotaShadowSlice actual,
        long start,
        long end,
        SharedQuotaShadowSource source,
        string segmentId,
        string bucket)
    {
        Assert.Equal(start, actual.StartMs);
        Assert.Equal(end, actual.EndMs);
        Assert.Equal(source, actual.Source);
        Assert.Equal(segmentId, actual.SegmentId);
        Assert.Equal(bucket, actual.QuotaBucket);
    }
}
