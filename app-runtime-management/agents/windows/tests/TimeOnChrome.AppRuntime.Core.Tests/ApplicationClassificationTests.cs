using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;
using Xunit;

namespace TimeOnChrome.AppRuntime.Core.Tests;
public sealed class ApplicationClassificationTests
{
    [Fact]
    public void ConfirmedDistributionTypeRuleYieldsToExplicitClassification()
    {
        var product = new AppProduct("aimlabs","Aimlabs","game",[new("windows",new("all",[new("distributionKey","steam:714010")]))]);
        var rule = new AppClassificationRule("games","Games","type",new("all",[]),[],"automatic","restrictedEntertainment","game",true,"fixture","confirmed type");
        var evidence = new AppEvidence("windows","opaque","Aimlabs",new Dictionary<string,string>{{"distributionKey","steam:714010"}},["distributionKey"]);
        var automatic = ApplicationClassifier.Resolve(new(2,1,[product],[rule],[new("child",[],["games"])]),"child",evidence);
        Assert.Equal("game",automatic.AppType); Assert.Equal("confirmed",automatic.TypeStatus);
        Assert.Equal("restrictedEntertainment",automatic.Classification);
        var explicitResult = ApplicationClassifier.Resolve(new(2,1,[product],[rule],[new("child",[new("aimlabs","composite")],["games"])]),"child",evidence);
        Assert.Equal("game",explicitResult.AppType); Assert.Equal("composite",explicitResult.Classification);
    }
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
