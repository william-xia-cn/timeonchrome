using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed class MachineAccountingSession
{
    private readonly MachineSegmentLedger ledger;
    private readonly string localUserId;
    private readonly long assignmentVersion;
    private readonly List<PendingFact> pending = new();
    private long sequence;
    private long maximumSeen = -1;
    private long lastEmitted = -1;

    public MachineAccountingSession(
        MachineSegmentLedger ledger,
        string localUserId,
        long assignmentVersion,
        string runtimeSessionId,
        string initialClockEpochId)
        : this(
            ledger,
            localUserId,
            assignmentVersion,
            new AccountingRuntimeState
            {
                RuntimeSessionID = runtimeSessionId,
                ClockEpochId = initialClockEpochId,
            })
    {
    }

    public MachineAccountingSession(
        MachineSegmentLedger ledger,
        string localUserId,
        long assignmentVersion,
        AccountingRuntimeState restoredState)
    {
        this.ledger = ledger ?? throw new ArgumentNullException(nameof(ledger));
        ArgumentException.ThrowIfNullOrWhiteSpace(localUserId);
        this.localUserId = localUserId;
        this.assignmentVersion = assignmentVersion;
        DurableState = restoredState ?? throw new ArgumentNullException(nameof(restoredState));
        lastEmitted = restoredState.LastProcessedMonotonicTimeMs ?? -1;
        maximumSeen = lastEmitted;
    }

    public AccountingRuntimeState DurableState { get; private set; }

    public async Task<AccountingTransition> PushAndPersistAsync(
        AccountingRuntimeFact fact,
        CancellationToken cancellationToken = default)
    {
        if (fact.MonotonicTimeMs < lastEmitted)
        {
            return await ApplyAndPersistAsync(fact, late: true, cancellationToken).ConfigureAwait(false);
        }

        maximumSeen = Math.Max(maximumSeen, fact.MonotonicTimeMs);
        pending.Add(new PendingFact(sequence++, fact));
        return await DrainAndPersistAsync(
            maximumSeen - AccountingV2Constants.ReorderWindowMilliseconds,
            cancellationToken).ConfigureAwait(false);
    }

    public Task<AccountingTransition> FlushAndPersistAsync(CancellationToken cancellationToken = default)
    {
        return DrainAndPersistAsync(long.MaxValue, cancellationToken);
    }

    private async Task<AccountingTransition> DrainAndPersistAsync(
        long watermark,
        CancellationToken cancellationToken)
    {
        var usage = new List<UsageSegmentV2>();
        var media = new List<MediaSegmentV2>();
        while (true)
        {
            var item = pending
                .Where(candidate => candidate.Fact.MonotonicTimeMs <= watermark)
                .OrderBy(candidate => candidate.Fact.MonotonicTimeMs)
                .ThenBy(candidate => candidate.Fact.SafetyPriority)
                .ThenBy(candidate => candidate.Sequence)
                .FirstOrDefault();
            if (item is null)
            {
                break;
            }

            var transition = await ApplyAndPersistAsync(
                item.Fact,
                item.Fact.MonotonicTimeMs < lastEmitted,
                cancellationToken).ConfigureAwait(false);
            pending.Remove(item);
            usage.AddRange(transition.UsageSegments);
            media.AddRange(transition.MediaSegments);
            lastEmitted = Math.Max(lastEmitted, item.Fact.MonotonicTimeMs);
        }

        return new AccountingTransition(DurableState, usage, media);
    }

    private async Task<AccountingTransition> ApplyAndPersistAsync(
        AccountingRuntimeFact fact,
        bool late,
        CancellationToken cancellationToken)
    {
        var candidate = new AccountingStateMachineV2(DurableState);
        var transition = late
            ? candidate.ApplyLate(fact)
            : candidate.ApplyOrdered(fact);

        await ledger.PersistAccountingTransitionAsync(
            localUserId,
            assignmentVersion,
            transition,
            cancellationToken).ConfigureAwait(false);

        DurableState = transition.State;
        return transition;
    }

    private sealed record PendingFact(long Sequence, AccountingRuntimeFact Fact);
}
