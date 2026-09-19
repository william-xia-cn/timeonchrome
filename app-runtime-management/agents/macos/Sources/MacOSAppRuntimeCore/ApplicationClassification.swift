import Foundation

public struct AppMatchCondition: Codable { public let field: String; public let value: String }
public struct AppMatchExpression: Codable { public let `operator`: String; public let conditions: [AppMatchCondition] }
public struct AppProductSelector: Codable { public let platform: String; public let match: AppMatchExpression }
public struct AppProduct: Codable { public let id: String; public let name: String; public let type: String; public let selectors: [AppProductSelector] }
public struct ApplicationDiscoverySummary: Codable {
    public let role: String; public let nameSource: String; public let sourceKinds: [String]
    public init(role: String, nameSource: String, sourceKinds: [String]) {
        self.role = role; self.nameSource = nameSource; self.sourceKinds = sourceKinds
    }
}
public struct AppEvidence: Codable {
    public let platform: String
    public let runtimeIdentity: String
    public let displayName: String
    public let values: [String: String]
    public let verifiedFields: [String]
    public let productId: String?
    public let discovery: ApplicationDiscoverySummary?
    public init(platform: String, runtimeIdentity: String, displayName: String, values: [String: String],
                verifiedFields: [String], productId: String? = nil, discovery: ApplicationDiscoverySummary? = nil) {
        self.platform = platform; self.runtimeIdentity = runtimeIdentity; self.displayName = displayName
        self.values = values; self.verifiedFields = verifiedFields; self.productId = productId
        self.discovery = discovery
    }
}
public struct AppClassificationRule: Codable {
    public let id: String; public let name: String; public let kind: String
    public let platform: String?; public let productId: String?
    public let match: AppMatchExpression; public let exclude: [AppMatchExpression]
    public let mode: String; public let classification: String; public let type: String
    public let enabled: Bool; public let source: String; public let reason: String
}
public struct ChildProductClassification: Codable { public let productId: String; public let classification: String }
public struct ChildApplicationBinding: Codable {
    public let childId: String; public let products: [ChildProductClassification]; public let ruleIds: [String]
}
public struct ApplicationKnowledge: Codable {
    public let schemaVersion: Int; public let version: Int64
    public let products: [AppProduct]; public let rules: [AppClassificationRule]; public let bindings: [ChildApplicationBinding]
}
public struct AppClassificationResolution: Codable, Equatable {
    public let productId: String?; public let classification: String; public let status: String
    public let ruleIds: [String]; public let suggestions: [String]
}
public enum ApplicationClassifier {
    private static let strong: Set<String> = ["runtimeIdentity", "binaryHash", "packageId", "distributionKey", "signerKey"]
    public static func safeAutomatic(_ expression: AppMatchExpression) -> Bool {
        guard !expression.conditions.isEmpty else { return false }
        if expression.operator == "all" { return expression.conditions.contains { strong.contains($0.field) } }
        return expression.operator == "any" && expression.conditions.allSatisfy { strong.contains($0.field) }
    }
    public static func matches(_ expression: AppMatchExpression, _ evidence: AppEvidence, verified: Bool = false) -> Bool {
        func condition(_ item: AppMatchCondition) -> Bool {
            let actual = item.field == "runtimeIdentity" ? evidence.runtimeIdentity : evidence.values[item.field]
            return actual == item.value && (!verified || !strong.contains(item.field) || evidence.verifiedFields.contains(item.field))
        }
        guard !expression.conditions.isEmpty else { return false }
        if expression.operator == "all" { return expression.conditions.allSatisfy(condition) }
        return expression.operator == "any" && expression.conditions.contains(where: condition)
    }
    private static func rank(_ kind: String) -> Int {
        switch kind { case "product": return 0; case "family", "developer": return 1; default: return 2 }
    }
    public static func resolve(_ knowledge: ApplicationKnowledge, childId: String,
                               evidence: AppEvidence, previous: String = "unclassified") -> AppClassificationResolution {
        let identified = knowledge.products.filter { product in
            product.selectors.contains { $0.platform == evidence.platform && safeAutomatic($0.match) && matches($0.match, evidence, verified: true) }
        }.map(\.id).sorted()
        let productId = identified.count == 1 ? identified[0] : nil
        let binding = knowledge.bindings.first { $0.childId == childId }
        if identified.count > 1 { return .init(productId: nil, classification: previous, status: "conflict", ruleIds: [], suggestions: []) }
        if let explicit = binding?.products.first(where: { $0.productId == productId }) {
            return .init(productId: productId, classification: explicit.classification, status: "explicit", ruleIds: [], suggestions: [])
        }
        let enabled = Set(binding?.ruleIds ?? [])
        let candidates = knowledge.rules.filter { rule in
            rule.enabled && enabled.contains(rule.id) && (rule.platform == nil || rule.platform == evidence.platform)
                && (rule.productId == nil || rule.productId == productId)
                && ((rule.productId != nil && rule.match.conditions.isEmpty) || matches(rule.match, evidence, verified: rule.mode == "automatic"))
                && !rule.exclude.contains { matches($0, evidence) }
        }
        let suggestions = candidates.filter { $0.mode == "suggestion" }.map(\.id).sorted()
        let automatic = candidates.filter { $0.mode == "automatic" && ($0.productId != nil ? productId != nil : safeAutomatic($0.match)) }
            .sorted { rank($0.kind) == rank($1.kind) ? $0.id < $1.id : rank($0.kind) < rank($1.kind) }
        if let first = automatic.first {
            let best = automatic.filter { rank($0.kind) == rank(first.kind) }
            let conflict = Set(best.map(\.classification)).count > 1
            return .init(productId: productId, classification: conflict ? previous : first.classification,
                         status: conflict ? "conflict" : "automatic", ruleIds: best.map(\.id), suggestions: suggestions)
        }
        return .init(productId: productId, classification: suggestions.isEmpty ? "unclassified" : previous, status: suggestions.isEmpty ? "unclassified" : "suggestion",
                     ruleIds: [], suggestions: suggestions)
    }
}
