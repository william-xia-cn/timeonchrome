public struct RuntimeState: Codable, Equatable, Sendable {
    public struct OpenSegment: Codable, Equatable, Sendable {
        public let application: ApplicationIdentity
        public let startAtMs: Int64

        public init(application: ApplicationIdentity, startAtMs: Int64) {
            self.application = application
            self.startAtMs = startAtMs
        }
    }

    public let runtimeSessionID: String
    public internal(set) var application: ApplicationIdentity?
    public internal(set) var userActivity: UserActivityState
    public internal(set) var sessionState: UserSessionState
    public internal(set) var powerState: SystemPowerState
    public internal(set) var openSegment: OpenSegment?
    public internal(set) var lastObservedAtMs: Int64?
    public internal(set) var nextSegmentOrdinal: UInt64

    public init(runtimeSessionID: String) {
        self.runtimeSessionID = runtimeSessionID
        self.application = nil
        self.userActivity = .unknown
        self.sessionState = .unknown
        self.powerState = .unknown
        self.openSegment = nil
        self.lastObservedAtMs = nil
        self.nextSegmentOrdinal = 0
    }

    public var isEligibleForUsage: Bool {
        application != nil
            && userActivity == .active
            && sessionState == .active
            && powerState == .awake
    }
}
