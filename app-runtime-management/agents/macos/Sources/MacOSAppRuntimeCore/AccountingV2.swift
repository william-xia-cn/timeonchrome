import CryptoKit
import Foundation

public enum AccountingV2Constants {
    public static let schemaVersion = 2
    public static let idleThresholdMilliseconds: Int64 = 180_000
    public static let checkpointIntervalMilliseconds: Int64 = 60_000
    public static let estimatedGapCapMilliseconds: Int64 = 30_000
    public static let reorderWindowMilliseconds: Int64 = 500
}

public enum AccountingFactKind: String, Codable, Sendable {
    case foregroundChanged
    case userActivityChanged
    case sessionChanged
    case powerChanged
    case pipChanged
    case mediaChanged
    case checkpoint
    case clockAdjusted
    case recovery
}

public enum UsageChannel: String, Codable, Sendable {
    case active
    case pipActive
    case diagnostic
}

public enum ActivityBasis: String, Codable, Sendable {
    case foregroundInteraction
    case foregroundStrongMedia
    case pipStrongMedia
    case estimatedCheckpoint
    case estimatedBackfill
    case estimatedRecovery
    case diagnostic
}

public enum WindowPresentationState: String, Codable, Sendable {
    case unknown
    case visible
    case hidden
    case minimized
}

public enum MediaEvidenceLevel: String, Codable, Sendable {
    case none
    case weak
    case strong
}

public enum MediaPlaybackState: String, Codable, Sendable {
    case unknown
    case playing
    case paused
    case stopped
}

public enum MediaKind: String, Codable, Sendable {
    case audio
    case video
}

public enum MediaPresentation: String, Codable, Sendable {
    case foreground
    case background
    case pip
}

public enum PipState: String, Codable, Sendable {
    case inactive
    case active
}

public enum CheckpointConfirmation: String, Codable, Sendable {
    case confirmed
    case failed
}

public enum ApplicationClassification: String, Codable, Sendable {
    case study
    case composite
    case restrictedEntertainment
    case unclassified
    case blocked
}

public struct AccountingPolicySnapshot: Codable, Equatable, Sendable {
    public let assignmentVersion: Int64?
    public let appPolicyVersion: Int64?
    public let applicationClassification: ApplicationClassification?
    public let quotaBucket: String?
}

public struct AccountingRuntimeSnapshot: Codable, Equatable, Sendable {
    public let foregroundApplication: ApplicationIdentity?
    public let foregroundWindowState: WindowPresentationState
    public let foregroundMediaEvidence: MediaEvidenceLevel
    public let foregroundPlaybackState: MediaPlaybackState
    public let userActivity: UserActivityState
    public let sessionState: UserSessionState
    public let powerState: SystemPowerState
}

public struct AccountingRuntimeFact: Codable, Equatable, Sendable {
    public let wallTimeMs: Int64
    public let monotonicTimeMs: Int64
    public let clockEpochId: String
    public let kind: AccountingFactKind
    public let application: ApplicationIdentity?
    public let userActivity: UserActivityState?
    public let sessionState: UserSessionState?
    public let powerState: SystemPowerState?
    public let windowState: WindowPresentationState
    public let mediaEvidence: MediaEvidenceLevel
    public let playbackState: MediaPlaybackState
    public let pipState: PipState?
    public let mediaKind: MediaKind?
    public let mediaPresentation: MediaPresentation?
    public let confirmation: CheckpointConfirmation?
    public let snapshot: AccountingRuntimeSnapshot?
    public let newClockEpochId: String?
    public let diagnosticHint: String?

    public init(
        wallTimeMs: Int64,
        monotonicTimeMs: Int64,
        clockEpochId: String,
        kind: AccountingFactKind,
        application: ApplicationIdentity? = nil,
        userActivity: UserActivityState? = nil,
        sessionState: UserSessionState? = nil,
        powerState: SystemPowerState? = nil,
        windowState: WindowPresentationState = .unknown,
        mediaEvidence: MediaEvidenceLevel = .none,
        playbackState: MediaPlaybackState = .unknown,
        pipState: PipState? = nil,
        mediaKind: MediaKind? = nil,
        mediaPresentation: MediaPresentation? = nil,
        confirmation: CheckpointConfirmation? = nil,
        snapshot: AccountingRuntimeSnapshot? = nil,
        newClockEpochId: String? = nil,
        diagnosticHint: String? = nil
    ) {
        self.wallTimeMs = wallTimeMs
        self.monotonicTimeMs = monotonicTimeMs
        self.clockEpochId = clockEpochId
        self.kind = kind
        self.application = application
        self.userActivity = userActivity
        self.sessionState = sessionState
        self.powerState = powerState
        self.windowState = windowState
        self.mediaEvidence = mediaEvidence
        self.playbackState = playbackState
        self.pipState = pipState
        self.mediaKind = mediaKind
        self.mediaPresentation = mediaPresentation
        self.confirmation = confirmation
        self.snapshot = snapshot
        self.newClockEpochId = newClockEpochId
        self.diagnosticHint = diagnosticHint
    }

    private enum CodingKeys: String, CodingKey {
        case wallTimeMs, monotonicTimeMs, clockEpochId, kind, application
        case userActivity, sessionState, powerState, windowState, mediaEvidence
        case playbackState, pipState, mediaKind, mediaPresentation, confirmation
        case snapshot, newClockEpochId, diagnosticHint
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)
        wallTimeMs = try values.decode(Int64.self, forKey: .wallTimeMs)
        monotonicTimeMs = try values.decode(Int64.self, forKey: .monotonicTimeMs)
        clockEpochId = try values.decode(String.self, forKey: .clockEpochId)
        kind = try values.decode(AccountingFactKind.self, forKey: .kind)
        application = try values.decodeIfPresent(ApplicationIdentity.self, forKey: .application)
        userActivity = try values.decodeIfPresent(UserActivityState.self, forKey: .userActivity)
        sessionState = try values.decodeIfPresent(UserSessionState.self, forKey: .sessionState)
        powerState = try values.decodeIfPresent(SystemPowerState.self, forKey: .powerState)
        windowState = try values.decodeIfPresent(WindowPresentationState.self, forKey: .windowState) ?? .unknown
        mediaEvidence = try values.decodeIfPresent(MediaEvidenceLevel.self, forKey: .mediaEvidence) ?? .none
        playbackState = try values.decodeIfPresent(MediaPlaybackState.self, forKey: .playbackState) ?? .unknown
        pipState = try values.decodeIfPresent(PipState.self, forKey: .pipState)
        mediaKind = try values.decodeIfPresent(MediaKind.self, forKey: .mediaKind)
        mediaPresentation = try values.decodeIfPresent(MediaPresentation.self, forKey: .mediaPresentation)
        confirmation = try values.decodeIfPresent(CheckpointConfirmation.self, forKey: .confirmation)
        snapshot = try values.decodeIfPresent(AccountingRuntimeSnapshot.self, forKey: .snapshot)
        newClockEpochId = try values.decodeIfPresent(String.self, forKey: .newClockEpochId)
        diagnosticHint = try values.decodeIfPresent(String.self, forKey: .diagnosticHint)
    }

    public var safetyPriority: Int {
        switch kind {
        case .clockAdjusted: return 0
        case .sessionChanged where sessionState != .active: return 1
        case .powerChanged where powerState != .awake: return 2
        case .userActivityChanged where userActivity == .idle: return 3
        case .pipChanged where pipState == .inactive: return 4
        case .mediaChanged where playbackState != .playing: return 5
        case .foregroundChanged: return 10
        case .userActivityChanged: return 11
        case .sessionChanged: return 12
        case .powerChanged: return 13
        case .pipChanged: return 14
        case .mediaChanged: return 15
        case .recovery: return 20
        case .checkpoint: return 30
        default: return 40
        }
    }
}

public struct EstimatedMetadata: Codable, Equatable, Sendable {
    public let isEstimated: Bool
    public let reason: String?
    public let cappedAtMilliseconds: Int64?

    public static let exact = EstimatedMetadata(
        isEstimated: false,
        reason: nil,
        cappedAtMilliseconds: nil
    )
}

public struct UsageSegmentV2: Codable, Equatable, Sendable {
    public let id: String
    public let schemaVersion: Int
    public let runtimeSessionID: String
    public let application: ApplicationIdentity?
    public let channel: UsageChannel
    public let activityBasis: ActivityBasis
    public let clockEpochId: String
    public let startWallTimeMs: Int64
    public let endWallTimeMs: Int64
    public let startMonotonicTimeMs: Int64
    public let endMonotonicTimeMs: Int64
    public let monotonicDurationMilliseconds: Int64
    public let endReason: SegmentEndReason
    public let estimated: EstimatedMetadata
    public let lastEvidenceWallTimeMs: Int64?
    public let lastEvidenceMonotonicTimeMs: Int64?
    public let diagnostic: Bool
    public let diagnosticCode: String?
    public let diagnosticMessage: String?
    public let policySnapshot: AccountingPolicySnapshot?

    public var authoritativeForUsage: Bool { !diagnostic && channel != .diagnostic }

    public static func create(
        runtimeSessionID: String,
        application: ApplicationIdentity?,
        channel requestedChannel: UsageChannel,
        activityBasis requestedBasis: ActivityBasis,
        clockEpochId: String,
        startWallTimeMs: Int64,
        endWallTimeMs: Int64,
        startMonotonicTimeMs: Int64,
        endMonotonicTimeMs: Int64,
        endReason requestedEndReason: SegmentEndReason,
        estimated requestedEstimated: EstimatedMetadata,
        lastEvidenceWallTimeMs: Int64?,
        lastEvidenceMonotonicTimeMs: Int64?,
        diagnostic requestedDiagnostic: Bool = false,
        diagnosticCode requestedDiagnosticCode: String? = nil,
        diagnosticMessage requestedDiagnosticMessage: String? = nil,
        policySnapshot: AccountingPolicySnapshot? = nil
    ) -> UsageSegmentV2 {
        let duration = max(0, endMonotonicTimeMs - startMonotonicTimeMs)
        let zeroBoundary = duration == 0 && !requestedDiagnostic
        let channel = zeroBoundary ? UsageChannel.diagnostic : requestedChannel
        let basis = zeroBoundary ? ActivityBasis.diagnostic : requestedBasis
        let endReason = zeroBoundary ? SegmentEndReason.diagnostic : requestedEndReason
        let estimated = zeroBoundary ? EstimatedMetadata.exact : requestedEstimated
        let diagnostic = zeroBoundary || requestedDiagnostic
        let diagnosticCode = zeroBoundary ? "zeroDurationBoundary" : requestedDiagnosticCode
        let diagnosticMessage = zeroBoundary
            ? (requestedDiagnosticMessage ?? "A same-millisecond boundary did not produce billable duration.")
            : requestedDiagnosticMessage
        let canonical = AccountingSegmentID.canonicalUsage(
            runtimeSessionID: runtimeSessionID,
            application: application,
            channel: channel,
            basis: basis,
            clockEpochId: clockEpochId,
            startWall: startWallTimeMs,
            endWall: endWallTimeMs,
            startMonotonic: startMonotonicTimeMs,
            endMonotonic: endMonotonicTimeMs,
            duration: duration,
            endReason: endReason,
            estimated: estimated,
            diagnostic: diagnostic,
            diagnosticCode: diagnosticCode
        )
        return UsageSegmentV2(
            id: AccountingSegmentID.sha256(canonical),
            schemaVersion: AccountingV2Constants.schemaVersion,
            runtimeSessionID: runtimeSessionID,
            application: application,
            channel: channel,
            activityBasis: basis,
            clockEpochId: clockEpochId,
            startWallTimeMs: startWallTimeMs,
            endWallTimeMs: endWallTimeMs,
            startMonotonicTimeMs: startMonotonicTimeMs,
            endMonotonicTimeMs: endMonotonicTimeMs,
            monotonicDurationMilliseconds: duration,
            endReason: endReason,
            estimated: estimated,
            lastEvidenceWallTimeMs: lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs: lastEvidenceMonotonicTimeMs,
            diagnostic: diagnostic,
            diagnosticCode: diagnosticCode,
            diagnosticMessage: diagnosticMessage,
            policySnapshot: policySnapshot
        )
    }
}

public struct MediaSegmentV2: Codable, Equatable, Sendable {
    public let id: String
    public let schemaVersion: Int
    public let runtimeSessionID: String
    public let application: ApplicationIdentity
    public let mediaKind: MediaKind
    public let presentation: MediaPresentation
    public let clockEpochId: String
    public let startWallTimeMs: Int64
    public let endWallTimeMs: Int64
    public let startMonotonicTimeMs: Int64
    public let endMonotonicTimeMs: Int64
    public let monotonicDurationMilliseconds: Int64
    public let endReason: SegmentEndReason
    public let estimated: EstimatedMetadata
    public let lastEvidenceWallTimeMs: Int64
    public let lastEvidenceMonotonicTimeMs: Int64
    public let authoritativeForUsage: Bool

    public static func create(
        runtimeSessionID: String,
        application: ApplicationIdentity,
        mediaKind: MediaKind,
        presentation: MediaPresentation,
        clockEpochId: String,
        startWallTimeMs: Int64,
        endWallTimeMs: Int64,
        startMonotonicTimeMs: Int64,
        endMonotonicTimeMs: Int64,
        endReason: SegmentEndReason,
        estimated: EstimatedMetadata,
        lastEvidenceWallTimeMs: Int64,
        lastEvidenceMonotonicTimeMs: Int64
    ) -> MediaSegmentV2 {
        let duration = max(0, endMonotonicTimeMs - startMonotonicTimeMs)
        let canonical = AccountingSegmentID.canonicalMedia(
            runtimeSessionID: runtimeSessionID,
            application: application,
            mediaKind: mediaKind,
            presentation: presentation,
            clockEpochId: clockEpochId,
            startWall: startWallTimeMs,
            endWall: endWallTimeMs,
            startMonotonic: startMonotonicTimeMs,
            endMonotonic: endMonotonicTimeMs,
            duration: duration,
            endReason: endReason,
            estimated: estimated
        )
        return MediaSegmentV2(
            id: AccountingSegmentID.sha256(canonical),
            schemaVersion: AccountingV2Constants.schemaVersion,
            runtimeSessionID: runtimeSessionID,
            application: application,
            mediaKind: mediaKind,
            presentation: presentation,
            clockEpochId: clockEpochId,
            startWallTimeMs: startWallTimeMs,
            endWallTimeMs: endWallTimeMs,
            startMonotonicTimeMs: startMonotonicTimeMs,
            endMonotonicTimeMs: endMonotonicTimeMs,
            monotonicDurationMilliseconds: duration,
            endReason: endReason,
            estimated: estimated,
            lastEvidenceWallTimeMs: lastEvidenceWallTimeMs,
            lastEvidenceMonotonicTimeMs: lastEvidenceMonotonicTimeMs,
            authoritativeForUsage: false
        )
    }
}

public enum AccountingSegmentID {
    public static func sha256(_ canonical: String) -> String {
        SHA256.hash(data: Data(canonical.utf8)).map { String(format: "%02x", $0) }.joined()
    }

    public static func canonicalUsage(
        runtimeSessionID: String,
        application: ApplicationIdentity?,
        channel: UsageChannel,
        basis: ActivityBasis,
        clockEpochId: String,
        startWall: Int64,
        endWall: Int64,
        startMonotonic: Int64,
        endMonotonic: Int64,
        duration: Int64,
        endReason: SegmentEndReason,
        estimated: EstimatedMetadata,
        diagnostic: Bool,
        diagnosticCode: String?
    ) -> String {
        [
            "usage-v2", runtimeSessionID, application?.platform.rawValue ?? "",
            application?.runtimeIdentity ?? "", channel.rawValue, basis.rawValue,
            clockEpochId, String(startWall), String(endWall), String(startMonotonic),
            String(endMonotonic), String(duration), endReason.rawValue,
            estimated.isEstimated ? "1" : "0", estimated.reason ?? "",
            estimated.cappedAtMilliseconds.map { String($0) } ?? "",
            diagnostic ? "1" : "0", diagnosticCode ?? ""
        ].joined(separator: "\n")
    }

    public static func canonicalMedia(
        runtimeSessionID: String,
        application: ApplicationIdentity,
        mediaKind: MediaKind,
        presentation: MediaPresentation,
        clockEpochId: String,
        startWall: Int64,
        endWall: Int64,
        startMonotonic: Int64,
        endMonotonic: Int64,
        duration: Int64,
        endReason: SegmentEndReason,
        estimated: EstimatedMetadata
    ) -> String {
        [
            "media-v2", runtimeSessionID, application.platform.rawValue,
            application.runtimeIdentity, mediaKind.rawValue, presentation.rawValue,
            clockEpochId, String(startWall), String(endWall), String(startMonotonic),
            String(endMonotonic), String(duration), endReason.rawValue,
            estimated.isEstimated ? "1" : "0", estimated.reason ?? "",
            estimated.cappedAtMilliseconds.map { String($0) } ?? ""
        ].joined(separator: "\n")
    }
}

public struct OpenAccountingLane: Equatable, Codable, Sendable {
    public let application: ApplicationIdentity
    public let channel: UsageChannel
    public let activityBasis: ActivityBasis
    public let clockEpochId: String
    public let startWallTimeMs: Int64
    public let startMonotonicTimeMs: Int64
    public let lastEvidenceWallTimeMs: Int64
    public let lastEvidenceMonotonicTimeMs: Int64
}

public struct OpenMediaLane: Equatable, Codable, Sendable {
    public let application: ApplicationIdentity
    public let mediaKind: MediaKind
    public let presentation: MediaPresentation
    public let clockEpochId: String
    public let startWallTimeMs: Int64
    public let startMonotonicTimeMs: Int64
    public let lastEvidenceWallTimeMs: Int64
    public let lastEvidenceMonotonicTimeMs: Int64
}

public struct PipObservation: Equatable, Codable, Sendable {
    public let application: ApplicationIdentity
    public let windowState: WindowPresentationState
    public let mediaEvidence: MediaEvidenceLevel
    public let playbackState: MediaPlaybackState
}

public struct MediaObservation: Equatable, Codable, Sendable {
    public let application: ApplicationIdentity
    public let mediaKind: MediaKind
    public let presentation: MediaPresentation
    public let mediaEvidence: MediaEvidenceLevel
    public let playbackState: MediaPlaybackState
}

public struct AccountingRuntimeState: Equatable, Codable, Sendable {
    public let runtimeSessionID: String
    public var clockEpochId: String
    public var foregroundApplication: ApplicationIdentity?
    public var foregroundWindowState: WindowPresentationState = .unknown
    public var foregroundMediaEvidence: MediaEvidenceLevel = .none
    public var foregroundPlaybackState: MediaPlaybackState = .unknown
    public var userActivity: UserActivityState = .unknown
    public var sessionState: UserSessionState = .unknown
    public var powerState: SystemPowerState = .unknown
    public var foregroundLane: OpenAccountingLane?
    public var pipObservations: [String: PipObservation] = [:]
    public var pipLanes: [String: OpenAccountingLane] = [:]
    public var mediaObservations: [String: MediaObservation] = [:]
    public var mediaLanes: [String: OpenMediaLane] = [:]
    public var lastProcessedWallTimeMs: Int64?
    public var lastProcessedMonotonicTimeMs: Int64?

    public init(runtimeSessionID: String, clockEpochId: String = "epoch-0") {
        self.runtimeSessionID = runtimeSessionID
        self.clockEpochId = clockEpochId
    }
}

public struct AccountingTransition: Equatable, Sendable {
    public let state: AccountingRuntimeState
    public let usageSegments: [UsageSegmentV2]
    public let mediaSegments: [MediaSegmentV2]
}
