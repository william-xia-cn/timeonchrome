import Foundation
import XCTest
@testable import MacOSAppRuntimeCore

final class RuntimeStateMachineTests: XCTestCase {
    func testSharedGoldenVectorsAndDeterministicReplay() throws {
        let document = try loadGoldenDocument()
        XCTAssertEqual(document.schemaVersion, 1)
        XCTAssertFalse(document.cases.isEmpty)

        for vector in document.cases {
            let first = execute(vector)
            assert(first, matches: vector, label: vector.name)

            let replay = execute(vector)
            XCTAssertEqual(replay.segments, first.segments, "\(vector.name): replay segments")
            XCTAssertEqual(replay.state, first.state, "\(vector.name): replay state")
            XCTAssertEqual(replay.error, first.error, "\(vector.name): replay error")
        }
    }

    func testRuntimeFactUsesTaggedWireContract() throws {
        let application = ApplicationIdentity(
            platform: .macos,
            runtimeIdentity: "app:editor",
            displayName: "Editor"
        )
        let fact = RuntimeFact(
            observedAtMs: 42,
            kind: .applicationActivated(application)
        )

        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: JSONEncoder().encode(fact)) as? [String: Any]
        )
        XCTAssertEqual(object["kind"] as? String, "applicationActivated")
        XCTAssertEqual(object["observedAtMs"] as? Int, 42)
        XCTAssertNotNil(object["application"])
    }

    private func loadGoldenDocument() throws -> GoldenDocument {
        var root = URL(fileURLWithPath: #filePath)
        for _ in 0..<5 {
            root.deleteLastPathComponent()
        }
        let url = root
            .appendingPathComponent("contracts")
            .appendingPathComponent("runtime-state-machine-v1.vectors.json")
        return try JSONDecoder().decode(GoldenDocument.self, from: Data(contentsOf: url))
    }

    private func execute(_ vector: GoldenCase) -> ExecutionResult {
        var machine = RuntimeStateMachine(runtimeSessionID: vector.runtimeSessionID)
        var segments: [UsageSegment] = []
        var capturedError: CapturedError?

        for fact in vector.facts {
            do {
                segments.append(contentsOf: try machine.apply(fact))
            } catch let error as RuntimeTransitionError {
                capturedError = CapturedError(error)
                break
            } catch {
                capturedError = .unexpected(String(describing: error))
                break
            }
        }

        return ExecutionResult(
            segments: segments,
            state: machine.state,
            error: capturedError
        )
    }

    private func assert(
        _ result: ExecutionResult,
        matches vector: GoldenCase,
        label: String
    ) {
        XCTAssertEqual(result.segments, vector.expectedSegments, "\(label): segments")
        XCTAssertEqual(result.error, vector.expectedError.map(CapturedError.init), "\(label): error")
        XCTAssertEqual(result.state.application, vector.expectedFinalState.application, "\(label): application")
        XCTAssertEqual(result.state.userActivity, vector.expectedFinalState.userActivity, "\(label): user activity")
        XCTAssertEqual(result.state.sessionState, vector.expectedFinalState.sessionState, "\(label): session")
        XCTAssertEqual(result.state.powerState, vector.expectedFinalState.powerState, "\(label): power")
        XCTAssertEqual(result.state.openSegment, vector.expectedFinalState.openSegment, "\(label): open segment")
        XCTAssertEqual(result.state.lastObservedAtMs, vector.expectedFinalState.lastObservedAtMs, "\(label): last observed")
        XCTAssertEqual(result.state.nextSegmentOrdinal, vector.expectedFinalState.nextSegmentOrdinal, "\(label): ordinal")
    }
}

private struct GoldenDocument: Decodable {
    let schemaVersion: Int
    let cases: [GoldenCase]
}

private struct GoldenCase: Decodable {
    let name: String
    let runtimeSessionID: String
    let facts: [RuntimeFact]
    let expectedSegments: [UsageSegment]
    let expectedError: GoldenError?
    let expectedFinalState: ExpectedFinalState
}

private struct GoldenError: Decodable {
    let code: String
    let value: Int64?
    let previous: Int64?
    let received: Int64?
}

private struct ExpectedFinalState: Decodable {
    let application: ApplicationIdentity?
    let userActivity: UserActivityState
    let sessionState: UserSessionState
    let powerState: SystemPowerState
    let openSegment: RuntimeState.OpenSegment?
    let lastObservedAtMs: Int64?
    let nextSegmentOrdinal: UInt64
}

private struct ExecutionResult {
    let segments: [UsageSegment]
    let state: RuntimeState
    let error: CapturedError?
}

private enum CapturedError: Equatable {
    case negativeTimestamp(Int64)
    case nonMonotonicTimestamp(previous: Int64, received: Int64)
    case unexpected(String)

    init(_ error: RuntimeTransitionError) {
        switch error {
        case let .negativeTimestamp(value):
            self = .negativeTimestamp(value)
        case let .nonMonotonicTimestamp(previous, received):
            self = .nonMonotonicTimestamp(previous: previous, received: received)
        }
    }

    init(_ error: GoldenError) {
        switch error.code {
        case "negativeTimestamp":
            self = .negativeTimestamp(error.value ?? .min)
        case "nonMonotonicTimestamp":
            self = .nonMonotonicTimestamp(
                previous: error.previous ?? .min,
                received: error.received ?? .min
            )
        default:
            self = .unexpected("unknown golden error: \(error.code)")
        }
    }
}
