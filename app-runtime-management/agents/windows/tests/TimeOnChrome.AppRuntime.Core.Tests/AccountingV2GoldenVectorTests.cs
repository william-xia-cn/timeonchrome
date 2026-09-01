using System.Text.Json;
using System.Text.Json.Serialization;
using TimeOnChrome.AppRuntime.Core;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class AccountingV2GoldenVectorTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    [Fact]
    public void SharedAccountingVectorsProduceDeterministicBoundariesIdsAndOrdering()
    {
        var vectorPath = Path.Combine(AppContext.BaseDirectory, "runtime-accounting-v2.vectors.json");
        var vectors = JsonSerializer.Deserialize<VectorDocument>(File.ReadAllText(vectorPath), JsonOptions);

        Assert.NotNull(vectors);
        Assert.Equal(2, vectors.SchemaVersion);
        Assert.Equal(AccountingV2Constants.ReorderWindowMilliseconds, vectors.ReorderWindowMilliseconds);
        Assert.NotEmpty(vectors.Cases);

        foreach (var testCase in vectors.Cases)
        {
            var first = Replay(testCase);
            var second = Replay(testCase);

            AssertUsage(testCase.Name, testCase.ExpectedUsage, first.Usage);
            AssertMedia(testCase.Name, testCase.ExpectedMedia, first.Media);
            Assert.Equal(first.Usage.Select(item => item.Id), second.Usage.Select(item => item.Id));
            Assert.Equal(first.Media.Select(item => item.Id), second.Media.Select(item => item.Id));
            Assert.Equal(testCase.ExpectedOpenForeground, first.State.ForegroundLane?.Application.RuntimeIdentity);
            Assert.Equal(first.State.ForegroundLane, second.State.ForegroundLane);
            Assert.Equal(first.State.PipLanes.OrderBy(item => item.Key), second.State.PipLanes.OrderBy(item => item.Key));
            Assert.Equal(first.State.MediaLanes.OrderBy(item => item.Key), second.State.MediaLanes.OrderBy(item => item.Key));
            Assert.Equal(first.State.LastProcessedMonotonicTimeMs, second.State.LastProcessedMonotonicTimeMs);

            if (testCase.ExpectedFirstUsageId is not null)
            {
                Assert.True(
                    string.Equals(testCase.ExpectedFirstUsageId, first.Usage[0].Id, StringComparison.Ordinal),
                    $"{testCase.Name} expected usage id {testCase.ExpectedFirstUsageId}, actual {first.Usage[0].Id}; canonical "
                    + AccountingSegmentId.CanonicalUsage(
                        first.Usage[0].RuntimeSessionID,
                        first.Usage[0].Application,
                        first.Usage[0].Channel,
                        first.Usage[0].ActivityBasis,
                        first.Usage[0].ClockEpochId,
                        first.Usage[0].StartWallTimeMs,
                        first.Usage[0].EndWallTimeMs,
                        first.Usage[0].StartMonotonicTimeMs,
                        first.Usage[0].EndMonotonicTimeMs,
                        first.Usage[0].MonotonicDurationMilliseconds,
                        first.Usage[0].EndReason,
                        first.Usage[0].Estimated,
                        first.Usage[0].Diagnostic,
                        first.Usage[0].DiagnosticCode).Replace('\n', '|'));
            }

            if (testCase.ExpectedFirstMediaId is not null)
            {
                Assert.True(
                    string.Equals(testCase.ExpectedFirstMediaId, first.Media[0].Id, StringComparison.Ordinal),
                    $"{testCase.Name} expected media id {testCase.ExpectedFirstMediaId}, actual {first.Media[0].Id}.");
            }

            if (testCase.ExpectedMainUnionMilliseconds is long union)
            {
                Assert.Equal(union, AccountingReadModel.UnionDuration(first.Usage));
            }

            if (testCase.ExpectedMediaPlaybackTotalMilliseconds is long mediaTotal)
            {
                Assert.Equal(mediaTotal, AccountingReadModel.MediaPlaybackTotal(first.Media));
            }
        }
    }

    [Fact]
    public void SegmentIdExcludesDisplayNameDiagnosticMessageAndPolicyLabels()
    {
        var appA = new ApplicationIdentity(RuntimePlatform.Windows, "opaque:app", "Name A");
        var appB = appA with { DisplayName = "Name B" };
        var first = UsageSegmentV2.Create(
            "session",
            appA,
            UsageChannel.Active,
            ActivityBasis.ForegroundInteraction,
            "epoch",
            100,
            200,
            100,
            200,
            SegmentEndReason.PeriodicSnapshot,
            EstimatedMetadata.Exact,
            200,
            200,
            diagnosticMessage: "first wording",
            policySnapshot: new AccountingPolicySnapshot(1, "study"));
        var second = UsageSegmentV2.Create(
            "session",
            appB,
            UsageChannel.Active,
            ActivityBasis.ForegroundInteraction,
            "epoch",
            100,
            200,
            100,
            200,
            SegmentEndReason.PeriodicSnapshot,
            EstimatedMetadata.Exact,
            199,
            199,
            diagnosticMessage: "different wording",
            policySnapshot: new AccountingPolicySnapshot(99, "rest"));

        Assert.Equal(first.Id, second.Id);
        Assert.Matches("^[0-9a-f]{64}$", first.Id);
    }

    [Fact]
    public void CanonicalUsageIdMatchesPublishedGoldenValue()
    {
        var canonical = AccountingSegmentId.CanonicalUsage(
            "v2-switch",
            new ApplicationIdentity(RuntimePlatform.Windows, "app:editor", "Editor"),
            UsageChannel.Active,
            ActivityBasis.ForegroundInteraction,
            "epoch-a",
            100,
            1100,
            100,
            1100,
            1000,
            SegmentEndReason.ApplicationSwitch,
            EstimatedMetadata.Exact,
            false,
            null);

        Assert.Equal(
            "bf7f5123431aea44a4fba50679dddda6efad93719d02fadfd9938dcc070c5fe3",
            AccountingSegmentId.Sha256(canonical));
    }

    [Fact]
    public void DiagnosticAndAuxiliaryMediaNeverEnterMainUnion()
    {
        var app = new ApplicationIdentity(RuntimePlatform.Windows, "opaque:app", "App");
        var diagnostic = UsageSegmentV2.Create(
            "session",
            app,
            UsageChannel.Diagnostic,
            ActivityBasis.Diagnostic,
            "epoch",
            100,
            100,
            100,
            100,
            SegmentEndReason.Diagnostic,
            EstimatedMetadata.Exact,
            null,
            null,
            diagnostic: true,
            diagnosticCode: "lateFact");
        var media = MediaSegmentV2.Create(
            "session",
            app,
            MediaKind.Video,
            MediaPresentation.Background,
            "epoch",
            0,
            1000,
            0,
            1000,
            SegmentEndReason.MediaStopped,
            EstimatedMetadata.Exact,
            1000,
            1000);

        Assert.Equal(0, AccountingReadModel.UnionDuration(new[] { diagnostic }));
        Assert.Equal(1000, AccountingReadModel.MediaPlaybackTotal(new[] { media }));
        Assert.False(media.AuthoritativeForUsage);
    }

    [Fact]
    public void LegacyFactProjectionUsesMonotonicClockAndSplitsWallClockEpoch()
    {
        var projector = new AccountingFactProjectorV2("epoch-0");
        var activity = new RuntimeFact
        {
            ObservedAtMs = 1000,
            Kind = RuntimeFactKind.UserActivityChanged,
            UserActivity = UserActivityState.Active,
        };

        var first = projector.Project(activity, 1000, 1000);
        var jumped = projector.Project(activity, 100000, 2000);

        Assert.Single(first);
        Assert.Equal(2, jumped.Count);
        Assert.Equal(AccountingFactKind.ClockAdjusted, jumped[0].Kind);
        Assert.Equal("epoch-0", jumped[0].ClockEpochId);
        Assert.Equal("epoch-1", jumped[0].NewClockEpochId);
        Assert.Equal("epoch-1", jumped[1].ClockEpochId);
        Assert.Equal(2000, jumped[1].MonotonicTimeMs);
        Assert.Equal(100000, jumped[1].WallTimeMs);
    }

    private static ReplayResult Replay(VectorCase testCase)
    {
        var buffer = new AccountingReorderBufferV2(
            new AccountingStateMachineV2(testCase.RuntimeSessionID, testCase.Facts[0].ClockEpochId));
        var usage = new List<UsageSegmentV2>();
        var media = new List<MediaSegmentV2>();
        foreach (var fact in testCase.Facts)
        {
            var transition = buffer.Push(fact);
            usage.AddRange(transition.UsageSegments);
            media.AddRange(transition.MediaSegments);
        }

        var final = buffer.Flush();
        usage.AddRange(final.UsageSegments);
        media.AddRange(final.MediaSegments);
        return new ReplayResult(usage, media, buffer.State);
    }

    private static void AssertUsage(string caseName, IReadOnlyList<ExpectedUsage> expected, IReadOnlyList<UsageSegmentV2> actual)
    {
        Assert.Equal(expected.Count, actual.Count);
        for (var index = 0; index < expected.Count; index++)
        {
            var left = expected[index];
            var right = actual[index];
            Assert.Equal(left.ApplicationRuntimeIdentity, right.Application?.RuntimeIdentity);
            Assert.True(
                string.Equals(left.Channel, AccountingSegmentId.Wire(right.Channel), StringComparison.Ordinal),
                $"{caseName} usage[{index}] channel expected {left.Channel}, actual {AccountingSegmentId.Wire(right.Channel)} ({right.Id}).");
            Assert.Equal(left.ActivityBasis, AccountingSegmentId.Wire(right.ActivityBasis));
            Assert.Equal(left.ClockEpochId, right.ClockEpochId);
            Assert.Equal(left.StartWallTimeMs, right.StartWallTimeMs);
            Assert.Equal(left.EndWallTimeMs, right.EndWallTimeMs);
            Assert.Equal(left.StartMonotonicTimeMs, right.StartMonotonicTimeMs);
            Assert.Equal(left.EndMonotonicTimeMs, right.EndMonotonicTimeMs);
            Assert.Equal(left.MonotonicDurationMilliseconds, right.MonotonicDurationMilliseconds);
            Assert.Equal(left.EndReason, AccountingSegmentId.Wire(right.EndReason));
            Assert.Equal(left.Estimated, right.Estimated.IsEstimated);
            Assert.Equal(left.Diagnostic, right.Diagnostic);
            Assert.Matches("^[0-9a-f]{64}$", right.Id);
        }
    }

    private static void AssertMedia(string caseName, IReadOnlyList<ExpectedMedia> expected, IReadOnlyList<MediaSegmentV2> actual)
    {
        Assert.Equal(expected.Count, actual.Count);
        for (var index = 0; index < expected.Count; index++)
        {
            var left = expected[index];
            var right = actual[index];
            Assert.Equal(left.ApplicationRuntimeIdentity, right.Application.RuntimeIdentity);
            Assert.True(
                string.Equals(left.MediaKind, AccountingSegmentId.Wire(right.MediaKind), StringComparison.Ordinal),
                $"{caseName} media[{index}] kind expected {left.MediaKind}, actual {AccountingSegmentId.Wire(right.MediaKind)}.");
            Assert.Equal(left.Presentation, AccountingSegmentId.Wire(right.Presentation));
            Assert.Equal(left.ClockEpochId, right.ClockEpochId);
            Assert.Equal(left.StartWallTimeMs, right.StartWallTimeMs);
            Assert.Equal(left.EndWallTimeMs, right.EndWallTimeMs);
            Assert.Equal(left.StartMonotonicTimeMs, right.StartMonotonicTimeMs);
            Assert.Equal(left.EndMonotonicTimeMs, right.EndMonotonicTimeMs);
            Assert.Equal(left.MonotonicDurationMilliseconds, right.MonotonicDurationMilliseconds);
            Assert.Equal(left.EndReason, AccountingSegmentId.Wire(right.EndReason));
            Assert.Equal(left.Estimated, right.Estimated.IsEstimated);
            Assert.False(right.AuthoritativeForUsage);
            Assert.Matches("^[0-9a-f]{64}$", right.Id);
        }
    }

    private sealed record VectorDocument(
        int SchemaVersion,
        long ReorderWindowMilliseconds,
        IReadOnlyList<VectorCase> Cases);

    private sealed record VectorCase(
        string Name,
        string RuntimeSessionID,
        IReadOnlyList<AccountingRuntimeFact> Facts,
        IReadOnlyList<ExpectedUsage> ExpectedUsage,
        IReadOnlyList<ExpectedMedia> ExpectedMedia,
        string? ExpectedOpenForeground,
        long? ExpectedMainUnionMilliseconds = null,
        long? ExpectedMediaPlaybackTotalMilliseconds = null,
        string? ExpectedFirstUsageId = null,
        string? ExpectedFirstMediaId = null);

    private sealed record ExpectedUsage(
        string? ApplicationRuntimeIdentity,
        string Channel,
        string ActivityBasis,
        string ClockEpochId,
        long StartWallTimeMs,
        long EndWallTimeMs,
        long StartMonotonicTimeMs,
        long EndMonotonicTimeMs,
        long MonotonicDurationMilliseconds,
        string EndReason,
        bool Estimated,
        bool Diagnostic);

    private sealed record ExpectedMedia(
        string ApplicationRuntimeIdentity,
        string MediaKind,
        string Presentation,
        string ClockEpochId,
        long StartWallTimeMs,
        long EndWallTimeMs,
        long StartMonotonicTimeMs,
        long EndMonotonicTimeMs,
        long MonotonicDurationMilliseconds,
        string EndReason,
        bool Estimated);

    private sealed record ReplayResult(
        IReadOnlyList<UsageSegmentV2> Usage,
        IReadOnlyList<MediaSegmentV2> Media,
        AccountingRuntimeState State);
}
