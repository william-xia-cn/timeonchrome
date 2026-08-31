namespace TimeOnChrome.AppRuntime.Core;

public interface ISegmentStore
{
    // Future implementations must persist immutable segments and enqueue their
    // IDs in the same SQLite transaction.
    Task PersistAndEnqueueAsync(
        IReadOnlyList<UsageSegment> segments,
        CancellationToken cancellationToken = default);

    Task<UsageSegment?> SegmentAsync(
        string id,
        CancellationToken cancellationToken = default);
}
