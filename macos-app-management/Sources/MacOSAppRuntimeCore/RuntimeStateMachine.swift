public enum RuntimeTransitionError: Error, Equatable, Sendable {
    case negativeTimestamp(Int64)
    case nonMonotonicTimestamp(previous: Int64, received: Int64)
}

public struct RuntimeStateMachine: Sendable {
    public private(set) var state: RuntimeState

    public init(runtimeSessionID: String) {
        self.state = RuntimeState(runtimeSessionID: runtimeSessionID)
    }

    public mutating func apply(_ fact: RuntimeFact) throws -> [UsageSegment] {
        guard fact.observedAtMs >= 0 else {
            throw RuntimeTransitionError.negativeTimestamp(fact.observedAtMs)
        }

        if let previous = state.lastObservedAtMs, fact.observedAtMs < previous {
            throw RuntimeTransitionError.nonMonotonicTimestamp(
                previous: previous,
                received: fact.observedAtMs
            )
        }

        var next = state
        let endReason = apply(fact.kind, to: &next)
        let isCheckpoint = isSnapshot(fact.kind)
        let applicationChanged = hasApplicationIdentityChanged(
            from: state.application,
            to: next.application
        )

        var completed: [UsageSegment] = []
        if let open = state.openSegment,
           isCheckpoint || applicationChanged || !next.isEligibleForUsage
        {
            if fact.observedAtMs > open.startAtMs {
                completed.append(
                    UsageSegment(
                        id: segmentID(
                            runtimeSessionID: state.runtimeSessionID,
                            ordinal: state.nextSegmentOrdinal
                        ),
                        runtimeSessionID: state.runtimeSessionID,
                        application: open.application,
                        startAtMs: open.startAtMs,
                        endAtMs: fact.observedAtMs,
                        durationMilliseconds: fact.observedAtMs - open.startAtMs,
                        endReason: endReason
                    )
                )
                next.nextSegmentOrdinal += 1
            }
            next.openSegment = nil
        }

        if next.openSegment == nil,
           next.isEligibleForUsage,
           let application = next.application
        {
            next.openSegment = RuntimeState.OpenSegment(
                application: application,
                startAtMs: fact.observedAtMs
            )
        }

        next.lastObservedAtMs = fact.observedAtMs
        state = next
        return completed
    }

    private func apply(_ kind: RuntimeFact.Kind, to state: inout RuntimeState) -> SegmentEndReason {
        switch kind {
        case let .applicationActivated(application):
            state.application = application
            return .applicationSwitch

        case let .userActivityChanged(activity):
            state.userActivity = activity
            return activity == .idle ? .userIdle : .stateCorrection

        case let .sessionChanged(session):
            state.sessionState = session
            return session == .active ? .stateCorrection : .sessionUnavailable

        case let .powerChanged(power):
            state.powerState = power
            return power == .asleep ? .systemSleep : .stateCorrection

        case let .snapshot(snapshot):
            state.application = snapshot.application
            state.userActivity = snapshot.userActivity
            state.sessionState = snapshot.sessionState
            state.powerState = snapshot.powerState
            return .periodicSnapshot
        }
    }

    private func isSnapshot(_ kind: RuntimeFact.Kind) -> Bool {
        if case .snapshot = kind {
            return true
        }
        return false
    }

    private func hasApplicationIdentityChanged(
        from previous: ApplicationIdentity?,
        to current: ApplicationIdentity?
    ) -> Bool {
        previous?.runtimeIdentity != current?.runtimeIdentity
    }

    private func segmentID(runtimeSessionID: String, ordinal: UInt64) -> String {
        "\(runtimeSessionID):\(ordinal)"
    }
}
