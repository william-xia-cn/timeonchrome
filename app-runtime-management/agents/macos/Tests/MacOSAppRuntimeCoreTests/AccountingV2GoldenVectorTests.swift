import Foundation
import XCTest
@testable import MacOSAppRuntimeCore

final class AccountingV2GoldenVectorTests: XCTestCase {
    func testSharedAccountingVectorsProduceDeterministicBoundariesIdsAndOrdering() throws {
        let document = try loadDocument()
        XCTAssertEqual(document.schemaVersion, 2)
        XCTAssertEqual(document.reorderWindowMilliseconds, AccountingV2Constants.reorderWindowMilliseconds)

        for vector in document.cases {
            let first = replay(vector)
            let second = replay(vector)
            XCTAssertEqual(first.usage.map(\.id), second.usage.map(\.id), vector.name)
            XCTAssertEqual(first.media.map(\.id), second.media.map(\.id), vector.name)
            XCTAssertEqual(first.state.foregroundLane?.application.runtimeIdentity, vector.expectedOpenForeground, vector.name)
            XCTAssertEqual(first.usage.count, vector.expectedUsage.count, vector.name)
            XCTAssertEqual(first.media.count, vector.expectedMedia.count, vector.name)

            for (actual, expected) in zip(first.usage, vector.expectedUsage) {
                XCTAssertEqual(actual.application?.runtimeIdentity, expected.applicationRuntimeIdentity, vector.name)
                XCTAssertEqual(actual.channel.rawValue, expected.channel, vector.name)
                XCTAssertEqual(actual.activityBasis.rawValue, expected.activityBasis, vector.name)
                XCTAssertEqual(actual.clockEpochId, expected.clockEpochId, vector.name)
                XCTAssertEqual(actual.startWallTimeMs, expected.startWallTimeMs, vector.name)
                XCTAssertEqual(actual.endWallTimeMs, expected.endWallTimeMs, vector.name)
                XCTAssertEqual(actual.startMonotonicTimeMs, expected.startMonotonicTimeMs, vector.name)
                XCTAssertEqual(actual.endMonotonicTimeMs, expected.endMonotonicTimeMs, vector.name)
                XCTAssertEqual(actual.monotonicDurationMilliseconds, expected.monotonicDurationMilliseconds, vector.name)
                XCTAssertEqual(actual.endReason.rawValue, expected.endReason, vector.name)
                XCTAssertEqual(actual.estimated.isEstimated, expected.estimated, vector.name)
                XCTAssertEqual(actual.diagnostic, expected.diagnostic, vector.name)
            }

            for (actual, expected) in zip(first.media, vector.expectedMedia) {
                XCTAssertEqual(actual.application.runtimeIdentity, expected.applicationRuntimeIdentity, vector.name)
                XCTAssertEqual(actual.mediaKind.rawValue, expected.mediaKind, vector.name)
                XCTAssertEqual(actual.presentation.rawValue, expected.presentation, vector.name)
                XCTAssertEqual(actual.clockEpochId, expected.clockEpochId, vector.name)
                XCTAssertEqual(actual.startWallTimeMs, expected.startWallTimeMs, vector.name)
                XCTAssertEqual(actual.endWallTimeMs, expected.endWallTimeMs, vector.name)
                XCTAssertEqual(actual.startMonotonicTimeMs, expected.startMonotonicTimeMs, vector.name)
                XCTAssertEqual(actual.endMonotonicTimeMs, expected.endMonotonicTimeMs, vector.name)
                XCTAssertEqual(actual.monotonicDurationMilliseconds, expected.monotonicDurationMilliseconds, vector.name)
                XCTAssertEqual(actual.endReason.rawValue, expected.endReason, vector.name)
                XCTAssertEqual(actual.estimated.isEstimated, expected.estimated, vector.name)
                XCTAssertFalse(actual.authoritativeForUsage, vector.name)
            }

            if let expected = vector.expectedFirstUsageId {
                XCTAssertEqual(first.usage.first?.id, expected, vector.name)
            }
            if let expected = vector.expectedFirstMediaId {
                XCTAssertEqual(first.media.first?.id, expected, vector.name)
            }
            if let expected = vector.expectedMainUnionMilliseconds {
                XCTAssertEqual(AccountingReadModel.unionDuration(first.usage), expected, vector.name)
            }
            if let expected = vector.expectedMediaPlaybackTotalMilliseconds {
                XCTAssertEqual(AccountingReadModel.mediaPlaybackTotal(first.media), expected, vector.name)
            }
        }
    }

    private func replay(_ vector: VectorCase) -> ReplayResult {
        var buffer = AccountingReorderBufferV2(
            stateMachine: AccountingStateMachineV2(
                runtimeSessionID: vector.runtimeSessionID,
                initialClockEpochId: vector.facts[0].clockEpochId
            )
        )
        var usage: [UsageSegmentV2] = []
        var media: [MediaSegmentV2] = []
        for fact in vector.facts {
            let transition = buffer.push(fact)
            usage.append(contentsOf: transition.usageSegments)
            media.append(contentsOf: transition.mediaSegments)
        }
        let final = buffer.flush()
        usage.append(contentsOf: final.usageSegments)
        media.append(contentsOf: final.mediaSegments)
        return ReplayResult(usage: usage, media: media, state: buffer.state)
    }

    private func loadDocument() throws -> VectorDocument {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 { root.deleteLastPathComponent() }
        let url = root
            .appendingPathComponent("contracts")
            .appendingPathComponent("runtime-accounting-v2.vectors.json")
        return try JSONDecoder().decode(VectorDocument.self, from: Data(contentsOf: url))
    }
}

private struct VectorDocument: Decodable {
    let schemaVersion: Int
    let reorderWindowMilliseconds: Int64
    let cases: [VectorCase]
}

private struct VectorCase: Decodable {
    let name: String
    let runtimeSessionID: String
    let facts: [AccountingRuntimeFact]
    let expectedUsage: [ExpectedUsage]
    let expectedMedia: [ExpectedMedia]
    let expectedOpenForeground: String?
    let expectedMainUnionMilliseconds: Int64?
    let expectedMediaPlaybackTotalMilliseconds: Int64?
    let expectedFirstUsageId: String?
    let expectedFirstMediaId: String?
}

private struct ExpectedUsage: Decodable {
    let applicationRuntimeIdentity: String?
    let channel: String
    let activityBasis: String
    let clockEpochId: String
    let startWallTimeMs: Int64
    let endWallTimeMs: Int64
    let startMonotonicTimeMs: Int64
    let endMonotonicTimeMs: Int64
    let monotonicDurationMilliseconds: Int64
    let endReason: String
    let estimated: Bool
    let diagnostic: Bool
}

private struct ExpectedMedia: Decodable {
    let applicationRuntimeIdentity: String
    let mediaKind: String
    let presentation: String
    let clockEpochId: String
    let startWallTimeMs: Int64
    let endWallTimeMs: Int64
    let startMonotonicTimeMs: Int64
    let endMonotonicTimeMs: Int64
    let monotonicDurationMilliseconds: Int64
    let endReason: String
    let estimated: Bool
}

private struct ReplayResult {
    let usage: [UsageSegmentV2]
    let media: [MediaSegmentV2]
    let state: AccountingRuntimeState
}
