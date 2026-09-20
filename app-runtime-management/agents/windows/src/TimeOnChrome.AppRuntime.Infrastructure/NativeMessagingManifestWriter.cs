using System.Text.Json;

namespace TimeOnChrome.AppRuntime.Infrastructure;

public static class NativeMessagingManifestWriter
{
    public static async Task WriteAsync(
        string directory,
        string executablePath,
        CancellationToken cancellationToken = default)
    {
        Directory.CreateDirectory(directory);
        var fullExecutablePath = Path.GetFullPath(executablePath);
        foreach (var hostId in new[] { BrowserBridgeProtocol.NativeHostId, BrowserBridgeProtocol.LegacyNativeHostId })
        {
            var manifest = new
            {
                name = hostId,
                description = "TimeOnChrome managed browser bridge",
                path = fullExecutablePath,
                type = "stdio",
                allowed_origins = new[] { $"chrome-extension://{BrowserBridgeProtocol.ManagedExtensionId}/" },
            };
            var target = Path.Combine(directory, $"{hostId}.json");
            var temporary = string.Concat(target, ".tmp");
            await File.WriteAllTextAsync(temporary, JsonSerializer.Serialize(manifest, RuntimeJson.Options), cancellationToken)
                .ConfigureAwait(false);
            File.Move(temporary, target, overwrite: true);
        }
    }
}
