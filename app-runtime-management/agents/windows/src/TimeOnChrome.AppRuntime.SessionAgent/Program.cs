using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
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
                var source = new WindowsRuntimeEventSource(
                    new WindowsRuntimeProbe(), TimeSpan.FromSeconds(180),
                    TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(60));
                var projector = new AccountingFactProjectorV2("epoch-0");
                await foreach (var fact in source.FactsAsync(cancellationToken).ConfigureAwait(false))
                {
                    var wallTimeMs = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                    var monotonicTimeMs = Environment.TickCount64;
                    foreach (var accountingFact in projector.Project(fact, wallTimeMs, monotonicTimeMs))
                    {
                        var message = JsonSerializer.Serialize(
                            new SessionAccountingFactMessage(2, accountingFact),
                            RuntimeJson.Options);
                        await writer.WriteLineAsync(message.AsMemory(), cancellationToken).ConfigureAwait(false);
                    }
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
}
