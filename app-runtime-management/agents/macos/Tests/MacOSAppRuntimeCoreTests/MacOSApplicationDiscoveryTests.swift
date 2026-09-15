import Foundation
import XCTest
@testable import MacOSAppRuntimeCore

#if os(macOS)
final class MacOSApplicationDiscoveryTests: XCTestCase {
    func testControlledBundleNeverReturnsPathOrCreatesUsage() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: root) }
        let bundle = root.appendingPathComponent("Fixture.app")
        let contents = bundle.appendingPathComponent("Contents")
        try FileManager.default.createDirectory(at: contents, withIntermediateDirectories: true)
        let plist: [String: Any] = ["CFBundleIdentifier": "test.fixture", "CFBundleName": "Fixture game", "CFBundlePackageType": "APPL"]
        try PropertyListSerialization.data(fromPropertyList: plist, format: .xml, options: 0).write(to: contents.appendingPathComponent("Info.plist"))
        let result = MacOSApplicationDiscovery.scan(roots: [root], verify: { _ in VerifiedBundleSignature(teamIdentifier: "FIXTURE") })
        XCTAssertEqual(result.applications.count, 1)
        XCTAssertEqual(result.applications[0].verifiedFields, ["packageId", "signerKey"])
        let output = String(decoding: try JSONEncoder().encode(result), as: UTF8.self)
        XCTAssertFalse(output.contains(root.path))
        XCTAssertFalse(output.contains("FIXTURE"))
        let unsigned = MacOSApplicationDiscovery.scan(roots: [root], verify: { _ in nil })
        XCTAssertTrue(unsigned.applications[0].verifiedFields.isEmpty)
    }
}
#endif
