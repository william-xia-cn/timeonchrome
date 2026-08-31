using System.Text.Json;
using TimeOnChrome.AppRuntime.Core;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;

namespace TimeOnChrome.AppRuntime.Agent;

internal static class Program
{
    public static async Task<int> Main(string[] args)
    {
        if (!OperatingSystem.IsWindows())
        {
            Console.Error.WriteLine("TimeOnChrome App Runtime Agent requires Windows.");
            return 2;
        }

        var command = args.FirstOrDefault()?.ToLowerInvariant() ?? "run";
        try
        {
            return command switch
            {
                "run" => await RunAsync().ConfigureAwait(false),
                "enroll" => await EnrollAsync(args.Skip(1).ToArray()).ConfigureAwait(false),
                "install-startup" => InstallStartup(),
                "uninstall-startup" => UninstallStartup(),
                "status" => await StatusAsync().ConfigureAwait(false),
                _ => Usage(),
            };
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"App Runtime command failed: {exception.Message}");
            return 1;
        }
    }

    private static async Task<int> RunAsync()
    {
        var paths = RuntimePaths.ForCurrentUser();
        var log = new RuntimeDiagnosticLog(paths.LogPath);
        var store = new SqliteSegmentStore(paths.DatabasePath);
        await store.InitializeAsync().ConfigureAwait(false);
        var settings = await new RuntimeAgentSettingsStore(paths.SettingsPath)
            .LoadOrCreateAsync().ConfigureAwait(false);
        var credentialStore = new DpapiRuntimeCredentialStore(paths.CredentialPath);
        var credential = await credentialStore.LoadAsync().ConfigureAwait(false);

        using var cancellation = new CancellationTokenSource();
        ConsoleCancelEventHandler cancelHandler = (_, eventArgs) =>
        {
            eventArgs.Cancel = true;
            cancellation.Cancel();
        };
        Console.CancelKeyPress += cancelHandler;

        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        var uploader = new RuntimeUploader(store, store, new RuntimeApiClient(httpClient));
        var uploadLoop = credential is null
            ? Task.CompletedTask
            : UploadLoopAsync(
                uploader,
                credential,
                log,
                TimeSpan.FromSeconds(settings.UploadIntervalSeconds),
                cancellation.Token);
        var eventSource = new WindowsRuntimeEventSource(
            new WindowsRuntimeProbe(),
            idleThreshold: TimeSpan.FromSeconds(settings.IdleThresholdSeconds),
            pollInterval: TimeSpan.FromMilliseconds(settings.PollIntervalMilliseconds),
            snapshotInterval: TimeSpan.FromSeconds(settings.SnapshotIntervalSeconds));
        var machine = new RuntimeStateMachine($"windows:{Guid.NewGuid():N}");

        await log.WriteAsync("agent_started", new
        {
            enrolled = credential is not null,
            runtimeSessionID = machine.State.RuntimeSessionID,
        }).ConfigureAwait(false);

        try
        {
            await foreach (var fact in eventSource.FactsAsync(cancellation.Token))
            {
                try
                {
                    var segments = machine.Apply(fact);
                    if (segments.Count > 0)
                    {
                        await store.PersistAndEnqueueAsync(segments, cancellation.Token)
                            .ConfigureAwait(false);
                        await log.WriteAsync("segments_persisted", new
                        {
                            count = segments.Count,
                            ids = segments.Select(segment => segment.Id).ToArray(),
                        }).ConfigureAwait(false);
                    }
                }
                catch (RuntimeTransitionException exception)
                {
                    await log.WriteAsync("fact_rejected", new { exception.Code })
                        .ConfigureAwait(false);
                }
            }
        }
        catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
        {
        }
        finally
        {
            cancellation.Cancel();
            await CloseOpenSegmentAsync(machine, store, log).ConfigureAwait(false);
            try
            {
                await uploadLoop.ConfigureAwait(false);
            }
            catch (OperationCanceledException) when (cancellation.IsCancellationRequested)
            {
            }

            Console.CancelKeyPress -= cancelHandler;
            await log.WriteAsync("agent_stopped", new
            {
                runtimeSessionID = machine.State.RuntimeSessionID,
            }).ConfigureAwait(false);
        }

        return 0;
    }

    private static async Task CloseOpenSegmentAsync(
        RuntimeStateMachine machine,
        SqliteSegmentStore store,
        RuntimeDiagnosticLog log)
    {
        var nowMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var observedAtMs = Math.Max(nowMs, machine.State.LastObservedAtMs ?? 0);
        var segments = machine.Apply(new RuntimeFact
        {
            ObservedAtMs = observedAtMs,
            Kind = RuntimeFactKind.SessionChanged,
            SessionState = UserSessionState.Inactive,
        });
        if (segments.Count > 0)
        {
            await store.PersistAndEnqueueAsync(segments).ConfigureAwait(false);
            await log.WriteAsync("shutdown_segments_persisted", new
            {
                count = segments.Count,
                ids = segments.Select(segment => segment.Id).ToArray(),
            }).ConfigureAwait(false);
        }
    }

    private static async Task UploadLoopAsync(
        RuntimeUploader uploader,
        RuntimeCredential credential,
        RuntimeDiagnosticLog log,
        TimeSpan interval,
        CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(interval);
        do
        {
            var accepted = await uploader.UploadPendingAsync(
                credential,
                cancellationToken: cancellationToken).ConfigureAwait(false);
            if (accepted > 0)
            {
                await log.WriteAsync("segments_accepted", new { count = accepted })
                    .ConfigureAwait(false);
            }
        }
        while (await timer.WaitForNextTickAsync(cancellationToken).ConfigureAwait(false));
    }

    private static async Task<int> EnrollAsync(string[] args)
    {
        var serverValue = ArgumentValue(args, "--server")
            ?? throw new ArgumentException("enroll requires --server <https-url>.");
        var code = ArgumentValue(args, "--code");
        if (string.IsNullOrWhiteSpace(code))
        {
            Console.Write("Enrollment code: ");
            code = Console.ReadLine();
        }

        if (string.IsNullOrWhiteSpace(code))
        {
            throw new ArgumentException("Enrollment code is required.");
        }

        var serverUrl = new Uri(serverValue, UriKind.Absolute);
        if (serverUrl.Scheme != Uri.UriSchemeHttps && !serverUrl.IsLoopback)
        {
            throw new ArgumentException("Runtime server must use HTTPS except on loopback.");
        }

        using var httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };
        var credential = await new RuntimeApiClient(httpClient).EnrollAsync(
            serverUrl,
            code,
            ArgumentValue(args, "--name") ?? Environment.MachineName).ConfigureAwait(false);
        var paths = RuntimePaths.ForCurrentUser();
        await new DpapiRuntimeCredentialStore(paths.CredentialPath).SaveAsync(credential)
            .ConfigureAwait(false);
        Console.WriteLine($"Enrolled Runtime device {credential.DeviceId}.");
        return 0;
    }

    private static int InstallStartup()
    {
        var executablePath = Environment.ProcessPath
            ?? throw new InvalidOperationException("Unable to resolve agent executable path.");
        new WindowsStartupRegistration().Register(executablePath);
        Console.WriteLine("Current-user startup registration installed.");
        return 0;
    }

    private static int UninstallStartup()
    {
        new WindowsStartupRegistration().Remove();
        Console.WriteLine("Current-user startup registration removed.");
        return 0;
    }

    private static async Task<int> StatusAsync()
    {
        var paths = RuntimePaths.ForCurrentUser();
        var credential = await new DpapiRuntimeCredentialStore(paths.CredentialPath).LoadAsync()
            .ConfigureAwait(false);
        Console.WriteLine(JsonSerializer.Serialize(new
        {
            enrolled = credential is not null,
            deviceId = credential?.DeviceId,
            startupRegistered = new WindowsStartupRegistration().IsRegistered(),
            databaseExists = File.Exists(paths.DatabasePath),
        }));
        return 0;
    }

    private static int Usage()
    {
        Console.Error.WriteLine(
            "Usage: run | enroll --server <url> [--code <code>] [--name <name>] | "
            + "install-startup | uninstall-startup | status");
        return 2;
    }

    private static string? ArgumentValue(IReadOnlyList<string> args, string name)
    {
        for (var index = 0; index < args.Count - 1; index++)
        {
            if (string.Equals(args[index], name, StringComparison.OrdinalIgnoreCase))
            {
                return args[index + 1];
            }
        }

        return null;
    }
}

internal sealed class RuntimeDiagnosticLog
{
    private readonly string path;
    private readonly SemaphoreSlim gate = new(1, 1);

    internal RuntimeDiagnosticLog(string path)
    {
        this.path = path;
        Directory.CreateDirectory(Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("Log path has no directory."));
    }

    internal async Task WriteAsync(string eventName, object details)
    {
        var line = JsonSerializer.Serialize(new
        {
            at = DateTimeOffset.UtcNow,
            eventName,
            details,
        });
        await gate.WaitAsync().ConfigureAwait(false);
        try
        {
            await File.AppendAllTextAsync(path, string.Concat(line, Environment.NewLine))
                .ConfigureAwait(false);
        }
        finally
        {
            _ = gate.Release();
        }
    }
}
