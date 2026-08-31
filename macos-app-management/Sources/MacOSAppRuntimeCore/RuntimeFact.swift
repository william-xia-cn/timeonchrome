public enum UserActivityState: String, Codable, Equatable, Sendable {
    case unknown
    case active
    case idle
}

public enum UserSessionState: String, Codable, Equatable, Sendable {
    case unknown
    case active
    case inactive
    case locked
}

public enum SystemPowerState: String, Codable, Equatable, Sendable {
    case unknown
    case awake
    case asleep
}

public struct RuntimeSnapshot: Codable, Equatable, Sendable {
    public let application: ApplicationIdentity?
    public let userActivity: UserActivityState
    public let sessionState: UserSessionState
    public let powerState: SystemPowerState

    public init(
        application: ApplicationIdentity?,
        userActivity: UserActivityState,
        sessionState: UserSessionState,
        powerState: SystemPowerState
    ) {
        self.application = application
        self.userActivity = userActivity
        self.sessionState = sessionState
        self.powerState = powerState
    }
}

public struct RuntimeFact: Codable, Equatable, Sendable {
    public enum Kind: Codable, Equatable, Sendable {
        case applicationActivated(ApplicationIdentity?)
        case userActivityChanged(UserActivityState)
        case sessionChanged(UserSessionState)
        case powerChanged(SystemPowerState)
        case snapshot(RuntimeSnapshot)
    }

    public let observedAtMs: Int64
    public let kind: Kind

    public init(observedAtMs: Int64, kind: Kind) {
        self.observedAtMs = observedAtMs
        self.kind = kind
    }
}
