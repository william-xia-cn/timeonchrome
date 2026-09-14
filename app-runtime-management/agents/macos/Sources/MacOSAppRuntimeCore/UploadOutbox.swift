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

public struct UploadRejection: Codable, Equatable, Sendable {
    public let id: String
    public let code: String

    public init(id: String, code: String) {
        self.id = id
        self.code = code
    }
}

public struct UploadAcceptance: Codable, Equatable, Sendable {
    public let acceptedIds: [String]
    public let rejected: [UploadRejection]

    public init(acceptedIds: [String], rejected: [UploadRejection]) {
        self.acceptedIds = acceptedIds
        self.rejected = rejected
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
