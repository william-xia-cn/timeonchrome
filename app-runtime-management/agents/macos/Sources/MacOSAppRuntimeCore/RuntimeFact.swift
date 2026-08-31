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
    public enum Kind: Equatable, Sendable {
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

    private enum WireKind: String, Codable {
        case applicationActivated
        case userActivityChanged
        case sessionChanged
        case powerChanged
        case snapshot
    }

    private enum CodingKeys: String, CodingKey {
        case observedAtMs
        case kind
        case application
        case userActivity
        case sessionState
        case powerState
        case snapshot
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        observedAtMs = try container.decode(Int64.self, forKey: .observedAtMs)

        switch try container.decode(WireKind.self, forKey: .kind) {
        case .applicationActivated:
            kind = .applicationActivated(
                try container.decodeIfPresent(ApplicationIdentity.self, forKey: .application)
            )
        case .userActivityChanged:
            kind = .userActivityChanged(
                try container.decode(UserActivityState.self, forKey: .userActivity)
            )
        case .sessionChanged:
            kind = .sessionChanged(
                try container.decode(UserSessionState.self, forKey: .sessionState)
            )
        case .powerChanged:
            kind = .powerChanged(
                try container.decode(SystemPowerState.self, forKey: .powerState)
            )
        case .snapshot:
            kind = .snapshot(
                try container.decode(RuntimeSnapshot.self, forKey: .snapshot)
            )
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(observedAtMs, forKey: .observedAtMs)

        switch kind {
        case let .applicationActivated(application):
            try container.encode(WireKind.applicationActivated, forKey: .kind)
            try container.encode(application, forKey: .application)
        case let .userActivityChanged(activity):
            try container.encode(WireKind.userActivityChanged, forKey: .kind)
            try container.encode(activity, forKey: .userActivity)
        case let .sessionChanged(session):
            try container.encode(WireKind.sessionChanged, forKey: .kind)
            try container.encode(session, forKey: .sessionState)
        case let .powerChanged(power):
            try container.encode(WireKind.powerChanged, forKey: .kind)
            try container.encode(power, forKey: .powerState)
        case let .snapshot(snapshot):
            try container.encode(WireKind.snapshot, forKey: .kind)
            try container.encode(snapshot, forKey: .snapshot)
        }
    }
}
