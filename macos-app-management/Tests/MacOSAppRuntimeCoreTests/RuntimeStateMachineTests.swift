import XCTest
@testable import MacOSAppRuntimeCore

final class RuntimeStateMachineTests: XCTestCase {
    private let editor = ApplicationIdentity(
        runtimeIdentity: "bundle:com.example.Editor",
        bundleIdentifier: "com.example.Editor",
        displayName: "Editor"
    )

    private let browser = ApplicationIdentity(
        runtimeIdentity: "bundle:com.example.Browser",
        bundleIdentifier: "com.example.Browser",
        displayName: "Browser"
    )

    func testApplicationSwitchClosesOldSegmentAndOpensNewOne() throws {
        var machine = RuntimeStateMachine(runtimeSessionID: "session-a")
        try makeEligible(&machine, application: editor, at: 100)

        let completed = try machine.apply(
            RuntimeFact(observedAtMs: 600, kind: .applicationActivated(browser))
        )

        XCTAssertEqual(completed.count, 1)
        XCTAssertEqual(completed[0].id, "session-a:0")
        XCTAssertEqual(completed[0].application, editor)
        XCTAssertEqual(completed[0].startAtMs, 100)
        XCTAssertEqual(completed[0].endAtMs, 600)
        XCTAssertEqual(completed[0].durationMilliseconds, 500)
        XCTAssertEqual(completed[0].endReason, .applicationSwitch)
        XCTAssertEqual(machine.state.openSegment?.application, browser)
        XCTAssertEqual(machine.state.openSegment?.startAtMs, 600)
    }

    func testIdleClosesAndResumeStartsWithoutBackfill() throws {
        var machine = RuntimeStateMachine(runtimeSessionID: "session-idle")
        try makeEligible(&machine, application: editor, at: 100)

        let idleSegments = try machine.apply(
            RuntimeFact(observedAtMs: 1_000, kind: .userActivityChanged(.idle))
        )
        XCTAssertEqual(idleSegments.map(\.durationMilliseconds), [900])
        XCTAssertEqual(idleSegments.first?.endReason, .userIdle)
        XCTAssertNil(machine.state.openSegment)

        XCTAssertEqual(
            try machine.apply(
                RuntimeFact(observedAtMs: 2_000, kind: .userActivityChanged(.active))
            ),
            []
        )
        XCTAssertEqual(machine.state.openSegment?.startAtMs, 2_000)

        let checkpoint = try machine.apply(
            RuntimeFact(
                observedAtMs: 2_500,
                kind: .snapshot(
                    RuntimeSnapshot(
                        application: editor,
                        userActivity: .active,
                        sessionState: .active,
                        powerState: .awake
                    )
                )
            )
        )
        XCTAssertEqual(checkpoint.map(\.durationMilliseconds), [500])
        XCTAssertEqual(checkpoint.first?.endReason, .periodicSnapshot)
    }

    func testSessionLockAndSystemSleepCreateSeparateBoundaries() throws {
        var machine = RuntimeStateMachine(runtimeSessionID: "session-boundaries")
        try makeEligible(&machine, application: editor, at: 10)

        let locked = try machine.apply(
            RuntimeFact(observedAtMs: 110, kind: .sessionChanged(.locked))
        )
        XCTAssertEqual(locked.first?.endReason, .sessionUnavailable)
        XCTAssertNil(machine.state.openSegment)

        _ = try machine.apply(
            RuntimeFact(observedAtMs: 200, kind: .sessionChanged(.active))
        )
        XCTAssertEqual(machine.state.openSegment?.startAtMs, 200)

        let slept = try machine.apply(
            RuntimeFact(observedAtMs: 350, kind: .powerChanged(.asleep))
        )
        XCTAssertEqual(slept.first?.durationMilliseconds, 150)
        XCTAssertEqual(slept.first?.endReason, .systemSleep)
        XCTAssertNil(machine.state.openSegment)

        _ = try machine.apply(
            RuntimeFact(observedAtMs: 900, kind: .powerChanged(.awake))
        )
        XCTAssertEqual(machine.state.openSegment?.startAtMs, 900)
    }

    func testSnapshotAlwaysSlicesAnEligibleSegment() throws {
        var machine = RuntimeStateMachine(runtimeSessionID: "session-snapshot")
        try makeEligible(&machine, application: editor, at: 1_000)

        let snapshot = RuntimeSnapshot(
            application: editor,
            userActivity: .active,
            sessionState: .active,
            powerState: .awake
        )
        let first = try machine.apply(
            RuntimeFact(observedAtMs: 1_250, kind: .snapshot(snapshot))
        )
        let second = try machine.apply(
            RuntimeFact(observedAtMs: 1_500, kind: .snapshot(snapshot))
        )

        XCTAssertEqual(first.map(\.id), ["session-snapshot:0"])
        XCTAssertEqual(second.map(\.id), ["session-snapshot:1"])
        XCTAssertEqual(first.map(\.durationMilliseconds), [250])
        XCTAssertEqual(second.map(\.durationMilliseconds), [250])
        XCTAssertEqual(machine.state.openSegment?.startAtMs, 1_500)
    }

    func testZeroLengthBoundaryDoesNotEmitOrConsumeOrdinal() throws {
        var machine = RuntimeStateMachine(runtimeSessionID: "session-zero")
        try makeEligible(&machine, application: editor, at: 100)

        XCTAssertEqual(
            try machine.apply(
                RuntimeFact(observedAtMs: 100, kind: .applicationActivated(browser))
            ),
            []
        )

        let completed = try machine.apply(
            RuntimeFact(observedAtMs: 101, kind: .userActivityChanged(.idle))
        )
        XCTAssertEqual(completed.map(\.id), ["session-zero:0"])
        XCTAssertEqual(completed.map(\.durationMilliseconds), [1])
        XCTAssertEqual(completed.first?.application, browser)
    }

    func testOutOfOrderFactIsRejectedWithoutChangingState() throws {
        var machine = RuntimeStateMachine(runtimeSessionID: "session-order")
        try makeEligible(&machine, application: editor, at: 100)
        let before = machine.state

        XCTAssertThrowsError(
            try machine.apply(
                RuntimeFact(observedAtMs: 99, kind: .userActivityChanged(.idle))
            )
        ) { error in
            XCTAssertEqual(
                error as? RuntimeTransitionError,
                .nonMonotonicTimestamp(previous: 100, received: 99)
            )
        }
        XCTAssertEqual(machine.state, before)
    }

    func testSameFactsProduceIdenticalSegmentsAndState() throws {
        let facts: [RuntimeFact] = [
            RuntimeFact(observedAtMs: 0, kind: .powerChanged(.awake)),
            RuntimeFact(observedAtMs: 0, kind: .sessionChanged(.active)),
            RuntimeFact(observedAtMs: 0, kind: .userActivityChanged(.active)),
            RuntimeFact(observedAtMs: 10, kind: .applicationActivated(editor)),
            RuntimeFact(observedAtMs: 110, kind: .applicationActivated(browser)),
            RuntimeFact(observedAtMs: 210, kind: .userActivityChanged(.idle)),
        ]

        let first = try run(facts, sessionID: "session-deterministic")
        let second = try run(facts, sessionID: "session-deterministic")

        XCTAssertEqual(first.segments, second.segments)
        XCTAssertEqual(first.state, second.state)
    }

    private func makeEligible(
        _ machine: inout RuntimeStateMachine,
        application: ApplicationIdentity,
        at timestamp: Int64
    ) throws {
        _ = try machine.apply(
            RuntimeFact(observedAtMs: timestamp, kind: .powerChanged(.awake))
        )
        _ = try machine.apply(
            RuntimeFact(observedAtMs: timestamp, kind: .sessionChanged(.active))
        )
        _ = try machine.apply(
            RuntimeFact(observedAtMs: timestamp, kind: .userActivityChanged(.active))
        )
        _ = try machine.apply(
            RuntimeFact(observedAtMs: timestamp, kind: .applicationActivated(application))
        )
    }

    private func run(
        _ facts: [RuntimeFact],
        sessionID: String
    ) throws -> (segments: [UsageSegment], state: RuntimeState) {
        var machine = RuntimeStateMachine(runtimeSessionID: sessionID)
        var segments: [UsageSegment] = []
        for fact in facts {
            segments.append(contentsOf: try machine.apply(fact))
        }
        return (segments, machine.state)
    }
}
