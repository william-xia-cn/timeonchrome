using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using System.Threading.Channels;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;
using TimeOnChrome.AppRuntime.Core;

namespace TimeOnChrome.AppRuntime.SessionAgent;

internal static class Program
{
    public static async Task<int> Main()
    {
        if (!OperatingSystem.IsWindows()) return 2;
        var sessionId = Process.GetCurrentProcess().SessionId;
        using var mutex = new Mutex(true, $"Local\\TimeOnChrome.AppRuntime.v2.session-agent.{sessionId}", out var acquired);
        if (!acquired) return 0;
        try
        {
            using var cancellation = new CancellationTokenSource();
            Console.CancelKeyPress += (_, eventArgs) => { eventArgs.Cancel = true; cancellation.Cancel(); };
            await RunAsync(sessionId, cancellation.Token).ConfigureAwait(false);
            return 0;
        }
        catch (OperationCanceledException)
        {
            return 0;
        }
        catch
        {
            return 1;
        }
    }

    private static async Task RunAsync(int sessionId, CancellationToken cancellationToken)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            try
            {
                await using var pipe = new NamedPipeClientStream(
                    ".", SessionPipeNames.Facts(sessionId), PipeDirection.InOut,
                    PipeOptions.Asynchronous, System.Security.Principal.TokenImpersonationLevel.Identification);
                await pipe.ConnectAsync(10_000, cancellationToken).ConfigureAwait(false);
                await using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
                using var connected = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
                using var writeGate = new SemaphoreSlim(1, 1);
                var portable = Channel.CreateBounded<(string Path, string Identity, WindowsProcessPackageIdentity? Package)>(new BoundedChannelOptions(128) { FullMode = BoundedChannelFullMode.DropOldest });
                var probe = new WindowsRuntimeProbe();
                var inventory = InventoryLoopAsync(writer, writeGate, portable.Reader, connected.Token);
                var observed = new HashSet<string>(StringComparer.Ordinal);
                var source = new WindowsRuntimeEventSource(
                    probe, TimeSpan.FromSeconds(180),
                    TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(60));
                var projector = new AccountingFactProjectorV2("epoch-0");
                try
                {
                await foreach (var fact in source.FactsAsync(connected.Token).ConfigureAwait(false))
                {
                    if (fact.Application is not null && probe.LastExecutablePath is string path && observed.Add(fact.Application.RuntimeIdentity))
                        portable.Writer.TryWrite((path, fact.Application.RuntimeIdentity,probe.LastPackageIdentity));
                    var wallTimeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    var monotonicTimeMs = Environment.TickCount64;
                    foreach (var accountingFact in projector.Project(fact, wallTimeMs, monotonicTimeMs))
                    {
                        var message = JsonSerializer.Serialize(
                            new SessionAccountingFactMessage(2, accountingFact),
                            RuntimeJson.Options);
                        await WriteAsync(writer, writeGate, message, connected.Token).ConfigureAwait(false);
                    }
                }
                }
                finally
                {
                    connected.Cancel();
                    try { await inventory.ConfigureAwait(false); }
                    catch (Exception error) when (error is OperationCanceledException or IOException) { }
                }
            }
            catch (IOException) when (!cancellationToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken).ConfigureAwait(false);
            }
            catch (TimeoutException) when (!cancellationToken.IsCancellationRequested)
            {
                await Task.Delay(TimeSpan.FromSeconds(2), cancellationToken).ConfigureAwait(false);
            }
        }
    }

    private static async Task WriteAsync(StreamWriter writer, SemaphoreSlim gate, string message, CancellationToken token)
    {
        await gate.WaitAsync(token).ConfigureAwait(false);
        try { await writer.WriteLineAsync(message.AsMemory(), token).ConfigureAwait(false); }
        finally { gate.Release(); }
    }
    private static async Task InventoryLoopAsync(StreamWriter writer, SemaphoreSlim gate,
        ChannelReader<(string Path, string Identity, WindowsProcessPackageIdentity? Package)> portable, CancellationToken token)
    {
        await Task.Yield();
        var discovery = new WindowsApplicationDiscovery();
        var nextScan = DateTimeOffset.MinValue;
        string? stamp = null;
        var changed = true;
        var watchers = new List<FileSystemWatcher>();
        foreach (var folder in new[] { Environment.SpecialFolder.CommonPrograms, Environment.SpecialFolder.Programs })
        {
            try
            {
                var path = Environment.GetFolderPath(folder);
                if (!Directory.Exists(path)) continue;
                var watcher = new FileSystemWatcher(path) { IncludeSubdirectories = true };
                watcher.Changed += (_, _) => changed = true; watcher.Created += (_, _) => changed = true;
                watcher.Deleted += (_, _) => changed = true; watcher.Renamed += (_, _) => changed = true;
                watcher.Error += (_, _) => changed = true; watcher.EnableRaisingEvents = true; watchers.Add(watcher);
            }
            catch (Exception error) when (error is IOException or UnauthorizedAccessException) { }
        }
        async Task Send(IReadOnlyList<AppEvidence> applications, string status)
        {
            foreach (var chunk in applications.Chunk(200))
                await WriteAsync(writer, gate, JsonSerializer.Serialize(new SessionApplicationInventoryMessage(3, chunk, status), RuntimeJson.Options), token).ConfigureAwait(false);
        }
        try
        {
            while (!token.IsCancellationRequested)
            {
                var current = discovery.ChangeStamp();
                if (changed || current != stamp || DateTimeOffset.UtcNow >= nextScan)
                {
                    changed = false;
                    var scan = await discovery.ScanAsync(token).ConfigureAwait(false);
                    await Send(scan.Applications.Select(item => item.Evidence).ToArray(), "installed").ConfigureAwait(false);
                    if (scan.FailedSources.Count == 0 && scan.Applications.Count <= 1000)
                        await WriteAsync(writer, gate: gate, message: JsonSerializer.Serialize(
                            new SessionApplicationInventoryMessage(3, [], "installed", scan.Applications.Select(item => item.Evidence.RuntimeIdentity).ToArray()),
                            RuntimeJson.Options), token: token).ConfigureAwait(false);
                    stamp = current; nextScan = DateTimeOffset.UtcNow.AddDays(1);
                    // A failed source never emits an uninstall observation.
                }
                while (portable.TryRead(out var item))
                {
                    try
                    {
                        var evidence = WindowsApplicationEvidence.FromExecutable(item.Path,packageIdentity:item.Package);
                        if (evidence.RuntimeIdentity == item.Identity) await Send([evidence], "runtimeObserved").ConfigureAwait(false);
                    }
                    catch (Exception error) when (error is IOException or UnauthorizedAccessException or System.Security.Cryptography.CryptographicException) { }
                }
                await Task.Delay(TimeSpan.FromSeconds(60), token).ConfigureAwait(false);
            }
        }
        finally { foreach (var watcher in watchers) watcher.Dispose(); }
    }
}
