namespace TimeOnChrome.AppRuntime.Core;

public sealed record UploadOutboxEntry(
    string SegmentID,
    int AttemptCount,
    long? NextAttemptAtMs = null,
    string? LastErrorCode = null);

public sealed record UploadRejection(string Id, string Code);

public sealed record UploadAcceptance(
    IReadOnlyList<string> AcceptedIds,
    IReadOnlyList<UploadRejection> Rejected);

public interface IUploadOutbox
{
    Task<IReadOnlyList<UploadOutboxEntry>> PendingAsync(
        int limit,
        long nowMs,
        CancellationToken cancellationToken = default);

    Task MarkAcceptedAsync(
        IReadOnlySet<string> segmentIDs,
        CancellationToken cancellationToken = default);

    Task RecordFailureAsync(
        IReadOnlySet<string> segmentIDs,
        string errorCode,
        long retryAtMs,
        CancellationToken cancellationToken = default);
}
