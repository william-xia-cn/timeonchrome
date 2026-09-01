using System.Diagnostics;
using System.IO.Pipes;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Infrastructure;
using TimeOnChrome.AppRuntime.Windows;

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
                    new WindowsRuntimeProbe(), TimeSpan.FromMinutes(5),
                    TimeSpan.FromSeconds(1), TimeSpan.FromSeconds(10));
                await foreach (var fact in source.FactsAsync(cancellationToken).ConfigureAwait(false))
                {
                    var message = JsonSerializer.Serialize(new SessionFactMessage(2, fact), RuntimeJson.Options);
                    await writer.WriteLineAsync(message.AsMemory(), cancellationToken).ConfigureAwait(false);
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
