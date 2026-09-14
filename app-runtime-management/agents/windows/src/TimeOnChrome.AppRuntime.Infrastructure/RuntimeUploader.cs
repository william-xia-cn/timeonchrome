using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed class RuntimeUploader
{
    private readonly ISegmentStore segmentStore;
    private readonly IUploadOutbox outbox;
    private readonly RuntimeApiClient apiClient;
    private readonly TimeProvider timeProvider;

    public RuntimeUploader(
        ISegmentStore segmentStore,
        IUploadOutbox outbox,
        RuntimeApiClient apiClient,
        TimeProvider? timeProvider = null)
    {
        this.segmentStore = segmentStore;
        this.outbox = outbox;
        this.apiClient = apiClient;
        this.timeProvider = timeProvider ?? TimeProvider.System;
    }

    public async Task<int> UploadPendingAsync(
        RuntimeCredential credential,
        int limit = 50,
        CancellationToken cancellationToken = default)
    {
        var nowMs = timeProvider.GetUtcNow().ToUnixTimeMilliseconds();
        var entries = await outbox.PendingAsync(limit, nowMs, cancellationToken).ConfigureAwait(false);
        if (entries.Count == 0)
        {
            return 0;
        }

        var segments = new List<UsageSegment>(entries.Count);
        foreach (var entry in entries)
        {
            var segment = await segmentStore.SegmentAsync(entry.SegmentID, cancellationToken)
                .ConfigureAwait(false);
            if (segment is null)
            {
                await outbox.RecordPermanentRejectionAsync(
                    new HashSet<string>(StringComparer.Ordinal) { entry.SegmentID },
                    "LOCAL_SEGMENT_MISSING",
                    cancellationToken).ConfigureAwait(false);
                continue;
            }

            segments.Add(segment);
        }

        if (segments.Count == 0)
        {
            return 0;
        }

        UploadAcceptance acceptance;
        try
        {
            acceptance = await apiClient.UploadAsync(credential, segments, cancellationToken)
                .ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is HttpRequestException
            or TaskCanceledException
            or RuntimeApiException)
        {
            var ids = segments.Select(segment => segment.Id).ToHashSet(StringComparer.Ordinal);
            var attempt = entries.Max(entry => entry.AttemptCount) + 1;
            var delaySeconds = Math.Min(300, 5 * (1 << Math.Min(attempt, 6)));
            await outbox.RecordFailureAsync(
                ids,
                exception is RuntimeApiException apiException && apiException.StatusCode == 401
                    ? "UNAUTHORIZED"
                    : "UPLOAD_FAILED",
                nowMs + (delaySeconds * 1000L),
                cancellationToken).ConfigureAwait(false);
            return 0;
        }

        var requested = segments.Select(segment => segment.Id).ToHashSet(StringComparer.Ordinal);
        var accepted = acceptance.AcceptedIds
            .Where(requested.Contains)
            .ToHashSet(StringComparer.Ordinal);
        await outbox.MarkAcceptedAsync(accepted, cancellationToken).ConfigureAwait(false);

        foreach (var rejectionGroup in acceptance.Rejected
            .Where(rejection => requested.Contains(rejection.Id))
            .GroupBy(rejection => rejection.Code, StringComparer.Ordinal))
        {
            await outbox.RecordPermanentRejectionAsync(
                rejectionGroup.Select(rejection => rejection.Id).ToHashSet(StringComparer.Ordinal),
                rejectionGroup.Key,
                cancellationToken).ConfigureAwait(false);
        }

        var acknowledged = accepted
            .Concat(acceptance.Rejected.Select(rejection => rejection.Id))
            .ToHashSet(StringComparer.Ordinal);
        requested.ExceptWith(acknowledged);
        if (requested.Count > 0)
        {
            await outbox.RecordFailureAsync(
                requested,
                "ACK_MISSING",
                nowMs + 30_000,
                cancellationToken).ConfigureAwait(false);
        }

        return accepted.Count;
    }
}
