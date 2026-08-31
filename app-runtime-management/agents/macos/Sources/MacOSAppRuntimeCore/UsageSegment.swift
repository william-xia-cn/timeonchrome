public enum SegmentEndReason: String, Codable, Equatable, Sendable {
    case applicationSwitch
    case userIdle
    case sessionUnavailable
    case systemSleep
    case periodicSnapshot
    case stateCorrection
}

public struct UsageSegment: Codable, Equatable, Sendable {
    public let id: String
    public let runtimeSessionID: String
    public let application: ApplicationIdentity
    public let startAtMs: Int64
    public let endAtMs: Int64
    public let durationMilliseconds: Int64
    public let endReason: SegmentEndReason

    public init(
        id: String,
        runtimeSessionID: String,
        application: ApplicationIdentity,
        startAtMs: Int64,
        endAtMs: Int64,
        durationMilliseconds: Int64,
        endReason: SegmentEndReason
    ) {
        self.id = id
        self.runtimeSessionID = runtimeSessionID
        self.application = application
        self.startAtMs = startAtMs
        self.endAtMs = endAtMs
        self.durationMilliseconds = durationMilliseconds
        self.endReason = endReason
    }
}
