namespace TimeOnChrome.AppRuntime.Core;

public sealed class AccountingStateMachineV2
{
    public AccountingStateMachineV2(string runtimeSessionID, string initialClockEpochId = "epoch-0")
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(runtimeSessionID);
        State = new AccountingRuntimeState
        {
            RuntimeSessionID = runtimeSessionID,
            ClockEpochId = initialClockEpochId,
        };
    }

    public AccountingStateMachineV2(AccountingRuntimeState restoredState)
    {
        State = restoredState ?? throw new ArgumentNullException(nameof(restoredState));
    }

    public AccountingRuntimeState State { get; private set; }

    public AccountingTransition ApplyOrdered(AccountingRuntimeFact fact)
    {
        ArgumentNullException.ThrowIfNull(fact);
        if (fact.WallTimeMs < 0 || fact.MonotonicTimeMs < 0)
        {
            return ApplyDiagnostic(fact, "negativeTimestamp", "Negative wall or monotonic timestamp.");
        }

        if (State.LastProcessedMonotonicTimeMs is long previous && fact.MonotonicTimeMs < previous)
        {
            return ApplyDiagnostic(fact, "lateFact", "Fact arrived after its reorder window.");
        }

        var usage = new List<UsageSegmentV2>();
        var media = new List<MediaSegmentV2>();
        var state = State;

        if (fact.Kind != AccountingFactKind.ClockAdjusted
            && !string.Equals(fact.ClockEpochId, state.ClockEpochId, StringComparison.Ordinal))
        {
            CloseAll(
                ref state,
                fact,
                SegmentEndReason.ClockAdjustment,
                usage,
                media,
                exactWallFromMonotonic: true);
            state = state with { ClockEpochId = fact.ClockEpochId };
        }

        switch (fact.Kind)
        {
            case AccountingFactKind.ForegroundChanged:
                ApplyForeground(ref state, fact, usage);
                break;
            case AccountingFactKind.UserActivityChanged:
                ApplyActivity(ref state, fact, usage);
                break;
            case AccountingFactKind.SessionChanged:
                ApplySession(ref state, fact, usage, media);
                break;
            case AccountingFactKind.PowerChanged:
                ApplyPower(ref state, fact, usage, media);
                break;
            case AccountingFactKind.PipChanged:
                ApplyPip(ref state, fact, usage);
                break;
            case AccountingFactKind.MediaChanged:
                ApplyMedia(ref state, fact, usage, media);
                break;
            case AccountingFactKind.Checkpoint:
                ApplyCheckpoint(ref state, fact, usage, media);
                break;
            case AccountingFactKind.ClockAdjusted:
                CloseAll(ref state, fact, SegmentEndReason.ClockAdjustment, usage, media, exactWallFromMonotonic: true);
                state = state with { ClockEpochId = RequireText(fact.NewClockEpochId, nameof(fact.NewClockEpochId)) };
                ReconcileOpenLanes(ref state, fact);
                break;
            case AccountingFactKind.Recovery:
                ApplyRecovery(ref state, fact, usage, media);
                break;
            default:
                throw new InvalidOperationException($"Unsupported accounting fact kind: {fact.Kind}.");
        }

        state = state with
        {
            LastProcessedWallTimeMs = fact.WallTimeMs,
            LastProcessedMonotonicTimeMs = fact.MonotonicTimeMs,
        };
        State = state;
        return new AccountingTransition(state, usage, media);
    }

    public AccountingTransition ApplyLate(AccountingRuntimeFact fact)
    {
        return ApplyDiagnostic(fact, "lateFact", "Fact arrived after its 500ms reorder window.");
    }

    private AccountingTransition ApplyDiagnostic(AccountingRuntimeFact fact, string code, string message)
    {
        var application = fact.Application ?? State.ForegroundApplication;
        var segment = UsageSegmentV2.Create(
            State.RuntimeSessionID,
            application,
            UsageChannel.Diagnostic,
            ActivityBasis.Diagnostic,
            State.ClockEpochId,
            Math.Max(0, fact.WallTimeMs),
            Math.Max(0, fact.WallTimeMs),
            Math.Max(0, fact.MonotonicTimeMs),
            Math.Max(0, fact.MonotonicTimeMs),
            SegmentEndReason.Diagnostic,
            EstimatedMetadata.Exact,
            null,
            null,
            diagnostic: true,
            diagnosticCode: code,
            diagnosticMessage: message);
        return new AccountingTransition(State, new[] { segment }, Array.Empty<MediaSegmentV2>());
    }

    private static void ApplyForeground(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage)
    {
        var changed = !SameApplication(state.ForegroundApplication, fact.Application);
        var oldBasis = ForegroundBasis(state);
        var next = state with
        {
            ForegroundApplication = fact.Application,
            ForegroundWindowState = fact.WindowState,
            ForegroundMediaEvidence = fact.MediaEvidence,
            ForegroundPlaybackState = fact.PlaybackState,
        };
        var newBasis = ForegroundBasis(next);
        if (state.ForegroundLane is not null && (changed || oldBasis != newBasis || newBasis is null))
        {
            var reason = changed ? SegmentEndReason.ApplicationSwitch : SegmentEndReason.StateCorrection;
            usage.Add(CloseUsage(state.RuntimeSessionID, state.ForegroundLane, fact, reason, EstimatedMetadata.Exact));
            next = next with { ForegroundLane = null };
        }

        state = next;
        EnsureForegroundOpen(ref state, fact);
    }

    private static void ApplyActivity(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage)
    {
        var nextActivity = fact.UserActivity
            ?? throw new InvalidOperationException("Activity fact requires userActivity.");
        var oldBasis = ForegroundBasis(state);
        var next = state with { UserActivity = nextActivity };
        var newBasis = ForegroundBasis(next);
        if (state.ForegroundLane is not null && oldBasis != newBasis)
        {
            usage.Add(CloseUsage(
                state.RuntimeSessionID,
                state.ForegroundLane,
                fact,
                nextActivity == UserActivityState.Idle ? SegmentEndReason.UserIdle : SegmentEndReason.StateCorrection,
                EstimatedMetadata.Exact));
            next = next with { ForegroundLane = null };
        }
        else if (nextActivity == UserActivityState.Idle
            && state.ForegroundApplication is not null
            && state.ForegroundLane is null)
        {
            usage.Add(DiagnosticFor(state, fact, "noOpenLane", "Idle close had no foreground lane."));
        }

        state = next;
        EnsureForegroundOpen(ref state, fact);
    }

    private static void ApplySession(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> media)
    {
        var session = fact.SessionState
            ?? throw new InvalidOperationException("Session fact requires sessionState.");
        state = state with { SessionState = session };
        if (session != UserSessionState.Active)
        {
            if (!HasAnyOpenLane(state))
            {
                usage.Add(DiagnosticFor(state, fact, "noOpenLane", "Session close had no open lane."));
            }
            CloseAll(ref state, fact, SegmentEndReason.SessionUnavailable, usage, media);
            return;
        }

        ReconcileOpenLanes(ref state, fact);
    }

    private static void ApplyPower(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> media)
    {
        var power = fact.PowerState
            ?? throw new InvalidOperationException("Power fact requires powerState.");
        state = state with { PowerState = power };
        if (power != SystemPowerState.Awake)
        {
            if (!HasAnyOpenLane(state))
            {
                usage.Add(DiagnosticFor(state, fact, "noOpenLane", "Power close had no open lane."));
            }
            CloseAll(ref state, fact, SegmentEndReason.SystemSleep, usage, media);
            return;
        }

        ReconcileOpenLanes(ref state, fact);
    }

    private static void ApplyPip(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage)
    {
        var application = fact.Application
            ?? throw new InvalidOperationException("PiP fact requires application.");
        var key = ApplicationKey(application);
        var observations = state.PipObservations.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        var lanes = state.PipLanes.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);

        if (fact.PipState == TimeOnChrome.AppRuntime.Core.PipState.Active)
        {
            var observation = new PipObservation(application, fact.WindowState, fact.MediaEvidence, fact.PlaybackState);
            observations[key] = observation;
            var eligible = IsPipEligible(state, observation);
            if (lanes.TryGetValue(key, out var existing) && !eligible)
            {
                usage.Add(CloseUsage(state.RuntimeSessionID, existing, fact, SegmentEndReason.PipEnded, EstimatedMetadata.Exact));
                lanes.Remove(key);
            }
            else if (!lanes.ContainsKey(key) && eligible)
            {
                lanes[key] = OpenUsage(application, UsageChannel.PipActive, ActivityBasis.PipStrongMedia, state.ClockEpochId, fact);
            }
        }
        else
        {
            observations.Remove(key);
            if (lanes.Remove(key, out var existing))
            {
                usage.Add(CloseUsage(state.RuntimeSessionID, existing, fact, SegmentEndReason.PipEnded, EstimatedMetadata.Exact));
            }
            else
            {
                usage.Add(DiagnosticFor(
                    state,
                    fact,
                    lanes.Count == 0 ? "noOpenLane" : "targetConflict",
                    "PiP close did not match an open lane.",
                    application));
            }
        }

        state = state with { PipObservations = observations, PipLanes = lanes };
    }

    private static void ApplyMedia(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> completed)
    {
        var application = fact.Application
            ?? throw new InvalidOperationException("Media fact requires application.");
        var kind = fact.MediaKind
            ?? throw new InvalidOperationException("Media fact requires mediaKind.");
        var presentation = fact.MediaPresentation
            ?? throw new InvalidOperationException("Media fact requires mediaPresentation.");
        var key = MediaKey(application, kind, presentation);
        var observations = state.MediaObservations.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        var lanes = state.MediaLanes.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        var observation = new MediaObservation(application, kind, presentation, fact.MediaEvidence, fact.PlaybackState);

        if (fact.PlaybackState == MediaPlaybackState.Playing && IsSystemAvailable(state))
        {
            observations[key] = observation;
            if (lanes.TryGetValue(key, out var existing))
            {
                lanes[key] = existing with
                {
                    LastEvidenceWallTimeMs = fact.WallTimeMs,
                    LastEvidenceMonotonicTimeMs = fact.MonotonicTimeMs,
                };
            }
            else
            {
                lanes[key] = new OpenMediaLane(
                    application,
                    kind,
                    presentation,
                    state.ClockEpochId,
                    fact.WallTimeMs,
                    fact.MonotonicTimeMs,
                    fact.WallTimeMs,
                    fact.MonotonicTimeMs);
            }
        }
        else
        {
            observations.Remove(key);
            if (lanes.Remove(key, out var existing))
            {
                completed.Add(CloseMedia(state.RuntimeSessionID, existing, fact, SegmentEndReason.MediaStopped, EstimatedMetadata.Exact));
            }
            else
            {
                usage.Add(DiagnosticFor(
                    state,
                    fact,
                    lanes.Count == 0 ? "noOpenLane" : "targetConflict",
                    "Media close did not match an open lane.",
                    application));
            }
        }

        state = state with { MediaObservations = observations, MediaLanes = lanes };
    }

    private static void ApplyCheckpoint(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> media)
    {
        if (fact.Confirmation == CheckpointConfirmation.Failed)
        {
            CloseUnconfirmed(ref state, fact, usage, media);
            return;
        }

        var hadForegroundLane = state.ForegroundLane is not null;
        CloseConfirmedCheckpoint(ref state, fact, usage, media);
        if (fact.Snapshot is { } snapshot)
        {
            state = state with
            {
                ForegroundApplication = snapshot.ForegroundApplication,
                ForegroundWindowState = snapshot.ForegroundWindowState,
                ForegroundMediaEvidence = snapshot.ForegroundMediaEvidence,
                ForegroundPlaybackState = snapshot.ForegroundPlaybackState,
                UserActivity = snapshot.UserActivity,
                SessionState = snapshot.SessionState,
                PowerState = snapshot.PowerState,
            };
        }

        if (!hadForegroundLane && ForegroundBasis(state) is ActivityBasis basis && state.ForegroundApplication is { } app)
        {
            var available = StateElapsed(state, fact);
            var duration = Math.Min(available, AccountingV2Constants.EstimatedGapCapMilliseconds);
            if (duration > 0)
            {
                usage.Add(UsageSegmentV2.Create(
                    state.RuntimeSessionID,
                    app,
                    UsageChannel.Active,
                    ActivityBasis.EstimatedBackfill,
                    state.ClockEpochId,
                    fact.WallTimeMs - duration,
                    fact.WallTimeMs,
                    fact.MonotonicTimeMs - duration,
                    fact.MonotonicTimeMs,
                    SegmentEndReason.StateCorrection,
                    new EstimatedMetadata(true, "missingOpenLane", AccountingV2Constants.EstimatedGapCapMilliseconds),
                    fact.WallTimeMs,
                    fact.MonotonicTimeMs));
            }
        }

        ReconcileOpenLanes(ref state, fact);
    }

    private static void CloseConfirmedCheckpoint(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> media)
    {
        foreach (var lane in EnumerateUsageLanes(state))
        {
            var duration = Math.Min(
                Math.Max(0, fact.MonotonicTimeMs - lane.StartMonotonicTimeMs),
                AccountingV2Constants.CheckpointIntervalMilliseconds);
            usage.Add(CloseUsageAtDuration(
                state.RuntimeSessionID,
                lane,
                duration,
                SegmentEndReason.PeriodicSnapshot,
                EstimatedMetadata.Exact));
        }
        foreach (var lane in EnumerateMediaLanes(state))
        {
            var duration = Math.Min(
                Math.Max(0, fact.MonotonicTimeMs - lane.StartMonotonicTimeMs),
                AccountingV2Constants.CheckpointIntervalMilliseconds);
            media.Add(CloseMediaAtDuration(
                state.RuntimeSessionID,
                lane,
                duration,
                SegmentEndReason.PeriodicSnapshot,
                EstimatedMetadata.Exact));
        }
        state = state with
        {
            ForegroundLane = null,
            PipLanes = new Dictionary<string, OpenAccountingLane>(),
            MediaLanes = new Dictionary<string, OpenMediaLane>(),
        };
    }

    private static void ApplyRecovery(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> media)
    {
        foreach (var lane in EnumerateUsageLanes(state))
        {
            var duration = Math.Min(
                Math.Max(0, fact.MonotonicTimeMs - lane.StartMonotonicTimeMs),
                AccountingV2Constants.EstimatedGapCapMilliseconds);
            usage.Add(CloseUsageAtDuration(
                state.RuntimeSessionID,
                lane,
                duration,
                SegmentEndReason.ServiceRecovery,
                new EstimatedMetadata(true, "serviceRecovery", AccountingV2Constants.EstimatedGapCapMilliseconds)));
        }

        foreach (var lane in EnumerateMediaLanes(state))
        {
            var duration = Math.Min(
                Math.Max(0, fact.MonotonicTimeMs - lane.StartMonotonicTimeMs),
                AccountingV2Constants.EstimatedGapCapMilliseconds);
            media.Add(CloseMediaAtDuration(
                state.RuntimeSessionID,
                lane,
                duration,
                SegmentEndReason.ServiceRecovery,
                new EstimatedMetadata(true, "serviceRecovery", AccountingV2Constants.EstimatedGapCapMilliseconds)));
        }

        state = state with
        {
            ForegroundLane = null,
            PipLanes = new Dictionary<string, OpenAccountingLane>(),
            MediaLanes = new Dictionary<string, OpenMediaLane>(),
        };
    }

    private static void CloseUnconfirmed(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> media)
    {
        foreach (var lane in EnumerateUsageLanes(state))
        {
            var duration = Math.Min(
                Math.Max(0, fact.MonotonicTimeMs - lane.StartMonotonicTimeMs),
                AccountingV2Constants.EstimatedGapCapMilliseconds);
            usage.Add(CloseUsageAtDuration(
                state.RuntimeSessionID,
                lane,
                duration,
                SegmentEndReason.CheckpointUnconfirmed,
                new EstimatedMetadata(true, "checkpointUnconfirmed", AccountingV2Constants.EstimatedGapCapMilliseconds)));
        }

        foreach (var lane in EnumerateMediaLanes(state))
        {
            var gap = Math.Max(0, fact.MonotonicTimeMs - lane.LastEvidenceMonotonicTimeMs);
            var extension = Math.Min(gap / 2, AccountingV2Constants.EstimatedGapCapMilliseconds);
            var duration = Math.Max(0, lane.LastEvidenceMonotonicTimeMs - lane.StartMonotonicTimeMs) + extension;
            media.Add(CloseMediaAtDuration(
                state.RuntimeSessionID,
                lane,
                duration,
                SegmentEndReason.CheckpointUnconfirmed,
                new EstimatedMetadata(true, "mediaConfirmationFailed", AccountingV2Constants.EstimatedGapCapMilliseconds)));
        }

        state = state with
        {
            ForegroundLane = null,
            PipLanes = new Dictionary<string, OpenAccountingLane>(),
            MediaLanes = new Dictionary<string, OpenMediaLane>(),
        };
    }

    private static void CloseAll(
        ref AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        SegmentEndReason reason,
        List<UsageSegmentV2> usage,
        List<MediaSegmentV2> media,
        bool exactWallFromMonotonic = false)
    {
        foreach (var lane in EnumerateUsageLanes(state))
        {
            usage.Add(CloseUsage(state.RuntimeSessionID, lane, fact, reason, EstimatedMetadata.Exact, exactWallFromMonotonic));
        }

        foreach (var lane in EnumerateMediaLanes(state))
        {
            media.Add(CloseMedia(state.RuntimeSessionID, lane, fact, reason, EstimatedMetadata.Exact, exactWallFromMonotonic));
        }

        state = state with
        {
            ForegroundLane = null,
            PipLanes = new Dictionary<string, OpenAccountingLane>(),
            MediaLanes = new Dictionary<string, OpenMediaLane>(),
        };
    }

    private static IEnumerable<OpenAccountingLane> EnumerateUsageLanes(AccountingRuntimeState state)
    {
        if (state.ForegroundLane is not null)
        {
            yield return state.ForegroundLane;
        }

        foreach (var lane in state.PipLanes.OrderBy(item => item.Key, StringComparer.Ordinal).Select(item => item.Value))
        {
            yield return lane;
        }
    }

    private static IEnumerable<OpenMediaLane> EnumerateMediaLanes(AccountingRuntimeState state)
    {
        return state.MediaLanes.OrderBy(item => item.Key, StringComparer.Ordinal).Select(item => item.Value);
    }

    private static bool HasAnyOpenLane(AccountingRuntimeState state)
    {
        return state.ForegroundLane is not null || state.PipLanes.Count > 0 || state.MediaLanes.Count > 0;
    }

    private static UsageSegmentV2 DiagnosticFor(
        AccountingRuntimeState state,
        AccountingRuntimeFact fact,
        string code,
        string message,
        ApplicationIdentity? application = null)
    {
        return UsageSegmentV2.Create(
            state.RuntimeSessionID,
            application ?? fact.Application ?? state.ForegroundApplication,
            UsageChannel.Diagnostic,
            ActivityBasis.Diagnostic,
            state.ClockEpochId,
            Math.Max(0, fact.WallTimeMs),
            Math.Max(0, fact.WallTimeMs),
            Math.Max(0, fact.MonotonicTimeMs),
            Math.Max(0, fact.MonotonicTimeMs),
            SegmentEndReason.Diagnostic,
            EstimatedMetadata.Exact,
            null,
            null,
            diagnostic: true,
            diagnosticCode: code,
            diagnosticMessage: message);
    }

    private static void ReconcileOpenLanes(ref AccountingRuntimeState state, AccountingRuntimeFact fact)
    {
        EnsureForegroundOpen(ref state, fact);
        var lanes = state.PipLanes.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        foreach (var (key, observation) in state.PipObservations)
        {
            if (IsPipEligible(state, observation) && !lanes.ContainsKey(key))
            {
                lanes[key] = OpenUsage(
                    observation.Application,
                    UsageChannel.PipActive,
                    ActivityBasis.PipStrongMedia,
                    state.ClockEpochId,
                    fact);
            }
        }

        var mediaLanes = state.MediaLanes.ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);
        foreach (var (key, observation) in state.MediaObservations)
        {
            if (IsSystemAvailable(state)
                && observation.PlaybackState == MediaPlaybackState.Playing
                && !mediaLanes.ContainsKey(key))
            {
                mediaLanes[key] = new OpenMediaLane(
                    observation.Application,
                    observation.MediaKind,
                    observation.Presentation,
                    state.ClockEpochId,
                    fact.WallTimeMs,
                    fact.MonotonicTimeMs,
                    fact.WallTimeMs,
                    fact.MonotonicTimeMs);
            }
        }

        state = state with { PipLanes = lanes, MediaLanes = mediaLanes };
    }

    private static void EnsureForegroundOpen(ref AccountingRuntimeState state, AccountingRuntimeFact fact)
    {
        if (state.ForegroundLane is not null
            || state.ForegroundApplication is not { } application
            || ForegroundBasis(state) is not ActivityBasis basis)
        {
            return;
        }

        state = state with
        {
            ForegroundLane = OpenUsage(application, UsageChannel.Active, basis, state.ClockEpochId, fact),
        };
    }

    private static ActivityBasis? ForegroundBasis(AccountingRuntimeState state)
    {
        if (!IsSystemAvailable(state) || state.ForegroundApplication is null)
        {
            return null;
        }

        if (state.UserActivity == UserActivityState.Active)
        {
            return ActivityBasis.ForegroundInteraction;
        }

        if (state.UserActivity == UserActivityState.Idle
            && state.ForegroundMediaEvidence == MediaEvidenceLevel.Strong
            && state.ForegroundPlaybackState == MediaPlaybackState.Playing
            && state.ForegroundWindowState == WindowPresentationState.Visible)
        {
            return ActivityBasis.ForegroundStrongMedia;
        }

        return null;
    }

    private static bool IsPipEligible(AccountingRuntimeState state, PipObservation observation)
    {
        return IsSystemAvailable(state)
            && observation.MediaEvidence == MediaEvidenceLevel.Strong
            && observation.PlaybackState == MediaPlaybackState.Playing
            && observation.WindowState == WindowPresentationState.Visible;
    }

    private static bool IsSystemAvailable(AccountingRuntimeState state)
    {
        return state.SessionState == UserSessionState.Active
            && state.PowerState == SystemPowerState.Awake;
    }

    private static OpenAccountingLane OpenUsage(
        ApplicationIdentity application,
        UsageChannel channel,
        ActivityBasis basis,
        string epoch,
        AccountingRuntimeFact fact)
    {
        return new OpenAccountingLane(
            application,
            channel,
            basis,
            epoch,
            fact.WallTimeMs,
            fact.MonotonicTimeMs,
            fact.WallTimeMs,
            fact.MonotonicTimeMs);
    }

    private static UsageSegmentV2 CloseUsage(
        string runtimeSessionID,
        OpenAccountingLane lane,
        AccountingRuntimeFact fact,
        SegmentEndReason reason,
        EstimatedMetadata estimated,
        bool wallFromMonotonic = false)
    {
        var endMono = Math.Max(lane.StartMonotonicTimeMs, fact.MonotonicTimeMs);
        var endWall = wallFromMonotonic
            ? lane.StartWallTimeMs + (endMono - lane.StartMonotonicTimeMs)
            : Math.Max(lane.StartWallTimeMs, fact.WallTimeMs);
        return UsageSegmentV2.Create(
            runtimeSessionID,
            lane.Application,
            lane.Channel,
            lane.ActivityBasis,
            lane.ClockEpochId,
            lane.StartWallTimeMs,
            endWall,
            lane.StartMonotonicTimeMs,
            endMono,
            reason,
            estimated,
            lane.LastEvidenceWallTimeMs,
            lane.LastEvidenceMonotonicTimeMs);
    }

    private static UsageSegmentV2 CloseUsageAtDuration(
        string runtimeSessionID,
        OpenAccountingLane lane,
        long duration,
        SegmentEndReason reason,
        EstimatedMetadata estimated)
    {
        return UsageSegmentV2.Create(
            runtimeSessionID,
            lane.Application,
            lane.Channel,
            lane.ActivityBasis,
            lane.ClockEpochId,
            lane.StartWallTimeMs,
            lane.StartWallTimeMs + duration,
            lane.StartMonotonicTimeMs,
            lane.StartMonotonicTimeMs + duration,
            reason,
            estimated,
            lane.LastEvidenceWallTimeMs,
            lane.LastEvidenceMonotonicTimeMs);
    }

    private static MediaSegmentV2 CloseMedia(
        string runtimeSessionID,
        OpenMediaLane lane,
        AccountingRuntimeFact fact,
        SegmentEndReason reason,
        EstimatedMetadata estimated,
        bool wallFromMonotonic = false)
    {
        var endMono = Math.Max(lane.StartMonotonicTimeMs, fact.MonotonicTimeMs);
        var endWall = wallFromMonotonic
            ? lane.StartWallTimeMs + (endMono - lane.StartMonotonicTimeMs)
            : Math.Max(lane.StartWallTimeMs, fact.WallTimeMs);
        return MediaSegmentV2.Create(
            runtimeSessionID,
            lane.Application,
            lane.MediaKind,
            lane.Presentation,
            lane.ClockEpochId,
            lane.StartWallTimeMs,
            endWall,
            lane.StartMonotonicTimeMs,
            endMono,
            reason,
            estimated,
            lane.LastEvidenceWallTimeMs,
            lane.LastEvidenceMonotonicTimeMs);
    }

    private static MediaSegmentV2 CloseMediaAtDuration(
        string runtimeSessionID,
        OpenMediaLane lane,
        long duration,
        SegmentEndReason reason,
        EstimatedMetadata estimated)
    {
        return MediaSegmentV2.Create(
            runtimeSessionID,
            lane.Application,
            lane.MediaKind,
            lane.Presentation,
            lane.ClockEpochId,
            lane.StartWallTimeMs,
            lane.StartWallTimeMs + duration,
            lane.StartMonotonicTimeMs,
            lane.StartMonotonicTimeMs + duration,
            reason,
            estimated,
            lane.LastEvidenceWallTimeMs,
            lane.LastEvidenceMonotonicTimeMs);
    }

    private static bool SameApplication(ApplicationIdentity? left, ApplicationIdentity? right)
    {
        return left?.Platform == right?.Platform
            && string.Equals(left?.RuntimeIdentity, right?.RuntimeIdentity, StringComparison.Ordinal);
    }

    private static string ApplicationKey(ApplicationIdentity application)
    {
        return $"{application.Platform.ToString().ToLowerInvariant()}:{application.RuntimeIdentity}";
    }

    private static string MediaKey(ApplicationIdentity application, MediaKind kind, MediaPresentation presentation)
    {
        return $"{ApplicationKey(application)}:{AccountingSegmentId.Wire(kind)}:{AccountingSegmentId.Wire(presentation)}";
    }

    private static long StateElapsed(AccountingRuntimeState state, AccountingRuntimeFact fact)
    {
        return state.LastProcessedMonotonicTimeMs is long last
            ? Math.Max(0, fact.MonotonicTimeMs - last)
            : 0;
    }

    private static string RequireText(string? value, string name)
    {
        return string.IsNullOrWhiteSpace(value)
            ? throw new InvalidOperationException($"Accounting fact requires {name}.")
            : value;
    }
}

public sealed class AccountingReorderBufferV2
{
    private readonly AccountingStateMachineV2 _stateMachine;
    private readonly List<(long Sequence, AccountingRuntimeFact Fact)> _pending = new();
    private long _sequence;
    private long _maximumSeen = -1;
    private long _lastEmitted = -1;

    public AccountingReorderBufferV2(AccountingStateMachineV2 stateMachine)
    {
        _stateMachine = stateMachine ?? throw new ArgumentNullException(nameof(stateMachine));
    }

    public AccountingRuntimeState State => _stateMachine.State;

    public AccountingTransition Push(AccountingRuntimeFact fact)
    {
        if (fact.MonotonicTimeMs < _lastEmitted)
        {
            return _stateMachine.ApplyLate(fact);
        }

        _maximumSeen = Math.Max(_maximumSeen, fact.MonotonicTimeMs);
        _pending.Add((_sequence++, fact));
        return Drain(_maximumSeen - AccountingV2Constants.ReorderWindowMilliseconds);
    }

    public AccountingTransition Flush()
    {
        return Drain(long.MaxValue);
    }

    private AccountingTransition Drain(long watermark)
    {
        var ready = _pending
            .Where(item => item.Fact.MonotonicTimeMs <= watermark)
            .OrderBy(item => item.Fact.MonotonicTimeMs)
            .ThenBy(item => item.Fact.SafetyPriority)
            .ThenBy(item => item.Sequence)
            .ToArray();
        var usage = new List<UsageSegmentV2>();
        var media = new List<MediaSegmentV2>();
        foreach (var item in ready)
        {
            _pending.Remove(item);
            var transition = item.Fact.MonotonicTimeMs < _lastEmitted
                ? _stateMachine.ApplyLate(item.Fact)
                : _stateMachine.ApplyOrdered(item.Fact);
            usage.AddRange(transition.UsageSegments);
            media.AddRange(transition.MediaSegments);
            _lastEmitted = Math.Max(_lastEmitted, item.Fact.MonotonicTimeMs);
        }

        return new AccountingTransition(_stateMachine.State, usage, media);
    }
}

public static class AccountingReadModel
{
    public static long UnionDuration(IEnumerable<UsageSegmentV2> segments)
    {
        var intervals = segments
            .Where(segment => segment.AuthoritativeForUsage && segment.MonotonicDurationMilliseconds > 0)
            .OrderBy(segment => segment.StartMonotonicTimeMs)
            .ThenBy(segment => segment.EndMonotonicTimeMs)
            .Select(segment => (Start: segment.StartMonotonicTimeMs, End: segment.EndMonotonicTimeMs))
            .ToArray();
        if (intervals.Length == 0)
        {
            return 0;
        }

        long total = 0;
        var currentStart = intervals[0].Start;
        var currentEnd = intervals[0].End;
        foreach (var interval in intervals.Skip(1))
        {
            if (interval.Start <= currentEnd)
            {
                currentEnd = Math.Max(currentEnd, interval.End);
                continue;
            }

            total += currentEnd - currentStart;
            currentStart = interval.Start;
            currentEnd = interval.End;
        }

        return total + currentEnd - currentStart;
    }

    public static long MediaPlaybackTotal(IEnumerable<MediaSegmentV2> segments)
    {
        return segments.Sum(segment => segment.MonotonicDurationMilliseconds);
    }
}
