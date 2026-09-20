using System.IO.Pipes;
using System.Text.Json;
using TimeOnChrome.AppRuntime.Infrastructure;

return await NativeHostProgram.RunAsync(Console.OpenStandardInput(), Console.OpenStandardOutput());

internal static class NativeHostProgram
{
    public static async Task<int> RunAsync(
        Stream input,
        Stream output,
        CancellationToken cancellationToken = default)
    {
        while (!cancellationToken.IsCancellationRequested)
        {
            JsonDocument? message;
            try
            {
                message = await NativeMessagingFraming.ReadAsync(input, cancellationToken).ConfigureAwait(false);
            }
            catch (Exception exception) when (exception is InvalidDataException or EndOfStreamException or JsonException)
            {
                await NativeMessagingFraming.WriteAsync(output,
                    new BrowserBridgeResponse(false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                        ErrorCode: "NATIVE_MESSAGE_INVALID"), cancellationToken).ConfigureAwait(false);
                return 2;
            }
            if (message is null) return 0;
            using (message)
            {
                BrowserBridgeEnvelope envelope;
                try
                {
                    envelope = BrowserBridgeProtocol.NormalizeNativeMessage(message.RootElement);
                    BrowserBridgeProtocol.Validate(envelope);
                }
                catch (Exception exception) when (exception is InvalidDataException or JsonException)
                {
                    await NativeMessagingFraming.WriteAsync(output,
                        new BrowserBridgeResponse(false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                            ErrorCode: "NATIVE_ENVELOPE_REJECTED"), cancellationToken).ConfigureAwait(false);
                    continue;
                }

                var response = await ForwardAsync(envelope, cancellationToken).ConfigureAwait(false);
                await NativeMessagingFraming.WriteAsync(output, response, cancellationToken).ConfigureAwait(false);
            }
        }
        return 0;
    }

    private static async Task<BrowserBridgeResponse> ForwardAsync(
        BrowserBridgeEnvelope envelope,
        CancellationToken cancellationToken)
    {
        try
        {
            await using var pipe = BrowserBridgePipeClient.Create();
            await pipe.ConnectAsync(3000, cancellationToken).ConfigureAwait(false);
            using var reader = new StreamReader(pipe, leaveOpen: true);
            using var writer = new StreamWriter(pipe, leaveOpen: true) { AutoFlush = true };
            await writer.WriteLineAsync(JsonSerializer.Serialize(envelope, RuntimeJson.Options)).ConfigureAwait(false);
            var responseLine = await reader.ReadLineAsync(cancellationToken).ConfigureAwait(false);
            return JsonSerializer.Deserialize<BrowserBridgeResponse>(responseLine ?? string.Empty, RuntimeJson.Options)
                ?? new BrowserBridgeResponse(false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                    envelope.RequestId, "SERVICE_RESPONSE_INVALID");
        }
        catch (Exception exception) when (exception is IOException or TimeoutException or OperationCanceledException or JsonException)
        {
            return new BrowserBridgeResponse(false, DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                envelope.RequestId, "RUNTIME_SERVICE_UNAVAILABLE");
        }
    }
}
