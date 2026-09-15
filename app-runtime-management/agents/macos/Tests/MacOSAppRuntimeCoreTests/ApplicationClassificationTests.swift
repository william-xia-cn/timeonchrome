import Foundation
import XCTest
@testable import MacOSAppRuntimeCore

final class ApplicationClassificationTests: XCTestCase {
    private struct Document: Decodable { let schemaVersion: Int; let cases: [Vector] }
    private struct Vector: Decodable {
        let name: String; let knowledge: ApplicationKnowledge; let childId: String
        let evidence: AppEvidence; let expected: AppClassificationResolution; let previous: String?
    }
    func testSharedVectors() throws {
        let package = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
        let root = package.deletingLastPathComponent().deletingLastPathComponent()
        let url = root.appendingPathComponent("contracts/application-classification.vectors.json")
        let document = try JSONDecoder().decode(Document.self, from: Data(contentsOf: url))
        XCTAssertEqual(document.schemaVersion, 1)
        for vector in document.cases {
            XCTAssertEqual(ApplicationClassifier.resolve(vector.knowledge, childId: vector.childId,
                evidence: vector.evidence, previous: vector.previous ?? "unclassified"), vector.expected, vector.name)
        }
    }
}
