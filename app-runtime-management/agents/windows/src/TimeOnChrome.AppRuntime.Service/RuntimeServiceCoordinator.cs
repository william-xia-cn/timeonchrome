using System.Diagnostics;
using System.IO.Pipes;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using System.Threading.Channels;
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
    private readonly SemaphoreSlim policyCycleGate = new(1, 1);
    private readonly SemaphoreSlim uploadCycleGate = new(1, 1);
    private readonly SemaphoreSlim heartbeatCycleGate = new(1, 1);
    private readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(20) };
    private readonly long serviceStartedAtMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
    private MachineRuntimeApiClient api;
    private MachineRuntimeCredential? credential;
    private MachineSegmentLedger? ledger;
    private MachineApplicationInventoryStore? inventoryStore;
    private BrowserUsageMirrorStore? browserMirrorStore;
    private sealed record InventoryEnvelope(string LocalUserId, SessionApplicationInventoryMessage Message);
    private readonly Channel<InventoryEnvelope> inventoryQueue = Channel.CreateBounded<InventoryEnvelope>(
        new BoundedChannelOptions(64) { FullMode = BoundedChannelFullMode.DropOldest, SingleReader = true, SingleWriter = false });
    private MachineTerminalLogStore? terminalLogs;
    private MachineUserIdentityDeriver? identityDeriver;
    private AppliedMachinePolicy? appliedPolicy;
    private string? policyEtag;
    private int tamperCount;
    private long lastPolicySucceededAtMs;
    private long lastPolicyFailedAtMs;
    private long lastHeartbeatSucceededAtMs;
    private long lastHeartbeatFailedAtMs;
    private long lastUsageUploadSucceededAtMs;
    private long lastUsageUploadFailedAtMs;
    private long lastMediaUploadSucceededAtMs;
    private long lastMediaUploadFailedAtMs;
    private long lastLogUploadSucceededAtMs;
    private long lastLogUploadFailedAtMs;
    private string? lastStableErrorCode;
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
        browserMirrorStore = new BrowserUsageMirrorStore(paths.DatabasePath);
        await browserMirrorStore.InitializeAsync(cancellation.Token).ConfigureAwait(false);
        await NativeMessagingManifestWriter.WriteAsync(
            AppContext.BaseDirectory,
            Path.Combine(AppContext.BaseDirectory, "TimeOnChrome.NativeHost.exe"),
            cancellation.Token).ConfigureAwait(false);
        identityDeriver = new MachineUserIdentityDeriver(
            await MachineUserIdentityDeriver.LoadOrCreateKeyAsync(paths.MachineKeyPath, cancellation.Token).ConfigureAwait(false));
        credential = await credentialStore.LoadAsync(cancellation.Token).ConfigureAwait(false);
        appliedPolicy = await policyStore.LoadAsync(cancellation.Token).ConfigureAwait(false);
        if (credential is not null) await InitializeLedgerAsync(credential).ConfigureAwait(false);
        await WriteLogAsync("info", "service", "service_started", "service", "service_started").ConfigureAwait(false);
        loops =
        [
            RunResilientLoopAsync("status", StatusLoopAsync, cancellation.Token),
            RunResilientLoopAsync("control", ControlLoopAsync, cancellation.Token),
            RunResilientLoopAsync("browserBridge", BrowserBridgeLoopAsync, cancellation.Token),
            RunResilientLoopAsync("supervisor", SupervisorLoopAsync, cancellation.Token),
            RunResilientLoopAsync("policy", PolicyLoopAsync, cancellation.Token),
            RunResilientLoopAsync("upload", UploadLoopAsync, cancellation.Token),
            RunResilientLoopAsync("heartbeat", HeartbeatLoopAsync, cancellation.Token),
            RunResilientLoopAsync("inventory", InventoryLoopAsync, cancellation.Token),
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
            Process[] trackedAgents;
            lock (agents)
            {
                trackedAgents = agents.Values.ToArray();
                agents.Clear();
            }
            foreach (var process in trackedAgents)
            {
                try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
                catch (InvalidOperationException) { }
                process.Dispose();
            }
        }
        finally { _ = stateGate.Release(); }
        foreach (var loop in loops)
        {
            try { await loop.ConfigureAwait(false); }
            catch (OperationCanceledException) { }
        }
    }

    private async Task PrepareAdministrativeBoundaryAsync(string eventCode, CancellationToken cancellationToken)
    {
        await stateGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            foreach (var sessionId in sessions.Keys.ToArray())
                await CloseSessionUnsafeAsync(sessionId, nowMs).ConfigureAwait(false);
            await WriteLogAsync("warning", "security", eventCode, "control-pipe", eventCode).ConfigureAwait(false);
        }
        finally { _ = stateGate.Release(); }
    }

    private async Task InitializeLedgerAsync(MachineRuntimeCredential machineCredential)
    {
        ledger = new MachineSegmentLedger(paths.DatabasePath);
        await ledger.InitializeAsync(machineCredential.MachineId, cancellation.Token).ConfigureAwait(false);
        inventoryStore = new MachineApplicationInventoryStore(paths.DatabasePath, machineCredential.MachineId);
        await inventoryStore.InitializeAsync(cancellation.Token).ConfigureAwait(false);
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
            var recovered = await session.PushAndPersistAsync(new AccountingRuntimeFact(
                wallTimeMs,
                monotonicTimeMs,
                item.State.ClockEpochId,
                AccountingFactKind.Recovery), cancellation.Token).ConfigureAwait(false);
            var flushed = await session.FlushAndPersistAsync(cancellation.Token).ConfigureAwait(false);
            await RefreshSharedQuotaShadowAsync(item.LocalUserId,
                recovered.UsageSegments.Concat(flushed.UsageSegments), cancellation.Token).ConfigureAwait(false);
            await ledger.RemoveAccountingOpenStateAsync(
                item.LocalUserId,
                item.State.RuntimeSessionID,
                cancellation.Token).ConfigureAwait(false);
        }
    }

    private async Task StatusLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var security = new PipeSecurity();
            security.AddAccessRule(new PipeAccessRule(
                new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null),
                PipeAccessRights.FullControl, AccessControlType.Allow));
            security.AddAccessRule(new PipeAccessRule(
                new SecurityIdentifier(WellKnownSidType.AuthenticatedUserSid, null),
                PipeAccessRights.ReadWrite, AccessControlType.Allow));
            await using var pipe = NamedPipeServerStreamAcl.Create(
                SessionPipeNames.Status, PipeDirection.InOut, 4, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous, 4096, 4096, security);
            await pipe.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
            using var reader = new StreamReader(pipe, leaveOpen: true);
            using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            var command = JsonSerializer.Deserialize<MachineControlCommand>(line ?? string.Empty, RuntimeJson.Options);
            var response = command?.Action == "status"
                ? await BuildPublicStatusAsync(cancellationToken).ConfigureAwait(false)
                : new MachinePublicStatusResponse(false, "failed", "STATUS_COMMAND_INVALID");
            await writer.WriteLineAsync(JsonSerializer.Serialize(response, RuntimeJson.Options)).ConfigureAwait(false);
        }
    }

    private async Task<MachinePublicStatusResponse> BuildPublicStatusAsync(CancellationToken cancellationToken)
    {
        var state = credential is null ? "unpaired" : appliedPolicy is null ? "pendingPolicy" : "online";
        var outbox = ledger is null
            ? new MachineOutboxSummary(0, 0, 0)
            : await ledger.OutboxSummaryAsync(cancellationToken).ConfigureAwait(false);
        var logs = terminalLogs is null
            ? new MachineTerminalLogSummary(0, 0, 0, null)
            : await terminalLogs.SummaryAsync(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
        return new MachinePublicStatusResponse(
            true,
            state,
            ServiceVersion: Assembly.GetExecutingAssembly().GetName().Version?.ToString(),
            ServiceStartedAtMs: serviceStartedAtMs,
            LastHeartbeatSucceededAtMs: Interlocked.Read(ref lastHeartbeatSucceededAtMs),
            HasPendingUploads: outbox.Legacy + outbox.Usage + outbox.Media + logs.Pending > 0);
    }

    private async Task BrowserBridgeLoopAsync(CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            var security = BrowserBridgeSecurity.CreatePipeSecurity();
            await using var pipe = NamedPipeServerStreamAcl.Create(
                BrowserBridgeProtocol.PipeName, PipeDirection.InOut, 4, PipeTransmissionMode.Byte,
                PipeOptions.Asynchronous, 8192, 8192, security);
            await pipe.WaitForConnectionAsync(cancellationToken).ConfigureAwait(false);
            var client = ValidateBrowserBridgeClient(pipe);
            using var reader = new StreamReader(pipe, leaveOpen: true);
            using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
            if (client is null || identityDeriver is null)
            {
                await writer.WriteLineAsync(JsonSerializer.Serialize(
                    new BrowserBridgeResponse(false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        ErrorCode: "BROWSER_BRIDGE_CLIENT_REJECTED"), RuntimeJson.Options)).ConfigureAwait(false);
                continue;
            }

            var line = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            BrowserBridgeResponse response;
            try
            {
                if (line is null || line.Length > BrowserBridgeProtocol.MaxMessageBytes)
                    throw new InvalidDataException("Browser bridge message size is invalid.");
                var envelope = JsonSerializer.Deserialize<BrowserBridgeEnvelope>(line, RuntimeJson.Options)
                    ?? throw new InvalidDataException("Browser bridge message is empty.");
                BrowserBridgeProtocol.Validate(envelope);
                var accepted = 0;
                if (envelope.MessageType == "settledUsageSegments")
                {
                    var payload = envelope.Payload.Deserialize<BrowserSettledUsagePayload>(RuntimeJson.Options)
                        ?? throw new InvalidDataException("Browser segment payload is empty.");
                    if (payload.Segments is null)
                        throw new InvalidDataException("Browser segment collection is missing.");
                    if (browserMirrorStore is null) throw new InvalidOperationException("Browser mirror store is unavailable.");
                    accepted = await browserMirrorStore.AppendAsync(
                        client.SessionId,
                        identityDeriver.Derive(client.Sid),
                        envelope.ProfileId,
                        envelope.ExtensionId,
                        payload.Segments,
                        DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        cancellationToken).ConfigureAwait(false);
                    if (accepted > 0 && payload.Segments.Count > 0)
                    {
                        await browserMirrorStore.RebuildShadowAsync(
                            identityDeriver.Derive(client.Sid),
                            payload.Segments.Min(item => item.StartMs),
                            payload.Segments.Max(item => item.EndMs),
                            cancellationToken).ConfigureAwait(false);
                    }
                }
                response = new BrowserBridgeResponse(true, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    envelope.RequestId, AcceptedCount: accepted);
            }
            catch (Exception exception) when (exception is InvalidDataException or JsonException or SqliteException or InvalidOperationException)
            {
                response = new BrowserBridgeResponse(false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    ErrorCode: "BROWSER_BRIDGE_MESSAGE_REJECTED");
            }
            await writer.WriteLineAsync(JsonSerializer.Serialize(response, RuntimeJson.Options)).ConfigureAwait(false);
        }
    }

    private static BrowserBridgeClient? ValidateBrowserBridgeClient(NamedPipeServerStream pipe)
    {
        if (!GetNamedPipeClientProcessId(pipe.SafePipeHandle.DangerousGetHandle(), out var processId)) return null;
        int sessionId;
        string? processPath;
        try
        {
            using var process = Process.GetProcessById(checked((int)processId));
            sessionId = process.SessionId;
            processPath = process.MainModule?.FileName;
        }
        catch (ArgumentException) { return null; }
        catch (System.ComponentModel.Win32Exception) { return null; }
        catch (InvalidOperationException) { return null; }
        string? sid = null;
        pipe.RunAsClient(() =>
        {
            using var identity = WindowsIdentity.GetCurrent(true);
            sid = identity?.User?.Value;
        });
        var installedHost = Path.Combine(AppContext.BaseDirectory, "TimeOnChrome.NativeHost.exe");
        return BrowserBridgeSecurity.IsAllowedClient(processPath, installedHost, sessionId, sid)
            ? new BrowserBridgeClient(sessionId, sid!) : null;
    }

    private async Task<MachineControlResponse> BuildAdminStatusAsync(CancellationToken cancellationToken)
    {
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var outbox = ledger is null
            ? new MachineOutboxSummary(0, 0, 0)
            : await ledger.OutboxSummaryAsync(cancellationToken).ConfigureAwait(false);
        var logSummary = terminalLogs is null
            ? new MachineTerminalLogSummary(0, 0, 0, null)
            : await terminalLogs.SummaryAsync(nowMs, cancellationToken).ConfigureAwait(false);
        var interactive = sessionLauncher.Enumerate().Where(item => item.Active).ToArray();
        var protectedCount = appliedPolicy is null || identityDeriver is null
            ? 0
            : interactive.Count(item => MachinePolicyStore.AssignmentFor(
                appliedPolicy.Policy, identityDeriver.Derive(item.Sid))?.Protected == true);
        int agentCount;
        lock (agents) agentCount = agents.Values.Count(IsProcessRunning);
        var logging = appliedPolicy?.Policy.LoggingPolicy;
        var loggingState = logging is null || !logging.Enabled
            ? "disabled"
            : logging.ExpiresAtMs is not > 0 || logging.ExpiresAtMs <= nowMs ? "expired" : "enabled";
        var policyVersion = appliedPolicy?.Policy.Version ?? 0;
        return new MachineControlResponse(
            true,
            credential is null ? "unpaired" : appliedPolicy is null ? "pendingPolicy" : "online",
            ServiceVersion: Assembly.GetExecutingAssembly().GetName().Version?.ToString(),
            ServiceStartedAtMs: serviceStartedAtMs,
            LastPolicySucceededAtMs: Interlocked.Read(ref lastPolicySucceededAtMs),
            LastPolicyFailedAtMs: Interlocked.Read(ref lastPolicyFailedAtMs),
            LastHeartbeatSucceededAtMs: Interlocked.Read(ref lastHeartbeatSucceededAtMs),
            LastHeartbeatFailedAtMs: Interlocked.Read(ref lastHeartbeatFailedAtMs),
            LastUsageUploadSucceededAtMs: Interlocked.Read(ref lastUsageUploadSucceededAtMs),
            LastUsageUploadFailedAtMs: Interlocked.Read(ref lastUsageUploadFailedAtMs),
            LastMediaUploadSucceededAtMs: Interlocked.Read(ref lastMediaUploadSucceededAtMs),
            LastMediaUploadFailedAtMs: Interlocked.Read(ref lastMediaUploadFailedAtMs),
            LastLogUploadSucceededAtMs: Interlocked.Read(ref lastLogUploadSucceededAtMs),
            LastLogUploadFailedAtMs: Interlocked.Read(ref lastLogUploadFailedAtMs),
            DesiredPolicyVersion: policyVersion,
            AppliedPolicyVersion: policyVersion,
            LegacyOutboxCount: outbox.Legacy,
            UsageOutboxCount: outbox.Usage,
            MediaOutboxCount: outbox.Media,
            LogOutboxCount: logSummary.Pending,
            ActiveSessionCount: interactive.Length,
            ProtectedSessionCount: protectedCount,
            AgentCount: agentCount,
            TamperCount: tamperCount,
            WarningCount24h: logSummary.Warnings24h,
            ErrorCount24h: logSummary.Errors24h,
            LastStableErrorCode: lastStableErrorCode ?? logSummary.LastStableErrorCode,
            RemoteLoggingState: loggingState,
            RemoteLoggingMinLevel: logging?.MinLevel,
            RemoteLoggingExpiresAtMs: logging?.ExpiresAtMs ?? 0);
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
                if (string.Equals(command.Action, "status", StringComparison.Ordinal)
                    || string.Equals(command.Action, "adminStatus", StringComparison.Ordinal))
                {
                    await writer.WriteLineAsync(JsonSerializer.Serialize(
                        await BuildAdminStatusAsync(cancellationToken).ConfigureAwait(false), RuntimeJson.Options)).ConfigureAwait(false);
                    continue;
                }
                if (string.Equals(command.Action, "syncNow", StringComparison.Ordinal))
                {
                    await SyncNowAsync(cancellationToken).ConfigureAwait(false);
                    await writer.WriteLineAsync(JsonSerializer.Serialize(
                        await BuildAdminStatusAsync(cancellationToken).ConfigureAwait(false), RuntimeJson.Options)).ConfigureAwait(false);
                    continue;
                }
                if (string.Equals(command.Action, "prepareStop", StringComparison.Ordinal)
                    || string.Equals(command.Action, "prepareRestart", StringComparison.Ordinal))
                {
                    await PrepareAdministrativeBoundaryAsync(
                        command.Action == "prepareStop" ? "admin_service_stop_requested" : "admin_service_restart_requested",
                        cancellationToken).ConfigureAwait(false);
                    await writer.WriteLineAsync(JsonSerializer.Serialize(
                        new MachineControlResponse(true, "prepared"), RuntimeJson.Options)).ConfigureAwait(false);
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
            if (agents.TryGetValue(session.SessionId, out var existing) && IsProcessRunning(existing)) return;
            if (existing is not null)
            {
                agents.Remove(session.SessionId);
                existing.Dispose();
            }
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
        var process = sessionLauncher.FindExisting(session.SessionId, executable);
        var adopted = process is not null;
        process ??= sessionLauncher.Start(session.SessionId, executable);
        int processId;
        try { processId = process.Id; }
        catch (InvalidOperationException)
        {
            process.Dispose();
            return;
        }
        EventHandler exited = (_, _) => _ = AgentExitedSafelyAsync(session.SessionId, processId);
        lock (agents)
        {
            if (agents.TryGetValue(session.SessionId, out var existing) && IsProcessRunning(existing))
            {
                process.Dispose();
                return;
            }
            agents[session.SessionId] = process;
        }
        if (!AgentProcessRegistration.TryEnableExitEvents(process, exited))
        {
            lock (agents)
            {
                if (agents.TryGetValue(session.SessionId, out var registered) && ReferenceEquals(registered, process))
                    agents.Remove(session.SessionId);
            }
            process.Dispose();
            await WriteLogAsync("warning", "session", "session_agent_registration_race", "session-supervisor",
                "session_agent_registration_race").ConfigureAwait(false);
            return;
        }
        var eventCode = adopted ? "session_agent_adopted" : "session_agent_started";
        await WriteLogAsync("info", "session", eventCode, "session-supervisor", eventCode).ConfigureAwait(false);
    }

    private static bool IsProcessRunning(Process process)
    {
        try { return !process.HasExited; }
        catch (InvalidOperationException) { return false; }
        catch (System.ComponentModel.Win32Exception) { return false; }
    }

    private async Task AgentExitedSafelyAsync(int sessionId, int processId)
    {
        try { await AgentExitedAsync(sessionId, processId).ConfigureAwait(false); }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        catch (Exception exception)
        {
            await WriteLogAsync("error", "session", "session_agent_exit_handler_failed", "session-supervisor",
                "session_agent_exit_handler_failed",
                new Dictionary<string, object> { ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
        }
    }

    private async Task AgentExitedAsync(int sessionId, int processId)
    {
        Process? exited = null;
        lock (agents)
        {
            if (!agents.TryGetValue(sessionId, out var registered)) return;
            try { if (registered.Id != processId) return; }
            catch (InvalidOperationException) { }
            agents.Remove(sessionId);
            exited = registered;
        }
        exited.Dispose();
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
                if (line.Length > 262144) continue;
                using var envelope = JsonDocument.Parse(line);
                if (envelope.RootElement.TryGetProperty("schemaVersion", out var schema)
                    && SessionApplicationInventoryProtocol.SupportsSchemaVersion(schema.GetInt32()))
                {
                    var inventory = JsonSerializer.Deserialize<SessionApplicationInventoryMessage>(line, RuntimeJson.Options);
                    if (inventoryStore is not null && inventory is { Applications.Count: <= 200 }
                        && inventory.Status is "installed" or "runtimeObserved"
                        && (inventory.CompleteIdentitySet is null || (inventory.Status == "installed" && inventory.Applications.Count == 0
                            && inventory.CompleteIdentitySet.Count <= 1000 && inventory.CompleteIdentitySet.All(item => !string.IsNullOrWhiteSpace(item) && item.Length <= 256))))
                    {
                        if (inventory.Scan is { } scan)
                        {
                            inventory = inventory with { Scan = scan with { LocalUserId = localUserId } };
                            MachineApplicationInventoryStore.ValidateScan(inventory.Scan, inventory.Applications.Select(item => new MachineApplicationObservation(localUserId, item, inventory.Status)).ToArray());
                        }
                        await inventoryQueue.Writer.WriteAsync(new InventoryEnvelope(localUserId, inventory), cancellationToken).ConfigureAwait(false);
                    }
                    continue;
                }
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
            var installedAgent = Path.Combine(AppContext.BaseDirectory, "TimeOnChrome.AppRuntime.SessionAgent.exe");
            if (!string.Equals(process.MainModule?.FileName, installedAgent, StringComparison.OrdinalIgnoreCase)) return false;
        }
        catch (ArgumentException) { return false; }
        catch (System.ComponentModel.Win32Exception) { return false; }
        catch (InvalidOperationException) { return false; }
        string? actualSid = null;
        pipe.RunAsClient(() =>
        {
            using var identity = WindowsIdentity.GetCurrent(true);
            actualSid = identity?.User?.Value;
        });
        return string.Equals(actualSid, expected.Sid, StringComparison.OrdinalIgnoreCase);
    }

    private async Task InventoryLoopAsync(CancellationToken token)
    {
        InventoryEnvelope? pending = null;
        var backoff = TimeSpan.FromSeconds(60);
        var nextUpload = DateTimeOffset.MinValue;
        while (!token.IsCancellationRequested)
        {
            var store = inventoryStore;
            var bound = credential;
            if (store is not null && bound is not null && !stopping)
            {
                try
                {
                    while (pending is not null || inventoryQueue.Reader.TryRead(out pending))
                    {
                        if (pending.Message.CompleteIdentitySet is { } complete)
                            await store.ReconcileAsync(pending.LocalUserId, complete, token).ConfigureAwait(false);
                        else
                            await store.ObserveAsync(pending.Message.Applications.Select(item =>
                                new MachineApplicationObservation(pending.LocalUserId, item, pending.Message.Status)).ToArray(), token, pending.Message.Scan).ConfigureAwait(false);
                        pending = null;
                    }
                    if (DateTimeOffset.UtcNow >= nextUpload)
                    {
                        var batch = await store.PeekAsync(token).ConfigureAwait(false);
                        if (batch is not null)
                        {
                            var ack = await api.UploadApplicationInventoryAsync(bound, batch, token).ConfigureAwait(false);
                            await store.AcknowledgeAsync(batch, ack, token).ConfigureAwait(false);
                        }
                        backoff = TimeSpan.FromSeconds(60);
                        nextUpload = DateTimeOffset.UtcNow + backoff;
                    }
                }
                catch (Exception) when (!token.IsCancellationRequested)
                {
                    await WriteLogAsync("warning", "upload", "application_inventory_failed", "inventory-loop", "application_inventory_failed").ConfigureAwait(false);
                    await Task.Delay(backoff, token).ConfigureAwait(false);
                    nextUpload = DateTimeOffset.UtcNow;
                    backoff = TimeSpan.FromSeconds(Math.Min(900, backoff.TotalSeconds * 2));
                }
            }
            await Task.Delay(TimeSpan.FromSeconds(1), token).ConfigureAwait(false);
        }
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
            var transition = await runtime.AccountingSession.PushAndPersistAsync(
                fact with { PolicySnapshot = policySnapshot }, cancellationToken).ConfigureAwait(false);
            await RefreshSharedQuotaShadowAsync(localUserId, transition.UsageSegments, cancellationToken).ConfigureAwait(false);
        }
        finally { _ = stateGate.Release(); }
    }

    private async Task CloseSessionUnsafeAsync(int sessionId, long observedAtMs, long? observedMonotonicMs = null)
    {
        if (ledger is null || !sessions.Remove(sessionId, out var runtime)) return;
        var state = runtime.AccountingSession.DurableState;
        var closeWall = Math.Max(observedAtMs, state.LastProcessedWallTimeMs ?? 0);
        var closeMonotonic = Math.Max(observedMonotonicMs ?? Environment.TickCount64, state.LastProcessedMonotonicTimeMs ?? 0);
        var closeTransition = await runtime.AccountingSession.PushAndPersistAsync(new AccountingRuntimeFact(
            closeWall,
            closeMonotonic,
            state.ClockEpochId,
            AccountingFactKind.SessionChanged,
            SessionState: UserSessionState.Inactive)).ConfigureAwait(false);
        var flushTransition = await runtime.AccountingSession.FlushAndPersistAsync().ConfigureAwait(false);
        await RefreshSharedQuotaShadowAsync(runtime.LocalUserId,
            closeTransition.UsageSegments.Concat(flushTransition.UsageSegments), cancellation.Token).ConfigureAwait(false);
        await ledger.RemoveAccountingOpenStateAsync(runtime.LocalUserId, state.RuntimeSessionID).ConfigureAwait(false);
    }

    private async Task RefreshSharedQuotaShadowAsync(
        string localUserId,
        IEnumerable<UsageSegmentV2> usageSegments,
        CancellationToken cancellationToken)
    {
        if (browserMirrorStore is null) return;
        var authoritative = usageSegments.Where(item => item.AuthoritativeForUsage).ToArray();
        if (authoritative.Length == 0) return;
        await browserMirrorStore.RebuildShadowAsync(
            localUserId,
            authoritative.Min(item => item.StartWallTimeMs),
            authoritative.Max(item => item.EndWallTimeMs),
            cancellationToken).ConfigureAwait(false);
    }

    private async Task PolicyLoopAsync(CancellationToken cancellationToken)
    {
        var delay = TimeSpan.FromMinutes(1);
        while (!cancellationToken.IsCancellationRequested)
        {
            var succeeded = await SyncPolicyOnceAsync(cancellationToken).ConfigureAwait(false);
            delay = succeeded ? TimeSpan.FromMinutes(1)
                : TimeSpan.FromMinutes(Math.Min(15, Math.Max(1, delay.TotalMinutes * 2)));
            await Task.Delay(delay, cancellationToken).ConfigureAwait(false);
        }
    }

    private async Task<bool> SyncPolicyOnceAsync(CancellationToken cancellationToken)
    {
        if (credential is null) return true;
        await policyCycleGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var result = await api.GetPolicyAsync(credential, policyEtag, cancellationToken).ConfigureAwait(false);
            if (result.Policy is not null)
            {
                var observations = inventoryStore is null ? [] : await inventoryStore.ListAsync(cancellationToken).ConfigureAwait(false);
                var localResolutions = MachinePolicyStore.ResolveApplications(result.Policy, observations);
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
                    var candidate = new AppliedMachinePolicy(result.Policy, boundaryWall, boundaryWall, localResolutions);
                    await policyStore.SaveAsync(candidate, cancellationToken).ConfigureAwait(false);
                    appliedPolicy = candidate;
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
                            Snapshot: snapshot, PolicySnapshot: policySnapshot), cancellationToken).ConfigureAwait(false);
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
            Interlocked.Exchange(ref lastPolicySucceededAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            return true;
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            Interlocked.Exchange(ref lastPolicyFailedAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            lastStableErrorCode = "POLICY_SYNC_FAILED";
            await WriteLogAsync("warning", "policy", "policy_sync_failed", "policy-loop", "policy_sync_failed",
                new Dictionary<string, object> { ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
            return false;
        }
        finally { _ = policyCycleGate.Release(); }
    }

    private async Task UploadLoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromSeconds(10));
        do
        {
            await UploadOnceAsync(cancellationToken).ConfigureAwait(false);
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private async Task UploadOnceAsync(CancellationToken cancellationToken)
    {
        if (credential is null || ledger is null) return;
        await uploadCycleGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            await UploadLegacyAsync(credential, ledger, nowMs, cancellationToken).ConfigureAwait(false);
            await UploadAccountingUsageAsync(credential, ledger, nowMs, cancellationToken).ConfigureAwait(false);
            await UploadAccountingMediaAsync(credential, ledger, nowMs, cancellationToken).ConfigureAwait(false);
            await UploadTerminalLogsAsync(credential, nowMs, cancellationToken).ConfigureAwait(false);
        }
        finally { _ = uploadCycleGate.Release(); }
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
            Interlocked.Exchange(ref lastUsageUploadSucceededAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await currentLedger.RecordFailureAsync(pending.Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet(),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "segment_upload_failed", "usage-upload", "segment_upload_failed",
                new Dictionary<string, object> { ["stream"] = "legacy", ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
            Interlocked.Exchange(ref lastUsageUploadFailedAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            lastStableErrorCode = "USAGE_UPLOAD_FAILED";
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
            Interlocked.Exchange(ref lastUsageUploadSucceededAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await currentLedger.RecordAccountingUsageFailureAsync(
                pending.Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet(),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "segment_upload_failed", "usage-upload", "segment_upload_failed",
                new Dictionary<string, object> { ["stream"] = "usage", ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
            Interlocked.Exchange(ref lastUsageUploadFailedAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            lastStableErrorCode = "USAGE_UPLOAD_FAILED";
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
            Interlocked.Exchange(ref lastMediaUploadSucceededAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await currentLedger.RecordAccountingMediaFailureAsync(
                pending.Select(item => (item.LocalUserId, item.Segment.Id)).ToHashSet(),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "segment_upload_failed", "media-upload", "segment_upload_failed",
                new Dictionary<string, object> { ["stream"] = "media", ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
            Interlocked.Exchange(ref lastMediaUploadFailedAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            lastStableErrorCode = "MEDIA_UPLOAD_FAILED";
        }
    }

    private async Task HeartbeatLoopAsync(CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        do
        {
            await HeartbeatOnceAsync(cancellationToken).ConfigureAwait(false);
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private async Task HeartbeatOnceAsync(CancellationToken cancellationToken)
    {
        if (credential is null) return;
        await heartbeatCycleGate.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            await api.HeartbeatAsync(credential, new MachineHeartbeat(
                Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "2.5.2",
                Environment.OSVersion.VersionString,
                RuntimeInformation.ProcessArchitecture.ToString().ToLowerInvariant(),
                tamperCount,
                appliedPolicy is null ? "pending" : "applied"), cancellationToken).ConfigureAwait(false);
            Interlocked.Exchange(ref lastHeartbeatSucceededAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            await WriteLogAsync("info", "service", "heartbeat_succeeded", "heartbeat-loop", "heartbeat_succeeded").ConfigureAwait(false);
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            Interlocked.Exchange(ref lastHeartbeatFailedAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            lastStableErrorCode = "HEARTBEAT_FAILED";
            await WriteLogAsync("warning", "service", "heartbeat_failed", "heartbeat-loop", "heartbeat_failed",
                new Dictionary<string, object> { ["errorType"] = exception.GetType().Name }).ConfigureAwait(false);
        }
        finally { _ = heartbeatCycleGate.Release(); }
    }

    private async Task SyncNowAsync(CancellationToken cancellationToken)
    {
        _ = await SyncPolicyOnceAsync(cancellationToken).ConfigureAwait(false);
        await UploadOnceAsync(cancellationToken).ConfigureAwait(false);
        await HeartbeatOnceAsync(cancellationToken).ConfigureAwait(false);
        await WriteLogAsync("info", "service", "admin_sync_completed", "control-pipe", "admin_sync_completed").ConfigureAwait(false);
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
            Interlocked.Exchange(ref lastLogUploadSucceededAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
        }
        catch (Exception exception) when (exception is RuntimeApiException or HttpRequestException or TaskCanceledException)
        {
            await terminalLogs.RecordFailureAsync(pending.Select(item => item.Log.Id).ToHashSet(StringComparer.Ordinal),
                "UPLOAD_FAILED", DateTimeOffset.UtcNow.AddMinutes(1).ToUnixTimeMilliseconds(), cancellationToken).ConfigureAwait(false);
            await WriteLogAsync("warning", "upload", "terminal_log_upload_failed", "terminal-log-loop",
                "terminal_log_upload_failed", new Dictionary<string, object> { ["errorType"] = exception.GetType().Name },
                remoteEligible: false).ConfigureAwait(false);
            Interlocked.Exchange(ref lastLogUploadFailedAtMs, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds());
            lastStableErrorCode = "LOG_UPLOAD_FAILED";
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
                Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "2.5.2",
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
        policyCycleGate.Dispose();
        uploadCycleGate.Dispose();
        heartbeatCycleGate.Dispose();
        http.Dispose();
    }

    private sealed record SessionRuntime(
        string LocalUserId,
        MachineUserAssignment Assignment,
        MachineAccountingSession AccountingSession);

    private sealed record BrowserBridgeClient(int SessionId, string Sid);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GetNamedPipeClientProcessId(nint pipe, out uint clientProcessId);
}
