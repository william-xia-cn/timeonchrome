using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;
public sealed class ApplicationClassificationTests
{
    [Fact]
    public void ReplaysSharedClassificationVectors()
    {
        var options = new JsonSerializerOptions { PropertyNameCaseInsensitive = true };
        var vectors = JsonSerializer.Deserialize<Vectors>(File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "application-classification.vectors.json")), options)!;
        foreach (var vector in vectors.Cases)
        {
            var result = ApplicationClassifier.Resolve(vector.Knowledge, vector.ChildId,
                vector.Evidence, vector.Previous ?? "unclassified");
            Assert.Equal(vector.Expected.ProductId, result.ProductId);
            Assert.Equal(vector.Expected.Classification, result.Classification);
            Assert.Equal(vector.Expected.Status, result.Status);
            Assert.Equal(vector.Expected.RuleIds, result.RuleIds);
            Assert.Equal(vector.Expected.Suggestions, result.Suggestions);
        }
    }
    private sealed record Vectors(int SchemaVersion, IReadOnlyList<Vector> Cases);
    private sealed record Vector(string Name, ApplicationKnowledge Knowledge, string ChildId,
        AppEvidence Evidence, AppClassificationResolution Expected, string? Previous = null);
}
