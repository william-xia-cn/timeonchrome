using System.Text.Json;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public sealed record RuntimeAgentSettings(
    int IdleThresholdSeconds = 300,
    int PollIntervalMilliseconds = 1_000,
    int SnapshotIntervalSeconds = 60,
    int UploadIntervalSeconds = 10)
{
    public void Validate()
    {
        if (IdleThresholdSeconds is < 30 or > 86_400
            || PollIntervalMilliseconds is < 250 or > 10_000
            || SnapshotIntervalSeconds is < 10 or > 3_600
            || UploadIntervalSeconds is < 5 or > 3_600)
        {
            throw new InvalidDataException("Runtime agent settings are outside supported ranges.");
        }
    }
}

public sealed class RuntimeAgentSettingsStore
{
    private readonly string path;

    public RuntimeAgentSettingsStore(string path)
    {
        this.path = Path.GetFullPath(path);
    }

    public async Task<RuntimeAgentSettings> LoadOrCreateAsync(
        CancellationToken cancellationToken = default)
    {
        if (File.Exists(path))
        {
            var settings = JsonSerializer.Deserialize<RuntimeAgentSettings>(
                await File.ReadAllBytesAsync(path, cancellationToken).ConfigureAwait(false),
                RuntimeJson.Options)
                ?? throw new InvalidDataException("Runtime agent settings are empty.");
            settings.Validate();
            return settings;
        }

        var defaults = new RuntimeAgentSettings();
        defaults.Validate();
        var directory = Path.GetDirectoryName(path)
            ?? throw new InvalidOperationException("Settings path has no directory.");
        Directory.CreateDirectory(directory);
        await File.WriteAllBytesAsync(
            path,
            JsonSerializer.SerializeToUtf8Bytes(defaults, RuntimeJson.Options),
            cancellationToken).ConfigureAwait(false);
        return defaults;
    }
}
