namespace TimeOnChrome.AppRuntime.Core;

public sealed record AppMatchCondition(string Field, string Value);
public sealed record AppMatchExpression(string Operator, IReadOnlyList<AppMatchCondition> Conditions);
public sealed record AppProductSelector(string Platform, AppMatchExpression Match);
public sealed record AppProduct(string Id, string Name, string Type, IReadOnlyList<AppProductSelector> Selectors);
public sealed record ApplicationDiscoverySummary(string Role, string NameSource, IReadOnlyList<string> SourceKinds,
    string? ObjectKind = null, string? ParentProductKey = null, string? VariantRole = null,
    string? Scope = null, string? SourceKind = null, string? EvidenceLevel = null);
public sealed record AppEvidence(string Platform, string RuntimeIdentity, string DisplayName,
    IReadOnlyDictionary<string, string> Values, IReadOnlyList<string> VerifiedFields, string? ProductId = null,
    ApplicationDiscoverySummary? Discovery = null);
public sealed record AppClassificationRule(string Id, string Name, string Kind, AppMatchExpression Match,
    IReadOnlyList<AppMatchExpression> Exclude, string Mode, string Classification, string Type,
    bool Enabled, string Source, string Reason, string? Platform = null, string? ProductId = null);
public sealed record ChildProductClassification(string ProductId, string Classification);
public sealed record ChildApplicationBinding(string ChildId,
    IReadOnlyList<ChildProductClassification> Products, IReadOnlyList<string> RuleIds);
public sealed record ApplicationKnowledge(int SchemaVersion, long Version,
    IReadOnlyList<AppProduct> Products, IReadOnlyList<AppClassificationRule> Rules,
    IReadOnlyList<ChildApplicationBinding> Bindings);
public sealed record AppClassificationResolution(string? ProductId, string Classification,
    string Status, IReadOnlyList<string> RuleIds, IReadOnlyList<string> Suggestions);

public static class ApplicationClassifier
{
    private static readonly HashSet<string> Strong = new(StringComparer.Ordinal)
        { "runtimeIdentity", "binaryHash", "packageId", "productKey", "hostedAppId", "signerKey" };
    public static bool SafeAutomatic(AppMatchExpression expression) =>
        expression.Conditions.Count > 0 && (expression.Operator == "all"
            ? expression.Conditions.Any(condition => Strong.Contains(condition.Field))
            : expression.Operator == "any" && expression.Conditions.All(condition => Strong.Contains(condition.Field)));

    public static bool Matches(AppMatchExpression expression, AppEvidence evidence, bool requireVerified = false)
    {
        bool Condition(AppMatchCondition condition)
        {
            var actual = condition.Field == "runtimeIdentity" ? evidence.RuntimeIdentity
                : evidence.Values.GetValueOrDefault(condition.Field);
            return string.Equals(actual, condition.Value, StringComparison.Ordinal)
                && (!requireVerified || !Strong.Contains(condition.Field)
                    || evidence.VerifiedFields.Contains(condition.Field, StringComparer.Ordinal));
        }
        return expression.Conditions.Count > 0 && (expression.Operator == "all"
            ? expression.Conditions.All(Condition)
            : expression.Operator == "any" && expression.Conditions.Any(Condition));
    }
    private static int Rank(string kind) => kind switch
    { "product" => 0, "family" or "developer" => 1, _ => 2 };

    public static AppClassificationResolution Resolve(ApplicationKnowledge knowledge, string childId,
        AppEvidence evidence, string previous = "unclassified")
    {
        var identified = knowledge.Products.Where(product => product.Selectors.Any(selector =>
            selector.Platform == evidence.Platform && SafeAutomatic(selector.Match)
                && Matches(selector.Match, evidence, true))).Select(product => product.Id)
            .Order(StringComparer.Ordinal).ToArray();
        var productId = identified.Length == 1 ? identified[0] : null;
        var binding = knowledge.Bindings.FirstOrDefault(item => item.ChildId == childId);
        var explicitEntry = binding?.Products.FirstOrDefault(item => item.ProductId == productId);
        if (identified.Length > 1) return new(null, previous, "conflict", [], []);
        if (explicitEntry is not null) return new(productId, explicitEntry.Classification, "explicit", [], []);
        var enabled = new HashSet<string>(binding?.RuleIds ?? [], StringComparer.Ordinal);
        var candidates = knowledge.Rules.Where(rule => rule.Enabled && enabled.Contains(rule.Id)
            && (rule.Platform is null || rule.Platform == evidence.Platform)
            && (rule.ProductId is null || rule.ProductId == productId)
            && (rule.ProductId is not null && rule.Match.Conditions.Count == 0
                || Matches(rule.Match, evidence, rule.Mode == "automatic"))
            && !rule.Exclude.Any(expression => Matches(expression, evidence))).ToArray();
        var suggestions = candidates.Where(rule => rule.Mode == "suggestion").Select(rule => rule.Id)
            .Order(StringComparer.Ordinal).ToArray();
        var automatic = candidates.Where(rule => rule.Mode == "automatic"
            && (rule.ProductId is not null ? productId is not null : SafeAutomatic(rule.Match)))
            .OrderBy(rule => Rank(rule.Kind)).ThenBy(rule => rule.Id, StringComparer.Ordinal).ToArray();
        var best = automatic.Where(rule => automatic.Length > 0 && Rank(rule.Kind) == Rank(automatic[0].Kind)).ToArray();
        if (best.Length > 0)
        {
            var conflict = best.Select(rule => rule.Classification).Distinct(StringComparer.Ordinal).Count() > 1;
            return new(productId, conflict ? previous : best[0].Classification,
                conflict ? "conflict" : "automatic", best.Select(rule => rule.Id).ToArray(), suggestions);
        }
        return new(productId, suggestions.Length > 0 ? previous : "unclassified", suggestions.Length > 0 ? "suggestion" : "unclassified", [], suggestions);
    }
}
