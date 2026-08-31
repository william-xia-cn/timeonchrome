public struct ApplicationIdentity: Codable, Equatable, Hashable, Sendable {
    public let runtimeIdentity: String
    public let bundleIdentifier: String?
    public let teamIdentifier: String?
    public let signingIdentifier: String?
    public let displayName: String?

    public init(
        runtimeIdentity: String,
        bundleIdentifier: String? = nil,
        teamIdentifier: String? = nil,
        signingIdentifier: String? = nil,
        displayName: String? = nil
    ) {
        self.runtimeIdentity = runtimeIdentity
        self.bundleIdentifier = bundleIdentifier
        self.teamIdentifier = teamIdentifier
        self.signingIdentifier = signingIdentifier
        self.displayName = displayName
    }
}
