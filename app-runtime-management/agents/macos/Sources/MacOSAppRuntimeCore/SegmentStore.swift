public protocol SegmentStore: Sendable {
    /// Future implementations must persist immutable segments and enqueue their
    /// IDs in the same SQLite transaction.
    func persistAndEnqueue(_ segments: [UsageSegment]) async throws

    func segment(id: String) async throws -> UsageSegment?
}
