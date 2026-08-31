public enum RuntimePlatform: String, Codable, Equatable, Sendable {
    case macos
    case windows
}

public struct ApplicationIdentity: Codable, Equatable, Hashable, Sendable {
    public let platform: RuntimePlatform
    public let runtimeIdentity: String
    public let displayName: String?

    public init(
        platform: RuntimePlatform,
        runtimeIdentity: String,
        displayName: String? = nil
    ) {
        self.platform = platform
        self.runtimeIdentity = runtimeIdentity
        self.displayName = displayName
    }
}
