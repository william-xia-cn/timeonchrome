using System.Diagnostics;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using Microsoft.Data.Sqlite;
using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;

namespace TimeOnChrome.AppRuntime.Service;

internal sealed class RuntimeServiceCoordinator : IAsyncDisposable
{
    private readonly MachineRuntimePaths paths = MachineRuntimePaths.ForMachine();
    private readonly MachineCredentialStore credentialStore;
    private readonly MachinePolicyStore policyStore;
    private readonly WindowsSessionLauncher sessionLauncher = new();
    private readonly CancellationTokenSource cancellation = new();
    private readonly Dictionary<int, Process> agents = [];
    private readonly Dictionary<int, Task> listeners = [];
    private readonly Dictionary<int, SessionRuntime> sessions = [];
    private readonly HashSet<int> missingBinaryReported = [];
    private readonly SemaphoreSlim stateGate = new(1, 1);
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private MachineRuntimeApiClient api;
    private MachineRuntimeCredential? credential;
    private MachineSegmentLedger? ledger;
    private MachineTerminalLogStore? terminalLogs;
    private MachineUserIdentityDeriver? identityDeriver;
    private AppliedMachinePolicy? appliedPolicy;
    private string? policyEtag;
    private int tamperCount;
    private bool stopping;
    private Task[] loops = [];

    public RuntimeServiceCoordinator()
    {
        credentialStore = new MachineCredentialStore(paths.CredentialPath);
        policyStore = new MachinePolicyStore(paths.PolicyPath);
        api = new MachineRuntimeApiClient(http);
    }

    public async Task StartAsync()
    {
        Directory.CreateDirectory(paths.RootDirectory);
        terminalLogs = new MachineTerminalLogStore(paths.DatabasePath);
        await terminalLogs.InitializeAsync(cancellation.Token).ConfigureAwait(false);
        identityDeriver = new MachineUserIdentityDeriver(
            await MachineUserIdentityDeriver.LoadOrCreateKeyAsync(paths.MachineKeyPath, cancellation.Token).ConfigureAwait(false));
        credential = await credentialStore.LoadAsync(cancellation.Token).ConfigureAwait(false);
        appliedPolicy = await policyStore.LoadAsync(cancellation.Token).ConfigureAwait(false);
        if (credential is not null) await InitializeLedgerAsync(credential).ConfigureAwait(false);
        await WriteLogAsync("info", "service", "service_started", "service", "service_started").ConfigureAwait(false);
        loops =
        [
            RunResilientLoopAsync("control", ControlLoopAsync, cancellation.Token),
            RunResilientLoopAsync("supervisor", SupervisorLoopAsync, cancellation.Token),
            RunResilientLoopAsync("policy", PolicyLoopAsync, cancellation.Token),
            RunResilientLoopAsync("upload", UploadLoopAsync, cancellation.Token),
            RunResilientLoopAsync("heartbeat", HeartbeatLoopAsync, cancellation.Token),
        ];
    }

    private async Task RunResilientLoopAsync(
        string name,
        Func<CancellationToken, Task> loop,
        CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await loop(cancellationToken).ConfigureAwait(false);
                if (!cancellationToken.IsCancellationRequested)
                    await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken).ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                return;
            }
            catch (Exception exception)
            {
                await WriteLogAsync("error", "service", "loop_failed", "service-loop", "loop_failed",
                    new Dictionary<string, object> { ["loop"] = name, ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
                TryLogLoopFailure(name);
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private static void TryLogLoopFailure(string name)
    {
        try
        {
            EventLog.WriteEntry(
                "TimeOnChromeAppRuntime",
                $"Runtime Service loop '{name}' failed and will restart.",
                EventLogEntryType.Error);
        }
        catch (Exception loggingException) when (loggingException is InvalidOperationException
            or System.ComponentModel.Win32Exception or UnauthorizedAccessException)
        {
            // Logging failure must not prevent the loop from recovering.
        }
    }

    public async Task HandleSessionUnavailableAsync(int sessionId)
    {
        await stateGate.WaitAsync().ConfigureAwait(false);
        try { await CloseSessionUnsafeAsync(sessionId, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).ConfigureAwait(false); }
        finally { _ = stateGate.Release(); }
    }

    public async Task StopAsync()
    {
        if (stopping) return;
        stopping = true;
        await WriteLogAsync("info", "service", "service_stopping", "service", "service_stopping").ConfigureAwait(false);
        cancellation.Cancel();
        await stateGate.WaitAsync().ConfigureAwait(false);
        try
        {
            foreach (var sessionId in sessions.Keys.ToArray())
                await CloseSessionUnsafeAsync(sessionId, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()).ConfigureAwait(false);
            foreach (var process in agents.Values)
            {
                try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
                catch (InvalidOperationException) { }
                process.Dispose();
            }
            agents.Clear();
        }
        finally { _ = stateGate.Release(); }
        foreach (var loop in loops)
        {
            try { await loop.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
        }
    }

    private async Task InitializeLedgerAsync(MachineRuntimeCredential machineCredential)
    {
        ledger = new MachineSegmentLedger(paths.DatabasePath);
        await ledger.InitializeAsync(machineCredential.MachineId, cancellation.Token).ConfigureAwait(false);
        var restored = await ledger.RestoreAccountingSessionsAsync(cancellation.Token).ConfigureAwait(false);
        await WriteLogAsync("info", "storage", "ledger_initialized", "ledger", "ledger_initialized",
            new Dictionary<string, object> { ["recoveryCount"] = restored.Count }).ConfigureAwait(false);
        foreach (var item in restored)
        {
            var session = new MachineAccountingSession(
                ledger,
                item.LocalUserId,
                item.AssignmentVersion,
                item.State);
            var wallTimeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            var monotonicTimeMs = Math.Max(Environment.TickCount64, item.State.LastProcessedMonotonicTimeMs ?? 0);
            _ = await session.PushAndPersistAsync(new AccountingRuntimeFact(
                wallTimeMs,
                monotonicTimeMs,
                item.State.ClockEpochId,
                AccountingFactKind.Recovery), cancellation.Token).ConfigureAwait(false);
            _ = await session.FlushAndPersistAsync(cancellation.Token).ConfigureAwait(false);
            await ledger.RemoveAccountingOpenStateAsync(
                item.LocalUserId,
                item.State.RuntimeSessionID,
                cancellation.Token).ConfigureAwait(false);
        }
    }

    private async Task ControlLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var security = new PipeSecurity();
            security.AddAccessRule(new PipeAccessRule(
                new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                PipeAccessRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new PipeAccessRule(
                new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null),
                PipeAccessRights.ReadWrite, AccessControlType.Allow));
            await using var pipe = NamedPipeServerStreamAcl.Create(
                SessionPipeNames.Control, PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous, 4096, 4096, security);
            await pipe.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
            var isAdministrator = false;
            pipe.RunAsClient(() =>
            {
                using var identity = WindowsIdentity.GetCurrent(true);
                isAdministrator = identity is not null
                    && new WindowsPrincipal(identity).IsInRole(WindowsBuiltInRole.Administrator);
            });
            using var reader = new StreamReader(pipe, leaveOpen: true);
            using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
            if (!isAdministrator)
            {
                await WriteLogAsync("warning", "security", "control_admin_required", "control-pipe",
                    "control_admin_required").ConfigureAwait(false);
                await writer.WriteLineAsync(JsonSerializer.Serialize(
                    new MachineControlResponse(false, "denied", "ADMIN_REQUIRED"), RuntimeJson.Options)).ConfigureAwait(false);
                continue;
            }
            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            try
            {
                var command = JsonSerializer.Deserialize<MachineControlCommand>(line ?? string.Empty, RuntimeJson.Options)
                    ?? throw new InvalidDataException("Enrollment command is empty.");
                if (string.Equals(command.Action, "status", StringComparison.Ordinal))
                {
                    await writer.WriteLineAsync(JsonSerializer.Serialize(
                        new MachineControlResponse(true,
                            credential is null ? "unpaired" : appliedPolicy is null ? "pendingPolicy" : "online",
                            ServiceVersion: Assembly.GetExecutingAssembly().GetName().Version?.ToString(),
                            UpdatedAtMs: DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()), RuntimeJson.Options)).ConfigureAwait(false);
                    continue;
                }
                if (!string.Equals(command.Action, "enroll", StringComparison.Ordinal)
                    && !string.Equals(command.Action, "uninstall", StringComparison.Ordinal)
                    || string.IsNullOrWhiteSpace(command.Code))
                {
                    throw new InvalidDataException("Control command is invalid.");
                }
                if (string.Equals(command.Action, "uninstall", StringComparison.Ordinal))
                {
                    if (credential is null) throw new InvalidDataException("Machine is not enrolled.");
                    await api.AuthorizeUninstallAsync(credential, command.Code, cancellationToken).ConfigureAwait(false);
                    await WriteLogAsync("info", "security", "uninstall_authorized", "control-pipe",
                        "uninstall_authorized").ConfigureAwait(false);
                    await writer.WriteLineAsync(JsonSerializer.Serialize(
                        new MachineControlResponse(true, "uninstallAuthorized"), RuntimeJson.Options)).ConfigureAwait(false);
                    continue;
                }
                if (credential is not null)
                {
                    await writer.WriteLineAsync(JsonSerializer.Serialize(
                        new MachineControlResponse(true, "alreadyEnrolled"), RuntimeJson.Options)).ConfigureAwait(false);
                    continue;
                }
                var enrolled = await api.EnrollAsync(RuntimeProductConfiguration.ServerUrl, command.Code,
                    command.DisplayName ?? Environment.MachineName, cancellationToken).ConfigureAwait(false);
                await credentialStore.SaveAsync(enrolled, cancellationToken).ConfigureAwait(false);
                credential = enrolled;
                await InitializeLedgerAsync(enrolled).ConfigureAwait(false);
                await WriteLogAsync("info", "service", "machine_enrolled", "control-pipe", "machine_enrolled").ConfigureAwait(false);
                await writer.WriteLineAsync(JsonSerializer.Serialize(
                    new MachineControlResponse(true, "enrolled"), RuntimeJson.Options)).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or InvalidDataException or JsonException)
            {
                await WriteLogAsync("warning", "security", "control_command_failed", "control-pipe",
                    "control_command_failed", new Dictionary<string, object> { ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
                await writer.WriteLineAsync(JsonSerializer.Serialize(
                    new MachineControlResponse(false, "failed", exception is RuntimeApiException apiError && apiError.StatusCode == 401
                        ? "PAIRING_CODE_INVALID" : "ENROLLMENT_FAILED"), RuntimeJson.Options)).ConfigureAwait(false);
            }
        }
    }

    private async Task SupervisorLoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        do
        {
            if (credential is not null && identityDeriver is not null)
            {
                var interactive = sessionLauncher.Enumerate();
                var reports = interactive.Select(item => new MachineUserReport(
                    identityDeriver.Derive(item.Sid), item.DisplayName, item.Active)).ToArray();
                try { await api.ReportUsersAsync(credential, reports, cancellationToken).ConfigureAwait(false); }
                catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException) { }
                foreach (var session in interactive.Where(item => item.Active))
                {
                    var localUserId = identityDeriver.Derive(session.Sid);
                    var assignment = appliedPolicy is null ? null : MachinePolicyStore.AssignmentFor(appliedPolicy.Policy, localUserId);
                    if (assignment?.Protected != true) continue;
                    EnsureListener(session, localUserId, cancellationToken);
                    await EnsureAgentAsync(session, localUserId, cancellationToken).ConfigureAwait(false);
                }
            }
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private void EnsureListener(InteractiveSession session, string localUserId, CancellationToken cancellationToken)
    {
        if (listeners.TryGetValue(session.SessionId, out var listener) && !listener.IsCompleted) return;
        listeners[session.SessionId] = FactPipeLoopAsync(session, localUserId, cancellationToken);
    }

    private async Task EnsureAgentAsync(InteractiveSession session, string localUserId, CancellationToken cancellationToken)
    {
        lock (agents)
        {
            if (agents.TryGetValue(session.SessionId, out var existing) && !existing.HasExited) return;
        }
        var executable = Path.Combine(AppContext.BaseDirectory, "TimeOnChrome.AppRuntime.SessionAgent.exe");
        if (!File.Exists(executable))
        {
            if (ledger is not null && missingBinaryReported.Add(session.SessionId))
            {
                tamperCount += 1;
                await ledger.RecordTamperAsync(localUserId, "session_agent_binary_missing",
                    $"session:{session.SessionId}", cancellationToken).ConfigureAwait(false);
                await WriteLogAsync("error", "security", "session_agent_binary_missing", "session-supervisor",
                    "session_agent_binary_missing", new Dictionary<string, object> { ["tamperCount"] = tamperCount }).ConfigureAwait(false);
            }
            return;
        }
        _ = missingBinaryReported.Remove(session.SessionId);
        var process = sessionLauncher.Start(session.SessionId, executable);
        await WriteLogAsync("info", "session", "session_agent_started", "session-supervisor",
            "session_agent_started").ConfigureAwait(false);
        process.EnableRaisingEvents = true;
        process.Exited += async (_, _) => await AgentExitedAsync(session.SessionId).ConfigureAwait(false);
        lock (agents) agents[session.SessionId] = process;
    }

    private async Task AgentExitedAsync(int sessionId)
    {
        if (stopping || ledger is null) return;
        tamperCount += 1;
        sessions.TryGetValue(sessionId, out var runtime);
        await ledger.RecordTamperAsync(runtime?.LocalUserId, "session_agent_terminated", $"session:{sessionId}").ConfigureAwait(false);
        await WriteLogAsync("warning", "security", "session_agent_terminated", "session-supervisor",
            "session_agent_terminated", new Dictionary<string, object> { ["tamperCount"] = tamperCount }).ConfigureAwait(false);
        await HandleSessionUnavailableAsync(sessionId).ConfigureAwait(false);
        var interactive = sessionLauncher.Enumerate().FirstOrDefault(item => item.SessionId == sessionId && item.Active);
        if (interactive is not null && identityDeriver is not null)
        {
            var localUserId = identityDeriver.Derive(interactive.Sid);
            var assignment = appliedPolicy is null ? null : MachinePolicyStore.AssignmentFor(appliedPolicy.Policy, localUserId);
            if (assignment?.Protected == true)
                await EnsureAgentAsync(interactive, localUserId, cancellation.Token).ConfigureAwait(false);
        }
    }

    private async Task FactPipeLoopAsync(InteractiveSession session, string localUserId, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var security = new PipeSecurity();
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null), PipeAccessRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new PipeAccessRule(new SecurityIdentifier(session.Sid), PipeAccessRights.ReadWrite, AccessControlType.Allow));
            await using var pipe = NamedPipeServerStreamAcl.Create(
                SessionPipeNames.Facts(session.SessionId), PipeDirection.InOut, 1, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous, 8192, 8192, security);
            await pipe.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
            if (!ValidatePipeClient(pipe, session))
            {
                await WriteLogAsync("warning", "security", "session_pipe_client_rejected", "fact-pipe",
                    "session_pipe_client_rejected").ConfigureAwait(false);
                pipe.Disconnect();
                continue;
            }
            await WriteLogAsync("info", "session", "session_pipe_connected", "fact-pipe",
                "session_pipe_connected").ConfigureAwait(false);
            using var reader = new StreamReader(pipe, leaveOpen: true);
            while (pipe.IsConnected && !cancellationToken.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
                if (line is null) break;
                var message = JsonSerializer.Deserialize<SessionAccountingFactMessage>(line, RuntimeJson.Options);
                if (message?.SchemaVersion != 2) continue;
                try
                {
                    await ApplyFactAsync(session.SessionId, localUserId, message.Fact, cancellationToken).ConfigureAwait(false);
                }
                catch (Exception) when (!cancellationToken.IsCancellationRequested)
                {
                    // The session retains the uncommitted fact and retries it on the next drain.
                }
            }
            await HandleSessionUnavailableAsync(session.SessionId).ConfigureAwait(false);
            await WriteLogAsync("info", "session", "session_pipe_disconnected", "fact-pipe",
                "session_pipe_disconnected").ConfigureAwait(false);
        }
    }

    private static bool ValidatePipeClient(NamedPipeServerStream pipe, InteractiveSession expected)
    {
        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out var processId)) return false;
        try
        {
            using var process = Process.GetProcessById(checked((int)processId));
            if (process.SessionId != expected.SessionId) return false;
        }
        catch (ArgumentException) { return false; }
        string? actualSid = null;
        pipe.RunAsClient(() =>
        {
            using var identity = WindowsIdentity.GetCurrent(true);
            actualSid = identity?.User?.Value;
        });
        return string.Equals(actualSid, expected.Sid, StringComparison.OrdinalIgnoreCase);
    }

    private async Task ApplyFactAsync(int sessionId, string localUserId, AccountingRuntimeFact fact, CancellationToken cancellationToken)
    {
        if (ledger is null || appliedPolicy is null) return;
        var assignment = MachinePolicyStore.AssignmentFor(appliedPolicy.Policy, localUserId);
        if (assignment?.Protected != true) return;
        await stateGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (!sessions.TryGetValue(sessionId, out var runtime)
                || runtime.Assignment.AssignmentVersion != assignment.AssignmentVersion)
            {
                await CloseSessionUnsafeAsync(sessionId, fact.WallTimeMs).ConfigureAwait(false);
                runtime = new SessionRuntime(localUserId, assignment,
                    new MachineAccountingSession(
                        ledger,
                        localUserId,
                        assignment.AssignmentVersion,
                        $"windows:{credential!.MachineId}:{localUserId}:{Guid.NewGuid():N}",
                        fact.ClockEpochId));
                sessions[sessionId] = runtime;
            }
            var application = fact.Application
                ?? fact.Snapshot?.ForegroundApplication
                ?? runtime.AccountingSession.DurableState.ForegroundApplication;
            var policySnapshot = MachinePolicyStore.SnapshotFor(appliedPolicy.Policy, assignment, application);
            _ = await runtime.AccountingSession.PushAndPersistAsync(
                fact with { PolicySnapshot = policySnapshot }, cancellationToken).ConfigureAwait(false);
        }
        finally { _ = stateGate.Release(); }
    }

    private async Task CloseSessionUnsafeAsync(int sessionId, long observedAtMs, long? observedMonotonicMs = null)
    {
        if (ledger is null || !sessions.Remove(sessionId, out var runtime)) return;
        var state = runtime.AccountingSession.DurableState;
        var closeWall = Math.Max(observedAtMs, state.LastProcessedWallTimeMs ?? 0);
        var closeMonotonic = Math.Max(observedMonotonicMs ?? Environment.TickCount64, state.LastProcessedMonotonicTimeMs ?? 0);
        _ = await runtime.AccountingSession.PushAndPersistAsync(new AccountingRuntimeFact(
            closeWall,
            closeMonotonic,
            state.ClockEpochId,
            AccountingFactKind.SessionChanged,
            SessionState: UserSessionState.Inactive)).ConfigureAwait(false);
        _ = await runtime.AccountingSession.FlushAndPersistAsync().ConfigureAwait(false);
        await ledger.RemoveAccountingOpenStateAsync(runtime.LocalUserId, state.RuntimeSessionID).ConfigureAwait(false);
    }

    private async Task PolicyLoopAsync(CancellationToken cancellationToken)
    {
        var delay = TimeSpan.FromMinutes(1);
        while (!cancellationToken.IsCancellationRequested)
        {
            if (credential is not null)
            {
                try
                {
                    var result = await api.GetPolicyAsync(credential, policyEtag, cancellationToken).ConfigureAwait(false);
                    if (result.Policy is not null)
                    {
                        await stateGate.WaitAsync(cancellationToken).ConfigureAwait(false);
                        try
                        {
                            var boundaryWall = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                            var boundaryMonotonic = Environment.TickCount64;
                            var accountingChanged = appliedPolicy is null
                                || MachinePolicyStore.RequiresAccountingBoundary(appliedPolicy.Policy, result.Policy);
                            var previous = accountingChanged ? sessions.ToDictionary(
                                item => item.Key,
                                item => (item.Value.LocalUserId, item.Value.AccountingSession.DurableState)) : [];
                            if (accountingChanged)
                            {
                                foreach (var sessionId in sessions.Keys.ToArray())
                                    await CloseSessionUnsafeAsync(sessionId, boundaryWall, boundaryMonotonic).ConfigureAwait(false);
                            }
                            appliedPolicy = new AppliedMachinePolicy(result.Policy,
                                boundaryWall, boundaryWall);
                            await policyStore.SaveAsync(appliedPolicy, cancellationToken).ConfigureAwait(false);
                            await WriteLogAsync("info", "policy", "policy_applied", "policy-loop", "policy_applied",
                                new Dictionary<string, object> { ["version"] = result.Policy.Version }).ConfigureAwait(false);
                            policyEtag = result.ETag;
                            foreach (var (sessionId, prior) in previous)
                            {
                                var assignment = MachinePolicyStore.AssignmentFor(result.Policy, prior.LocalUserId);
                                if (assignment?.Protected != true) continue;
                                var state = prior.DurableState with
                                {
                                    RuntimeSessionID = $"windows:{credential!.MachineId}:{prior.LocalUserId}:{Guid.NewGuid():N}",
                                    ForegroundLane = null,
                                    PipLanes = new Dictionary<string, OpenAccountingLane>(),
                                    MediaLanes = new Dictionary<string, OpenMediaLane>(),
                                    LastProcessedWallTimeMs = null,
                                    LastProcessedMonotonicTimeMs = null,
                                };
                                var accounting = new MachineAccountingSession(
                                    ledger!, prior.LocalUserId, assignment.AssignmentVersion, state);
                                var snapshot = new AccountingRuntimeSnapshot(
                                    state.ForegroundApplication, state.ForegroundWindowState,
                                    state.ForegroundMediaEvidence, state.ForegroundPlaybackState,
                                    state.UserActivity, state.SessionState, state.PowerState);
                                var policySnapshot = MachinePolicyStore.SnapshotFor(
                                    result.Policy, assignment, state.ForegroundApplication);
                                _ = await accounting.PushAndPersistAsync(new AccountingRuntimeFact(
                                    boundaryWall, boundaryMonotonic, state.ClockEpochId,
                                    AccountingFactKind.Checkpoint, Confirmation: CheckpointConfirmation.Confirmed,
                                    Snapshot: snapshot,
                                    PolicySnapshot: policySnapshot), cancellationToken).ConfigureAwait(false);
                                _ = await accounting.FlushAndPersistAsync(cancellationToken).ConfigureAwait(false);
                                sessions[sessionId] = new SessionRuntime(prior.LocalUserId, assignment, accounting);
                            }
                        }
                        finally { _ = stateGate.Release(); }
                        await api.AcknowledgePolicyAsync(credential,
                            new MachinePolicyAck(result.Policy.Version, "applied", null,
                                result.Policy.Users.Select(user => new MachineUserPolicyAck(user.LocalUserId, "applied")).ToArray()),
                            cancellationToken).ConfigureAwait(false);
                    }
                    delay = TimeSpan.FromMinutes(1);
                }
                catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
                {
                    await WriteLogAsync("warning", "policy", "policy_sync_failed", "policy-loop", "policy_sync_failed",
                        new Dictionary<string, object> { ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
                    delay = TimeSpan.FromMinutes(Math.Min(15, Math.Max(1, delay.TotalMinutes * 2)));
                }
            }
            await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task UploadLoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        do
        {
            if (credential is null || ledger is null) continue;
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await UploadLegacyAsync(credential, ledger, nowMs, cancellationToken).ConfigureAwait(false);
            await UploadAccountingUsageAsync(credential, ledger, nowMs, cancellationToken).ConfigureAwait(false);
            await UploadAccountingMediaAsync(credential, ledger, nowMs, cancellationToken).ConfigureAwait(false);
            await UploadTerminalLogsAsync(credential, nowMs, cancellationToken).ConfigureAwait(false);
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private async Task UploadLegacyAsync(
        MachineRuntimeCredential currentCredential,
        MachineSegmentLedger currentLedger,
        long nowMs,
        CancellationToken cancellationToken)
    {
        var pending = await currentLedger.PendingAsync(50, nowMs, cancellationToken).ConfigureAwait(false);
        if (pending.Count == 0) return;
        try
        {
            var acceptance = await api.UploadAsync(currentCredential,
                pending.Select(item => new MachineSegmentUpload(item.LocalUserId, item.AssignmentVersion, item.Segment)).ToArray(),
                cancellationToken).ConfigureAwait(false);
            var accepted = pending.Where(item => acceptance.AcceptedIds.Contains(item.Segment.Id, StringComparer.Ordinal))
                .Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet();
            await currentLedger.MarkAcceptedAsync(accepted, cancellationToken).ConfigureAwait(false);
            var rejectedIds = acceptance.Rejected.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            var retry = pending.Where(item => !acceptance.AcceptedIds.Contains(item.Segment.Id, StringComparer.Ordinal)
                    && !rejectedIds.Contains(item.Segment.Id))
                .Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet();
            await currentLedger.RecordFailureAsync(retry, "ACK_MISSING",
                DateTimeOffset.UtcNow.AddSeconds(30).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("info", "upload", "segment_upload_completed", "usage-upload", "segment_upload_completed",
                new Dictionary<string, object> { ["stream"] = "legacy", ["acceptedCount"] = accepted.Count, ["rejectedCount"] = rejectedIds.Count }).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await currentLedger.RecordFailureAsync(pending.Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet(),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "segment_upload_failed", "usage-upload", "segment_upload_failed",
                new Dictionary<string, object> { ["stream"] = "legacy", ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
        }
    }

    private async Task UploadAccountingUsageAsync(
        MachineRuntimeCredential currentCredential,
        MachineSegmentLedger currentLedger,
        long nowMs,
        CancellationToken cancellationToken)
    {
        var pending = await currentLedger.PendingAccountingUsageAsync(50, nowMs, cancellationToken).ConfigureAwait(false);
        if (pending.Count == 0) return;
        try
        {
            var acceptance = await api.UploadAccountingUsageAsync(currentCredential,
                pending.Select(item => new MachineAccountingUsageUpload(
                    item.LocalUserId, item.AssignmentVersion, item.Segment)).ToArray(),
                cancellationToken).ConfigureAwait(false);
            var accepted = pending.Where(item => acceptance.AcceptedIds.Contains(item.Segment.Id, StringComparer.Ordinal))
                .Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet();
            await currentLedger.MarkAccountingUsageAcceptedAsync(accepted, cancellationToken).ConfigureAwait(false);
            var rejected = acceptance.Rejected.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            var retry = pending.Where(item => !acceptance.AcceptedIds.Contains(item.Segment.Id, StringComparer.Ordinal)
                    && !rejected.Contains(item.Segment.Id))
                .Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet();
            await currentLedger.RecordAccountingUsageFailureAsync(retry, "ACK_MISSING",
                DateTimeOffset.UtcNow.AddSeconds(30).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("info", "upload", "segment_upload_completed", "usage-upload", "segment_upload_completed",
                new Dictionary<string, object> { ["stream"] = "usage", ["acceptedCount"] = accepted.Count, ["rejectedCount"] = rejected.Count }).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await currentLedger.RecordAccountingUsageFailureAsync(
                pending.Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet(),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "segment_upload_failed", "usage-upload", "segment_upload_failed",
                new Dictionary<string, object> { ["stream"] = "usage", ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
        }
    }

    private async Task UploadAccountingMediaAsync(
        MachineRuntimeCredential currentCredential,
        MachineSegmentLedger currentLedger,
        long nowMs,
        CancellationToken cancellationToken)
    {
        var pending = await currentLedger.PendingAccountingMediaAsync(50, nowMs, cancellationToken).ConfigureAwait(false);
        if (pending.Count == 0) return;
        try
        {
            var acceptance = await api.UploadAccountingMediaAsync(currentCredential,
                pending.Select(item => new MachineAccountingMediaUpload(
                    item.LocalUserId, item.AssignmentVersion, item.Segment)).ToArray(),
                cancellationToken).ConfigureAwait(false);
            var accepted = pending.Where(item => acceptance.AcceptedIds.Contains(item.Segment.Id, StringComparer.Ordinal))
                .Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet();
            await currentLedger.MarkAccountingMediaAcceptedAsync(accepted, cancellationToken).ConfigureAwait(false);
            var rejected = acceptance.Rejected.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            var retry = pending.Where(item => !acceptance.AcceptedIds.Contains(item.Segment.Id, StringComparer.Ordinal)
                    && !rejected.Contains(item.Segment.Id))
                .Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet();
            await currentLedger.RecordAccountingMediaFailureAsync(retry, "ACK_MISSING",
                DateTimeOffset.UtcNow.AddSeconds(30).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("info", "upload", "segment_upload_completed", "media-upload", "segment_upload_completed",
                new Dictionary<string, object> { ["stream"] = "media", ["acceptedCount"] = accepted.Count, ["rejectedCount"] = rejected.Count }).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await currentLedger.RecordAccountingMediaFailureAsync(
                pending.Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet(),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "segment_upload_failed", "media-upload", "segment_upload_failed",
                new Dictionary<string, object> { ["stream"] = "media", ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
        }
    }

    private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        do
        {
            if (credential is null) continue;
            try
            {
                await api.HeartbeatAsync(credential, new MachineHeartbeat(
                    Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "2.0.6",
                    Environment.OSVersion.VersionString,
                    RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant(),
                    tamperCount,
                    appliedPolicy is null ? "pending" : "applied"), cancellationToken).ConfigureAwait(false);
                await WriteLogAsync("info", "service", "heartbeat_succeeded", "heartbeat-loop", "heartbeat_succeeded").ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
            {
                await WriteLogAsync("warning", "service", "heartbeat_failed", "heartbeat-loop", "heartbeat_failed",
                    new Dictionary<string, object> { ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
            }
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private async Task UploadTerminalLogsAsync(
        MachineRuntimeCredential currentCredential,
        long nowMs,
        CancellationToken cancellationToken)
    {
        if (terminalLogs is null) return;
        var pending = await terminalLogs.PendingAsync(100, nowMs, cancellationToken).ConfigureAwait(false);
        if (pending.Count == 0) return;
        try
        {
            var acceptance = await api.UploadTerminalLogsAsync(currentCredential,
                pending.Select(item => item.Log).ToArray(), cancellationToken).ConfigureAwait(false);
            var accepted = acceptance.AcceptedIds.ToHashSet(StringComparer.Ordinal);
            var rejected = acceptance.Rejected.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
            await terminalLogs.MarkAcceptedAsync(accepted.Concat(rejected).ToHashSet(StringComparer.Ordinal), cancellationToken).ConfigureAwait(false);
            var retry = pending.Select(item => item.Log.Id)
                .Where(id => !accepted.Contains(id) && !rejected.Contains(id)).ToHashSet(StringComparer.Ordinal);
            await terminalLogs.RecordFailureAsync(retry, "ACK_MISSING",
                DateTimeOffset.UtcNow.AddSeconds(30).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("info", "upload", "terminal_log_upload_completed", "terminal-log-loop",
                "terminal_log_upload_completed", new Dictionary<string, object>
                {
                    ["acceptedCount"] = accepted.Count, ["rejectedCount"] = rejected.Count,
                }, remoteEligible: false).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await terminalLogs.RecordFailureAsync(pending.Select(item => item.Log.Id).ToHashSet(StringComparer.Ordinal),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "terminal_log_upload_failed", "terminal-log-loop",
                "terminal_log_upload_failed", new Dictionary<string, object> { ["errorType"] = exception.GetType().Name },
                remoteEligible: false).ConfigureAwait(false);
        }
    }

    private async Task WriteLogAsync(
        string level,
        string category,
        string eventCode,
        string module,
        string messageCode,
        IReadOnlyDictionary<string, object>? details = null,
        bool remoteEligible = true)
    {
        if (terminalLogs is null) return;
        try
        {
            await terminalLogs.WriteAsync(level, category, eventCode, module, messageCode, details,
                Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "2.0.6",
                remoteEligible ? appliedPolicy?.Policy.LoggingPolicy : null,
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), cancellation.Token).ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is SqliteException or IOException or ArgumentException or OperationCanceledException)
        {
            // Diagnostics are strictly best-effort and cannot block Runtime behavior.
        }
    }

    public async ValueTask DisposeAsync()
    {
        await StopAsync().ConfigureAwait(false);
        cancellation.Dispose();
        stateGate.Dispose();
        http.Dispose();
    }

    private sealed record SessionRuntime(
        string LocalUserId,
        MachineUserAssignment Assignment,
        MachineAccountingSession AccountingSession);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeClientProcessId(nint pipe, out uint clientProcessId);
}
