using System.Text.Json;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public enum RuntimeAgentHealthState
{
    Starting,
    Online,
    Offline,
    RequiresPairing,
}

public sealed record RuntimeAgentHealth(
    string DeviceKey,
    RuntimeAgentHealthState State,
    string AgentVersion,
    long UpdatedAtMs);

public sealed class RuntimeAgentHealthStore
{
    private readonly string path;

    public RuntimeAgentHealthStore(string path)
    {
        this.path = Path.GetFullPath(path);
    }

    public async Task SaveAsync(
        RuntimeAgentHealth health,
        CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(health);
        var directory = Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("Agent health path has no directory.");
        Directory.CreateDirectory(directory);
        var bytes = JsonSerializer.SerializeToUtf8Bytes(health, RuntimeJson.Options);
        var temporaryPath = string.Concat(path, ".tmp");
        await File.WriteAllBytesAsync(temporaryPath, bytes, cancellationToken).ConfigureAwait(false);
        File.Move(temporaryPath, path, overwrite: true);
    }

    public async Task<RuntimeAgentHealth?> LoadAsync(
        CancellationToken cancellationToken = default)
    {
        if (!File.Exists(path)) return null;
        try
        {
            var bytes = await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false);
            return JsonSerializer.Deserialize<RuntimeAgentHealth>(bytes, RuntimeJson.Options);
        }
        catch (JsonException)
        {
            return null;
        }
        catch (IOException)
        {
            return null;
        }
    }
}
