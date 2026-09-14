using System.Text.Json;
using System.Text.Json.Serialization;
using TimeOnChrome.AppRuntime.Core;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;

public sealed class GoldenVectorTests
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        Converters = { new JsonStringEnumConverter(JsonNamingPolicy.CamelCase) },
    };

    [Fact]
    public void SharedGoldenVectorsProduceExpectedDeterministicResults()
    {
        var vectorPath = Path.Combine(AppContext.BaseDirectory, "runtime-state-machine-v1.vectors.json");
        var vectors = JsonSerializer.Deserialize<VectorDocument>(File.ReadAllText(vectorPath), JsonOptions);

        Assert.NotNull(vectors);
        Assert.Equal(1, vectors.SchemaVersion);
        Assert.NotEmpty(vectors.Cases);

        foreach (var testCase in vectors.Cases)
        {
            var first = Replay(testCase);
            var second = Replay(testCase);

            Assert.Equal(testCase.ExpectedSegments, first.Segments);
            Assert.Equal(first.Segments, second.Segments);
            Assert.Equal(testCase.ExpectedError, first.Error);
            Assert.Equal(first.Error, second.Error);
            AssertState(testCase.ExpectedFinalState, first.State);
            Assert.Equal(first.State, second.State);
        }
    }

    private static ReplayResult Replay(VectorCase testCase)
    {
        var machine = new RuntimeStateMachine(testCase.RuntimeSessionID);
        var segments = new List<UsageSegment>();
        ExpectedError? error = null;

        foreach (var fact in testCase.Facts)
        {
            try
            {
                segments.AddRange(machine.Apply(fact));
            }
            catch (RuntimeTransitionException exception)
            {
                error = new ExpectedError(
                    exception.Code,
                    exception.Value,
                    exception.Previous,
                    exception.Received);
                break;
            }
        }

        return new ReplayResult(segments, error, machine.State);
    }

    private static void AssertState(ExpectedFinalState expected, RuntimeState actual)
    {
        Assert.Equal(expected.Application, actual.Application);
        Assert.Equal(expected.UserActivity, actual.UserActivity);
        Assert.Equal(expected.SessionState, actual.SessionState);
        Assert.Equal(expected.PowerState, actual.PowerState);
        Assert.Equal(expected.OpenSegment, actual.OpenSegment);
        Assert.Equal(expected.LastObservedAtMs, actual.LastObservedAtMs);
        Assert.Equal(expected.NextSegmentOrdinal, actual.NextSegmentOrdinal);
    }

    private sealed record VectorDocument(int SchemaVersion, IReadOnlyList<VectorCase> Cases);

    private sealed record VectorCase(
        string Name,
        string RuntimeSessionID,
        IReadOnlyList<RuntimeFact> Facts,
        IReadOnlyList<UsageSegment> ExpectedSegments,
        ExpectedError? ExpectedError,
        ExpectedFinalState ExpectedFinalState);

    private sealed record ExpectedError(
        string Code,
        long? Value = null,
        long? Previous = null,
        long? Received = null);

    private sealed record ExpectedFinalState(
        ApplicationIdentity? Application,
        UserActivityState UserActivity,
        UserSessionState SessionState,
        SystemPowerState PowerState,
        OpenUsageSegment? OpenSegment,
        long? LastObservedAtMs,
        ulong NextSegmentOrdinal);

    private sealed record ReplayResult(
        IReadOnlyList<UsageSegment> Segments,
        ExpectedError? Error,
        RuntimeState State);
}
