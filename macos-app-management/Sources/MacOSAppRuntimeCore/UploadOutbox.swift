public struct UploadOutboxEntry: Codable, Equatable, Sendable {
    public let segmentID: String
    public let attemptCount: Int
    public let nextAttemptAtMs: Int64?
    public let lastErrorCode: String?

    public init(
        segmentID: String,
        attemptCount: Int,
        nextAttemptAtMs: Int64? = nil,
        lastErrorCode: String? = nil
    ) {
        self.segmentID = segmentID
        self.attemptCount = attemptCount
        self.nextAttemptAtMs = nextAttemptAtMs
        self.lastErrorCode = lastErrorCode
    }
}

public protocol UploadOutbox: Sendable {
    func pending(limit: Int, nowMs: Int64) async throws -> [UploadOutboxEntry]
    func markAccepted(segmentIDs: Set<String>) async throws
    func recordFailure(
        segmentIDs: Set<String>,
        errorCode: String,
        retryAtMs: Int64
    ) async throws
}
