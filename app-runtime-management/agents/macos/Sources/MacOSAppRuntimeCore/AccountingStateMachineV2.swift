import Foundation

public struct AccountingStateMachineV2: Sendable {
    public private(set) var state: AccountingRuntimeState

    public init(runtimeSessionID: String, initialClockEpochId: String = "epoch-0") {
        state = AccountingRuntimeState(
            runtimeSessionID: runtimeSessionID,
            clockEpochId: initialClockEpochId
        )
    }

    public init(restoredState: AccountingRuntimeState) {
        state = restoredState
    }

    public mutating func applyOrdered(_ fact: AccountingRuntimeFact) -> AccountingTransition {
        if fact.wallTimeMs < 0 || fact.monotonicTimeMs < 0 {
            return diagnostic(fact, code: "negativeTimestamp")
        }
        if let previous = state.lastProcessedMonotonicTimeMs,
           fact.monotonicTimeMs < previous {
            return diagnostic(fact, code: "lateFact")
        }

        var usage: [UsageSegmentV2] = []
        var media: [MediaSegmentV2] = []
        if fact.kind != .clockAdjusted && fact.clockEpochId != state.clockEpochId {
            closeAll(
                fact,
                reason: .clockAdjustment,
                usage: &usage,
                media: &media,
                wallFromMonotonic: true
            )
            state.clockEpochId = fact.clockEpochId
        }

        switch fact.kind {
        case .foregroundChanged:
            applyForeground(fact, usage: &usage)
        case .userActivityChanged:
            applyActivity(fact, usage: &usage)
        case .sessionChanged:
            applySession(fact, usage: &usage, media: &media)
        case .powerChanged:
            applyPower(fact, usage: &usage, media: &media)
        case .pipChanged:
            applyPip(fact, usage: &usage)
        case .mediaChanged:
            applyMedia(fact, usage: &usage, media: &media)
        case .checkpoint:
            applyCheckpoint(fact, usage: &usage, media: &media)
        case .clockAdjusted:
            closeAll(
                fact,
                reason: .clockAdjustment,
                usage: &usage,
                media: &media,
                wallFromMonotonic: true
            )
            state.clockEpochId = fact.newClockEpochId ?? state.clockEpochId
            reconcileOpenLanes(fact)
        case .recovery:
            applyRecovery(fact, usage: &usage, media: &media)
        }

        state.lastProcessedWallTimeMs = fact.wallTimeMs
        state.lastProcessedMonotonicTimeMs = fact.monotonicTimeMs
        return AccountingTransition(state: state, usageSegments: usage, mediaSegments: media)
    }

    public mutating func applyLate(_ fact: AccountingRuntimeFact) -> AccountingTransition {
        diagnostic(fact, code: "lateFact")
    }

    private func diagnostic(_ fact: AccountingRuntimeFact, code: String) -> AccountingTransition {
        let segment = UsageSegmentV2.create(
            runtimeSessionID: state.runtimeSessionID,
            application: fact.application ?? state.foregroundApplication,
            channel: .diagnostic,
            activityBasis: .diagnostic,
            clockEpochId: state.clockEpochId,
            startWallTimeMs: max(0, fact.wallTimeMs),
            endWallTimeMs: max(0, fact.wallTimeMs),
            startMonotonicTimeMs: max(0, fact.monotonicTimeMs),
            endMonotonicTimeMs: max(0, fact.monotonicTimeMs),
            endReason: .diagnostic,
            estimated: .exact,
            lastEvidenceWallTimeMs: nil,
            lastEvidenceMonotonicTimeMs: nil,
            diagnostic: true,
            diagnosticCode: code,
            diagnosticMessage: "Fact was not allowed to rewrite immutable history."
        )
        return AccountingTransition(state: state, usageSegments: [segment], mediaSegments: [])
    }

    private mutating func applyForeground(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2]
    ) {
        let changed = !sameApplication(state.foregroundApplication, fact.application)
        let oldBasis = foregroundBasis()
        state.foregroundApplication = fact.application
        state.foregroundWindowState = fact.windowState
        state.foregroundMediaEvidence = fact.mediaEvidence
        state.foregroundPlaybackState = fact.playbackState
        let newBasis = foregroundBasis()
        if let lane = state.foregroundLane,
           changed || oldBasis != newBasis || newBasis == nil {
            usage.append(closeUsage(
                lane,
                fact: fact,
                reason: changed ? .applicationSwitch : .stateCorrection,
                estimated: .exact
            ))
            state.foregroundLane = nil
        }
        ensureForegroundOpen(fact)
    }

    private mutating func applyActivity(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2]
    ) {
        let oldBasis = foregroundBasis()
        state.userActivity = fact.userActivity ?? .unknown
        let newBasis = foregroundBasis()
        if let lane = state.foregroundLane, oldBasis != newBasis {
            usage.append(closeUsage(
                lane,
                fact: fact,
                reason: state.userActivity == .idle ? .userIdle : .stateCorrection,
                estimated: .exact
            ))
            state.foregroundLane = nil
        } else if state.userActivity == .idle,
                  state.foregroundApplication != nil,
                  state.foregroundLane == nil {
            usage.append(diagnosticSegment(
                fact,
                code: "noOpenLane",
                message: "Idle close had no foreground lane."
            ))
        }
        ensureForegroundOpen(fact)
    }

    private mutating func applySession(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2]
    ) {
        state.sessionState = fact.sessionState ?? .unknown
        if state.sessionState != .active {
            if !hasAnyOpenLane() {
                usage.append(diagnosticSegment(
                    fact,
                    code: "noOpenLane",
                    message: "Session close had no open lane."
                ))
            }
            closeAll(fact, reason: .sessionUnavailable, usage: &usage, media: &media)
        } else {
            reconcileOpenLanes(fact)
        }
    }

    private mutating func applyPower(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2]
    ) {
        state.powerState = fact.powerState ?? .unknown
        if state.powerState != .awake {
            if !hasAnyOpenLane() {
                usage.append(diagnosticSegment(
                    fact,
                    code: "noOpenLane",
                    message: "Power close had no open lane."
                ))
            }
            closeAll(fact, reason: .systemSleep, usage: &usage, media: &media)
        } else {
            reconcileOpenLanes(fact)
        }
    }

    private mutating func applyPip(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2]
    ) {
        guard let application = fact.application else { return }
        let key = applicationKey(application)
        if fact.pipState == .active {
            let observation = PipObservation(
                application: application,
                windowState: fact.windowState,
                mediaEvidence: fact.mediaEvidence,
                playbackState: fact.playbackState
            )
            state.pipObservations[key] = observation
            if let lane = state.pipLanes[key], !pipEligible(observation) {
                usage.append(closeUsage(
                    lane,
                    fact: fact,
                    reason: .pipEnded,
                    estimated: .exact
                ))
                state.pipLanes.removeValue(forKey: key)
            } else if state.pipLanes[key] == nil && pipEligible(observation) {
                state.pipLanes[key] = openUsage(
                    application,
                    channel: .pipActive,
                    basis: .pipStrongMedia,
                    fact: fact
                )
            }
        } else {
            state.pipObservations.removeValue(forKey: key)
            if let lane = state.pipLanes.removeValue(forKey: key) {
                usage.append(closeUsage(
                    lane,
                    fact: fact,
                    reason: .pipEnded,
                    estimated: .exact
                ))
            } else {
                usage.append(diagnosticSegment(
                    fact,
                    code: state.pipLanes.isEmpty ? "noOpenLane" : "targetConflict",
                    message: "PiP close did not match an open lane.",
                    application: application
                ))
            }
        }
    }

    private mutating func applyMedia(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2]
    ) {
        guard let application = fact.application,
              let kind = fact.mediaKind,
              let presentation = fact.mediaPresentation else { return }
        let key = mediaKey(application, kind: kind, presentation: presentation)
        let observation = MediaObservation(
            application: application,
            mediaKind: kind,
            presentation: presentation,
            mediaEvidence: fact.mediaEvidence,
            playbackState: fact.playbackState
        )
        if fact.playbackState == .playing && systemAvailable() {
            state.mediaObservations[key] = observation
            if let lane = state.mediaLanes[key] {
                state.mediaLanes[key] = OpenMediaLane(
                    application: lane.application,
                    mediaKind: lane.mediaKind,
                    presentation: lane.presentation,
                    clockEpochId: lane.clockEpochId,
                    startWallTimeMs: lane.startWallTimeMs,
                    startMonotonicTimeMs: lane.startMonotonicTimeMs,
                    lastEvidenceWallTimeMs: fact.wallTimeMs,
                    lastEvidenceMonotonicTimeMs: fact.monotonicTimeMs
                )
            } else {
                state.mediaLanes[key] = openMedia(observation, fact: fact)
            }
        } else {
            state.mediaObservations.removeValue(forKey: key)
            if let lane = state.mediaLanes.removeValue(forKey: key) {
                media.append(closeMedia(
                    lane,
                    fact: fact,
                    reason: .mediaStopped,
                    estimated: .exact
                ))
            } else {
                usage.append(diagnosticSegment(
                    fact,
                    code: state.mediaLanes.isEmpty ? "noOpenLane" : "targetConflict",
                    message: "Media close did not match an open lane.",
                    application: application
                ))
            }
        }
    }

    private mutating func applyCheckpoint(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2]
    ) {
        if fact.confirmation == .failed {
            closeUnconfirmed(fact, usage: &usage, media: &media)
            return
        }
        let hadForeground = state.foregroundLane != nil
        closeConfirmedCheckpoint(fact, usage: &usage, media: &media)
        if let snapshot = fact.snapshot {
            state.foregroundApplication = snapshot.foregroundApplication
            state.foregroundWindowState = snapshot.foregroundWindowState
            state.foregroundMediaEvidence = snapshot.foregroundMediaEvidence
            state.foregroundPlaybackState = snapshot.foregroundPlaybackState
            state.userActivity = snapshot.userActivity
            state.sessionState = snapshot.sessionState
            state.powerState = snapshot.powerState
        }
        if !hadForeground,
           foregroundBasis() != nil,
           let application = state.foregroundApplication {
            let elapsed = max(0, fact.monotonicTimeMs - (state.lastProcessedMonotonicTimeMs ?? fact.monotonicTimeMs))
            let duration = min(elapsed, AccountingV2Constants.estimatedGapCapMilliseconds)
            if duration > 0 {
                usage.append(UsageSegmentV2.create(
                    runtimeSessionID: state.runtimeSessionID,
                    application: application,
                    channel: .active,
                    activityBasis: .estimatedBackfill,
                    clockEpochId: state.clockEpochId,
                    startWallTimeMs: fact.wallTimeMs - duration,
                    endWallTimeMs: fact.wallTimeMs,
                    startMonotonicTimeMs: fact.monotonicTimeMs - duration,
                    endMonotonicTimeMs: fact.monotonicTimeMs,
                    endReason: .stateCorrection,
                    estimated: EstimatedMetadata(
                        isEstimated: true,
                        reason: "missingOpenLane",
                        cappedAtMilliseconds: AccountingV2Constants.estimatedGapCapMilliseconds
                    ),
                    lastEvidenceWallTimeMs: fact.wallTimeMs,
                    lastEvidenceMonotonicTimeMs: fact.monotonicTimeMs
                ))
            }
        }
        reconcileOpenLanes(fact)
    }

    private mutating func closeConfirmedCheckpoint(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2]
    ) {
        for lane in usageLanes() {
            let duration = min(
                max(0, fact.monotonicTimeMs - lane.startMonotonicTimeMs),
                AccountingV2Constants.checkpointIntervalMilliseconds
            )
            usage.append(closeUsageAtDuration(
                lane,
                duration: duration,
                reason: .periodicSnapshot,
                estimated: .exact
            ))
        }
        for lane in mediaLanes() {
            let duration = min(
                max(0, fact.monotonicTimeMs - lane.startMonotonicTimeMs),
                AccountingV2Constants.checkpointIntervalMilliseconds
            )
            media.append(closeMediaAtDuration(
                lane,
                duration: duration,
                reason: .periodicSnapshot,
                estimated: .exact
            ))
        }
        clearOpenLanes()
    }

    private mutating func applyRecovery(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2]
    ) {
        let estimate = EstimatedMetadata(
            isEstimated: true,
            reason: "serviceRecovery",
            cappedAtMilliseconds: AccountingV2Constants.estimatedGapCapMilliseconds
        )
        for lane in usageLanes() {
            let duration = min(
                max(0, fact.monotonicTimeMs - lane.startMonotonicTimeMs),
                AccountingV2Constants.estimatedGapCapMilliseconds
            )
            usage.append(closeUsageAtDuration(
                lane,
                duration: duration,
                reason: .serviceRecovery,
                estimated: estimate
            ))
        }
        for lane in mediaLanes() {
            let duration = min(
                max(0, fact.monotonicTimeMs - lane.startMonotonicTimeMs),
                AccountingV2Constants.estimatedGapCapMilliseconds
            )
            media.append(closeMediaAtDuration(
                lane,
                duration: duration,
                reason: .serviceRecovery,
                estimated: estimate
            ))
        }
        clearOpenLanes()
    }

    private mutating func closeUnconfirmed(
        _ fact: AccountingRuntimeFact,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2]
    ) {
        let usageEstimate = EstimatedMetadata(
            isEstimated: true,
            reason: "checkpointUnconfirmed",
            cappedAtMilliseconds: AccountingV2Constants.estimatedGapCapMilliseconds
        )
        for lane in usageLanes() {
            let duration = min(
                max(0, fact.monotonicTimeMs - lane.startMonotonicTimeMs),
                AccountingV2Constants.estimatedGapCapMilliseconds
            )
            usage.append(closeUsageAtDuration(
                lane,
                duration: duration,
                reason: .checkpointUnconfirmed,
                estimated: usageEstimate
            ))
        }
        let mediaEstimate = EstimatedMetadata(
            isEstimated: true,
            reason: "mediaConfirmationFailed",
            cappedAtMilliseconds: AccountingV2Constants.estimatedGapCapMilliseconds
        )
        for lane in mediaLanes() {
            let gap = max(0, fact.monotonicTimeMs - lane.lastEvidenceMonotonicTimeMs)
            let extensionDuration = min(gap / 2, AccountingV2Constants.estimatedGapCapMilliseconds)
            let duration = max(0, lane.lastEvidenceMonotonicTimeMs - lane.startMonotonicTimeMs) + extensionDuration
            media.append(closeMediaAtDuration(
                lane,
                duration: duration,
                reason: .checkpointUnconfirmed,
                estimated: mediaEstimate
            ))
        }
        clearOpenLanes()
    }

    private mutating func closeAll(
        _ fact: AccountingRuntimeFact,
        reason: SegmentEndReason,
        usage: inout [UsageSegmentV2],
        media: inout [MediaSegmentV2],
        wallFromMonotonic: Bool = false
    ) {
        for lane in usageLanes() {
            usage.append(closeUsage(
                lane,
                fact: fact,
                reason: reason,
                estimated: .exact,
                wallFromMonotonic: wallFromMonotonic
            ))
        }
        for key in state.mediaLanes.keys.sorted() {
            guard let lane = state.mediaLanes[key] else { continue }
            media.append(closeMedia(
                lane,
                fact: fact,
                reason: reason,
                estimated: .exact,
                wallFromMonotonic: wallFromMonotonic
            ))
        }
        clearOpenLanes()
    }

    private mutating func clearOpenLanes() {
        state.foregroundLane = nil
        state.pipLanes = [:]
        state.mediaLanes = [:]
    }

    private func usageLanes() -> [OpenAccountingLane] {
        var lanes: [OpenAccountingLane] = []
        if let foreground = state.foregroundLane { lanes.append(foreground) }
        lanes.append(contentsOf: state.pipLanes.keys.sorted().compactMap { state.pipLanes[$0] })
        return lanes
    }

    private func mediaLanes() -> [OpenMediaLane] {
        state.mediaLanes.keys.sorted().compactMap { state.mediaLanes[$0] }
    }

    private func hasAnyOpenLane() -> Bool {
        state.foregroundLane != nil || !state.pipLanes.isEmpty || !state.mediaLanes.isEmpty
    }

    private func diagnosticSegment(
        _ fact: AccountingRuntimeFact,
        code: String,
        message: String,
        application: ApplicationIdentity? = nil
    ) -> UsageSegmentV2 {
        UsageSegmentV2.create(
            runtimeSessionID: state.runtimeSessionID,
            application: application ?? fact.application ?? state.foregroundApplication,
            channel: .diagnostic,
            activityBasis: .diagnostic,
            clockEpochId: state.clockEpochId,
            startWallTimeMs: max(0, fact.wallTimeMs),
            endWallTimeMs: max(0, fact.wallTimeMs),
            startMonotonicTimeMs: max(0, fact.monotonicTimeMs),
            endMonotonicTimeMs: max(0, fact.monotonicTimeMs),
            endReason: .diagnostic,
            estimated: .exact,
            lastEvidenceWallTimeMs: nil,
            lastEvidenceMonotonicTimeMs: nil,
            diagnostic: true,
            diagnosticCode: code,
            diagnosticMessage: message
        )
    }

    private mutating func reconcileOpenLanes(_ fact: AccountingRuntimeFact) {
        ensureForegroundOpen(fact)
        for key in state.pipObservations.keys.sorted() {
            guard let observation = state.pipObservations[key],
                  pipEligible(observation),
                  state.pipLanes[key] == nil else { continue }
            state.pipLanes[key] = openUsage(
                observation.application,
                channel: .pipActive,
                basis: .pipStrongMedia,
                fact: fact
            )
        }
        for key in state.mediaObservations.keys.sorted() {
            guard let observation = state.mediaObservations[key],
                  systemAvailable(),
                  observation.playbackState == .playing,
                  state.mediaLanes[key] == nil else { continue }
            state.mediaLanes[key] = openMedia(observation, fact: fact)
        }
    }

    private mutating func ensureForegroundOpen(_ fact: AccountingRuntimeFact) {
        guard state.foregroundLane == nil,
              let application = state.foregroundApplication,
              let basis = foregroundBasis() else { return }
        state.foregroundLane = openUsage(application, channel: .active, basis: basis, fact: fact)
    }

    private func foregroundBasis() -> ActivityBasis? {
        guard systemAvailable(), state.foregroundApplication != nil else { return nil }
        if state.userActivity == .active { return .foregroundInteraction }
        if state.userActivity == .idle,
           state.foregroundMediaEvidence == .strong,
           state.foregroundPlaybackState == .playing,
           state.foregroundWindowState == .visible {
            return .foregroundStrongMedia
        }
        return nil
    }

    private func pipEligible(_ observation: PipObservation) -> Bool {
        systemAvailable()
            && observation.mediaEvidence == .strong
            && observation.playbackState == .playing
            && observation.windowState == .visible
    }

    private func systemAvailable() -> Bool {
        state.sessionState == .active && state.powerState == .awake
    }

    private func openUsage(
        _ application: ApplicationIdentity,
        channel: UsageChannel,
        basis: ActivityBasis,
        fact: AccountingRuntimeFact
    ) -> OpenAccountingLane {
        OpenAccountingLane(
            application: application,
            channel: channel,
            activityBasis: basis,
            clockEpochId: state.clockEpochId,
            startWallTimeMs: fact.wallTimeMs,
            startMonotonicTimeMs: fact.monotonicTimeMs,
            lastEvidenceWallTimeMs: fact.wallTimeMs,
            lastEvidenceMonotonicTimeMs: fact.monotonicTimeMs
        )
    }

    private func openMedia(
        _ observation: MediaObservation,
        fact: AccountingRuntimeFact
    ) -> OpenMediaLane {
        OpenMediaLane(
            application: observation.application,
            mediaKind: observation.mediaKind,
            presentation: observation.presentation,
            clockEpochId: state.clockEpochId,
            startWallTimeMs: fact.wallTimeMs,
            startMonotonicTimeMs: fact.monotonicTimeMs,
            lastEvidenceWallTimeMs: fact.wallTimeMs,
            lastEvidenceMonotonicTimeMs: fact.monotonicTimeMs
        )
    }

    private func closeUsage(
        _ lane: OpenAccountingLane,
        fact: AccountingRuntimeFact,
        reason: SegmentEndReason,
        estimated: EstimatedMetadata,
        wallFromMonotonic: Bool = false
    ) -> UsageSegmentV2 {
        let endMono = max(lane.startMonotonicTimeMs, fact.monotonicTimeMs)
        let endWall = wallFromMonotonic
            ? lane.startWallTimeMs + endMono - lane.startMonotonicTimeMs
            : max(lane.startWallTimeMs, fact.wallTimeMs)
        return UsageSegmentV2.create(
            runtimeSessionID: state.runtimeSessionID,
            application: lane.application,
            channel: lane.channel,
            activityBasis: lane.activityBasis,
            clockEpochId: lane.clockEpochId,
            startWallTimeMs: lane.startWallTimeMs,
            endWallTimeMs: endWall,
            startMonotonicTimeMs: lane.startMonotonicTimeMs,
            endMonotonicTimeMs: endMono,
            endReason: reason,
            estimated: estimated,
            lastEvidenceWallTimeMs: lane.lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs: lane.lastEvidenceMonotonicTimeMs
        )
    }

    private func closeUsageAtDuration(
        _ lane: OpenAccountingLane,
        duration: Int64,
        reason: SegmentEndReason,
        estimated: EstimatedMetadata
    ) -> UsageSegmentV2 {
        UsageSegmentV2.create(
            runtimeSessionID: state.runtimeSessionID,
            application: lane.application,
            channel: lane.channel,
            activityBasis: lane.activityBasis,
            clockEpochId: lane.clockEpochId,
            startWallTimeMs: lane.startWallTimeMs,
            endWallTimeMs: lane.startWallTimeMs + duration,
            startMonotonicTimeMs: lane.startMonotonicTimeMs,
            endMonotonicTimeMs: lane.startMonotonicTimeMs + duration,
            endReason: reason,
            estimated: estimated,
            lastEvidenceWallTimeMs: lane.lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs: lane.lastEvidenceMonotonicTimeMs
        )
    }

    private func closeMedia(
        _ lane: OpenMediaLane,
        fact: AccountingRuntimeFact,
        reason: SegmentEndReason,
        estimated: EstimatedMetadata,
        wallFromMonotonic: Bool = false
    ) -> MediaSegmentV2 {
        let endMono = max(lane.startMonotonicTimeMs, fact.monotonicTimeMs)
        let endWall = wallFromMonotonic
            ? lane.startWallTimeMs + endMono - lane.startMonotonicTimeMs
            : max(lane.startWallTimeMs, fact.wallTimeMs)
        return MediaSegmentV2.create(
            runtimeSessionID: state.runtimeSessionID,
            application: lane.application,
            mediaKind: lane.mediaKind,
            presentation: lane.presentation,
            clockEpochId: lane.clockEpochId,
            startWallTimeMs: lane.startWallTimeMs,
            endWallTimeMs: endWall,
            startMonotonicTimeMs: lane.startMonotonicTimeMs,
            endMonotonicTimeMs: endMono,
            endReason: reason,
            estimated: estimated,
            lastEvidenceWallTimeMs: lane.lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs: lane.lastEvidenceMonotonicTimeMs
        )
    }

    private func closeMediaAtDuration(
        _ lane: OpenMediaLane,
        duration: Int64,
        reason: SegmentEndReason,
        estimated: EstimatedMetadata
    ) -> MediaSegmentV2 {
        MediaSegmentV2.create(
            runtimeSessionID: state.runtimeSessionID,
            application: lane.application,
            mediaKind: lane.mediaKind,
            presentation: lane.presentation,
            clockEpochId: lane.clockEpochId,
            startWallTimeMs: lane.startWallTimeMs,
            endWallTimeMs: lane.startWallTimeMs + duration,
            startMonotonicTimeMs: lane.startMonotonicTimeMs,
            endMonotonicTimeMs: lane.startMonotonicTimeMs + duration,
            endReason: reason,
            estimated: estimated,
            lastEvidenceWallTimeMs: lane.lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs: lane.lastEvidenceMonotonicTimeMs
        )
    }

    private func sameApplication(_ left: ApplicationIdentity?, _ right: ApplicationIdentity?) -> Bool {
        left?.platform == right?.platform && left?.runtimeIdentity == right?.runtimeIdentity
    }

    private func applicationKey(_ application: ApplicationIdentity) -> String {
        "\(application.platform.rawValue):\(application.runtimeIdentity)"
    }

    private func mediaKey(
        _ application: ApplicationIdentity,
        kind: MediaKind,
        presentation: MediaPresentation
    ) -> String {
        "\(applicationKey(application)):\(kind.rawValue):\(presentation.rawValue)"
    }
}

public struct AccountingReorderBufferV2: Sendable {
    private var machine: AccountingStateMachineV2
    private var pending: [(sequence: Int64, fact: AccountingRuntimeFact)] = []
    private var sequence: Int64 = 0
    private var maximumSeen: Int64 = -1
    private var lastEmitted: Int64 = -1

    public init(stateMachine: AccountingStateMachineV2) {
        machine = stateMachine
    }

    public var state: AccountingRuntimeState { machine.state }

    public mutating func push(_ fact: AccountingRuntimeFact) -> AccountingTransition {
        if fact.monotonicTimeMs < lastEmitted {
            return machine.applyLate(fact)
        }
        maximumSeen = max(maximumSeen, fact.monotonicTimeMs)
        pending.append((sequence, fact))
        sequence += 1
        return drain(watermark: maximumSeen - AccountingV2Constants.reorderWindowMilliseconds)
    }

    public mutating func flush() -> AccountingTransition {
        drain(watermark: .max)
    }

    private mutating func drain(watermark: Int64) -> AccountingTransition {
        let ready = pending
            .filter { $0.fact.monotonicTimeMs <= watermark }
            .sorted {
                if $0.fact.monotonicTimeMs != $1.fact.monotonicTimeMs {
                    return $0.fact.monotonicTimeMs < $1.fact.monotonicTimeMs
                }
                if $0.fact.safetyPriority != $1.fact.safetyPriority {
                    return $0.fact.safetyPriority < $1.fact.safetyPriority
                }
                return $0.sequence < $1.sequence
            }
        let readySequences = Set(ready.map(\.sequence))
        pending.removeAll { readySequences.contains($0.sequence) }
        var usage: [UsageSegmentV2] = []
        var media: [MediaSegmentV2] = []
        for item in ready {
            let result: AccountingTransition
            if item.fact.monotonicTimeMs < lastEmitted {
                result = machine.applyLate(item.fact)
            } else {
                result = machine.applyOrdered(item.fact)
            }
            usage.append(contentsOf: result.usageSegments)
            media.append(contentsOf: result.mediaSegments)
            lastEmitted = max(lastEmitted, item.fact.monotonicTimeMs)
        }
        return AccountingTransition(state: machine.state, usageSegments: usage, mediaSegments: media)
    }
}

public enum AccountingReadModel {
    public static func unionDuration(_ segments: [UsageSegmentV2]) -> Int64 {
        let intervals = segments
            .filter { $0.authoritativeForUsage && $0.monotonicDurationMilliseconds > 0 }
            .map { ($0.startMonotonicTimeMs, $0.endMonotonicTimeMs) }
            .sorted { $0.0 == $1.0 ? $0.1 < $1.1 : $0.0 < $1.0 }
        guard let first = intervals.first else { return 0 }
        var total: Int64 = 0
        var currentStart = first.0
        var currentEnd = first.1
        for interval in intervals.dropFirst() {
            if interval.0 <= currentEnd {
                currentEnd = max(currentEnd, interval.1)
            } else {
                total += currentEnd - currentStart
                currentStart = interval.0
                currentEnd = interval.1
            }
        }
        return total + currentEnd - currentStart
    }

    public static func mediaPlaybackTotal(_ segments: [MediaSegmentV2]) -> Int64 {
        segments.reduce(0) { $0 + $1.monotonicDurationMilliseconds }
    }
}
