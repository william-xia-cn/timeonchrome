using System.Reflection;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Agent;

internal static class Program
{
    private const string MutexName = "Local\\TimeOnChrome.AppRuntime.Agent.CurrentUser";

    public static async Task<int> Main()
    {
        if (!OperatingSystem.IsWindows()) return 2;
        using var mutex = new Mutex(initiallyOwned: true, MutexName, out var acquired);
        if (!acquired) return 0;
        try { return await RunAsync().ConfigureAwait(false); }
        catch { return 1; }
    }

    private static async Task<int> RunAsync()
    {
        var commonPaths = RuntimePaths.ForCurrentUser();
        var credentialStore = new DpapiRuntimeCredentialStore(commonPaths.CredentialPath);
        var credential = await credentialStore.LoadAsync().ConfigureAwait(false);
        if (credential is null) return 0; // Never collect before pairing.

        var paths = RuntimePaths.ForCurrentUser(credential.DeviceId);
        var log = new RuntimeDiagnosticLog(paths.LogPath);
        var store = new SqliteSegmentStore(paths.DatabasePath, credential.DeviceId);
        await store.InitializeAsync().ConfigureAwait(false);
        var settings = await new RuntimeAgentSettingsStore(paths.SettingsPath).LoadOrCreateAsync().ConfigureAwait(false);
        using var cancellation = new CancellationTokenSource();
        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        var api = new RuntimeApiClient(httpClient);
        var uploader = new RuntimeUploader(store, store, api);
        var uploadLoop = UploadLoopAsync(uploader, credential, log, TimeSpan.FromSeconds(settings.UploadIntervalSeconds), cancellation.Token);
        var heartbeatLoop = HeartbeatLoopAsync(api, credential, credentialStore, log, cancellation, cancellation.Token);
        var eventSource = new WindowsRuntimeEventSource(
            new WindowsRuntimeProbe(), TimeSpan.FromSeconds(settings.IdleThresholdSeconds),
            TimeSpan.FromMilliseconds(settings.PollIntervalMilliseconds), TimeSpan.FromSeconds(settings.SnapshotIntervalSeconds));
        var machine = new RuntimeStateMachine($"windows:{Guid.NewGuid():N}");
        await log.WriteAsync("agent_started", new { deviceId = credential.DeviceId, runtimeSessionID = machine.State.RuntimeSessionID }).ConfigureAwait(false);

        try
        {
            await foreach (var fact in eventSource.FactsAsync(cancellation.Token))
            {
                try
                {
                    var segments = machine.Apply(fact);
                    if (segments.Count > 0) await store.PersistAndEnqueueAsync(segments, cancellation.Token).ConfigureAwait(false);
                }
                catch (RuntimeTransitionException exception)
                {
                    await log.WriteAsync("fact_rejected", new { exception.Code }).ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested) { }
        finally
        {
            cancellation.Cancel();
            await CloseOpenSegmentAsync(machine, store).ConfigureAwait(false);
            await AwaitStoppedAsync(uploadLoop).ConfigureAwait(false);
            await AwaitStoppedAsync(heartbeatLoop).ConfigureAwait(false);
            await log.WriteAsync("agent_stopped", new { deviceId = credential.DeviceId }).ConfigureAwait(false);
        }
        return 0;
    }

    private static async Task HeartbeatLoopAsync(
        RuntimeApiClient api, RuntimeCredential credential, DpapiRuntimeCredentialStore credentialStore,
        RuntimeDiagnosticLog log, CancellationTokenSource cancellation, CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(5));
        do
        {
            try
            {
                var version = Assembly.GetExecutingAssembly().GetName().Version?.ToString() ?? "0.0.0";
                _ = await api.HeartbeatAsync(credential, version, cancellationToken).ConfigureAwait(false);
            }
            catch (RuntimeApiException exception) when (exception.StatusCode is 401 or 403)
            {
                await credentialStore.DeleteAsync(cancellationToken).ConfigureAwait(false);
                await log.WriteAsync("credential_revoked", new { requiresPairing = true }).ConfigureAwait(false);
                cancellation.Cancel();
                return;
            }
            catch (RuntimeApiException) { }
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private static async Task UploadLoopAsync(
        RuntimeUploader uploader, RuntimeCredential credential, RuntimeDiagnosticLog log,
        TimeSpan interval, CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(interval);
        do
        {
            try
            {
                var accepted = await uploader.UploadPendingAsync(credential, cancellationToken: cancellationToken).ConfigureAwait(false);
                if (accepted > 0) await log.WriteAsync("segments_accepted", new { count = accepted }).ConfigureAwait(false);
            }
            catch (RuntimeApiException) { }
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private static async Task CloseOpenSegmentAsync(RuntimeStateMachine machine, SqliteSegmentStore store)
    {
        var observedAtMs = Math.Max(DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(), machine.State.LastObservedAtMs ?? 0);
        var segments = machine.Apply(new RuntimeFact { ObservedAtMs = observedAtMs, Kind = RuntimeFactKind.SessionChanged, SessionState = UserSessionState.Inactive });
        if (segments.Count > 0) await store.PersistAndEnqueueAsync(segments).ConfigureAwait(false);
    }

    private static async Task AwaitStoppedAsync(Task task)
    {
        try { await task.ConfigureAwait(false); }
        catch (OperationCanceledException) { }
    }
}

internal sealed class RuntimeDiagnosticLog
{
    private readonly string path;
    private readonly SemaphoreSlim gate = new(1, 1);
    internal RuntimeDiagnosticLog(string path)
    {
        this.path = path;
        Directory.CreateDirectory(Path.GetDirectoryName(path) ?? throw new InvalidOperationException("Log path has no directory."));
    }
    internal async Task WriteAsync(string eventName, object details)
    {
        var line = JsonSerializer.Serialize(new { at = DateTimeOffset.UtcNow, eventName, details });
        await gate.WaitAsync().ConfigureAwait(false);
        try { await File.AppendAllTextAsync(path, string.Concat(line, Environment.NewLine)).ConfigureAwait(false); }
        finally { _ = gate.Release(); }
    }
}
